import { IntakeImageInput, IntakeRequest, IntakeResult, IntakeRow } from '@/lib/ai/intake-types';
import { backfillScheduleItemsFromSourceText } from '@/lib/ai/schedule-fallback';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPrimaryProvider() {
  return (process.env.AI_INTAKE_PROVIDER || 'gemini').trim().toLowerCase();
}

function getTextModel() {
  return process.env.AI_INTAKE_TEXT_MODEL?.trim() || 'gemini-2.5-flash-lite';
}

function getImageModel() {
  return process.env.AI_INTAKE_IMAGE_MODEL?.trim() || 'gemini-2.5-flash';
}

function getFallbackProvider() {
  return (process.env.AI_INTAKE_FALLBACK_PROVIDER || 'none').trim().toLowerCase();
}

function getOpenRouterModel() {
  return process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free';
}

function getOpenRouterSiteUrl() {
  return process.env.OPENROUTER_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://tourbook.local';
}

function getOpenRouterSiteName() {
  return process.env.OPENROUTER_SITE_NAME?.trim() || 'TourBook';
}

function buildSystemPrompt(existingShows: IntakeRequest['existingShows']) {
  const duplicatesContext = (existingShows || [])
    .slice(0, 200)
    .map((show) => `${show.date} | ${show.city} | ${show.venue_name} | ${show.status || 'published'}`)
    .join('\n');

  return [
    'You are TourBook AI Intake. Extract only show-related data and return strict JSON.',
    'Map unstructured routing lists, promoter emails, screenshots, posters, and spreadsheet-like text into TourBook draft rows.',
    'Never invent facts. If uncertain, leave the field blank or move details into notes. Use flags for uncertainty.',
    'Keep dates in YYYY-MM-DD when possible. If year is omitted: use the current year when that month/day is still upcoming this year; only roll to next year when the current-year month/day is already past today. Do not roll all omitted-year dates to next year.',
    'Schedule items must be an array of objects with label and time. Only include meaningful schedule data.',
    'When source text contains a multi-line schedule/timeline, preserve every distinct schedule line that has a usable time. Do not collapse a full schedule down to only 1-2 anchor items.',
    'Potential duplicate warnings should go in flags, not by altering other fields.',
    'If the input is a routing list, create one row per date.',
    duplicatesContext ? `Existing shows for duplicate awareness:\n${duplicatesContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function responseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      rows: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING' },
            city: { type: 'STRING' },
            region: { type: 'STRING' },
            venue_name: { type: 'STRING' },
            tour_name: { type: 'STRING' },
            venue_address: { type: 'STRING' },
            dos_name: { type: 'STRING' },
            dos_phone: { type: 'STRING' },
            parking_load_info: { type: 'STRING' },
            schedule_items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  label: { type: 'STRING' },
                  time: { type: 'STRING' },
                },
              },
            },
            hotel_name: { type: 'STRING' },
            hotel_address: { type: 'STRING' },
            hotel_notes: { type: 'STRING' },
            notes: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
            flags: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          propertyOrdering: [
            'date',
            'city',
            'region',
            'venue_name',
            'tour_name',
            'venue_address',
            'dos_name',
            'dos_phone',
            'parking_load_info',
            'schedule_items',
            'hotel_name',
            'hotel_address',
            'hotel_notes',
            'notes',
            'confidence',
            'flags',
          ],
        },
      },
      warnings: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    propertyOrdering: ['rows', 'warnings'],
  };
}

function extractGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part: any) => part?.text || '').join('');
  return text.trim();
}

function safeParseJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('AI returned an empty response.');

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('AI returned invalid JSON.');
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRow(row: any): IntakeRow {
  const schedule = Array.isArray(row?.schedule_items)
    ? row.schedule_items
        .map((item: any) => ({ label: normalizeString(item?.label), time: normalizeString(item?.time) }))
        .filter((item: { label: string; time: string }) => item.label || item.time)
    : [];

  return {
    date: normalizeString(row?.date),
    city: normalizeString(row?.city),
    region: normalizeString(row?.region).toUpperCase(),
    venue_name: normalizeString(row?.venue_name),
    tour_name: normalizeString(row?.tour_name),
    venue_address: normalizeString(row?.venue_address),
    dos_name: normalizeString(row?.dos_name),
    dos_phone: normalizeString(row?.dos_phone),
    parking_load_info: normalizeString(row?.parking_load_info),
    schedule_items: schedule,
    hotel_name: normalizeString(row?.hotel_name),
    hotel_address: normalizeString(row?.hotel_address),
    hotel_notes: normalizeString(row?.hotel_notes),
    notes: normalizeString(row?.notes),
    confidence: typeof row?.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : undefined,
    flags: Array.isArray(row?.flags) ? row.flags.map((flag: unknown) => normalizeString(flag)).filter(Boolean) : [],
  };
}

function normalizeResult(payload: any, provider: string, model: string, attempts = 1): IntakeResult {
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
        .map(normalizeRow)
        .filter((row: IntakeRow) => row.date || row.city || row.venue_name || row.notes)
    : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings.map((item: unknown) => normalizeString(item)).filter(Boolean) : [];

  return {
    rows,
    warnings,
    provider,
    model,
    attempts,
  };
}

function repairScheduleCoverage(result: IntakeResult, request: IntakeRequest): IntakeResult {
  const repairedRows = backfillScheduleItemsFromSourceText(result.rows, request.text);
  if (repairedRows === result.rows) return result;

  return {
    ...result,
    rows: repairedRows,
    warnings: [...(result.warnings ?? []), 'Recovered additional schedule lines directly from the pasted source text.'],
  };
}

function buildUserParts(request: IntakeRequest) {
  const parts: Array<Record<string, unknown>> = [];
  const text = request.text?.trim();

  if (text) {
    parts.push({ text: `Source text:\n${text}` });
  }

  (request.images || []).forEach((image, index) => {
    parts.push({ text: `Image ${index + 1}${image.name ? ` (${image.name})` : ''}` });
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.dataBase64 } });
  });

  if (!parts.length) {
    parts.push({ text: 'No usable source material was provided.' });
  }

  return parts;
}

async function callGemini(request: IntakeRequest, model: string): Promise<IntakeResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const endpoint = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(request.existingShows) }],
    },
    contents: [
      {
        role: 'user',
        parts: buildUserParts(request),
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: responseSchema(),
    },
  };

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = await response.json();
      const text = extractGeminiText(payload);
      const parsed = safeParseJson(text);
      return normalizeResult(parsed, 'gemini', model, attempt);
    }

    const errorPayload = await response.json().catch(() => ({}));
    const providerMessage = errorPayload?.error?.message || `Gemini request failed (${response.status}).`;
    const isRetryable = response.status === 429 || response.status === 503 || /high demand|overloaded|resource exhausted|try again later/i.test(providerMessage);

    if (!isRetryable || attempt === maxAttempts) {
      throw new Error(providerMessage);
    }

    lastError = new Error(providerMessage);
    await sleep(600 * 2 ** (attempt - 1));
  }

  throw lastError || new Error('Gemini request failed.');
}

function buildOpenRouterMessages(request: IntakeRequest) {
  const userContent: Array<Record<string, unknown>> = [];
  const text = request.text?.trim();

  if (text) {
    userContent.push({ type: 'text', text: `Source text:\n${text}` });
  }

  (request.images || []).forEach((image: IntakeImageInput, index) => {
    userContent.push({ type: 'text', text: `Image ${index + 1}${image.name ? ` (${image.name})` : ''}` });
    userContent.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` } });
  });

  if (!userContent.length) {
    userContent.push({ type: 'text', text: 'No usable source material was provided.' });
  }

  return [
    { role: 'system', content: buildSystemPrompt(request.existingShows) },
    { role: 'user', content: userContent },
  ];
}

async function callOpenRouter(request: IntakeRequest, model: string): Promise<IntakeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': getOpenRouterSiteUrl(),
      'X-Title': getOpenRouterSiteName(),
    },
    body: JSON.stringify({
      model,
      messages: buildOpenRouterMessages(request),
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tourbook_ai_intake',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    city: { type: 'string' },
                    region: { type: 'string' },
                    venue_name: { type: 'string' },
                    tour_name: { type: 'string' },
                    venue_address: { type: 'string' },
                    dos_name: { type: 'string' },
                    dos_phone: { type: 'string' },
                    parking_load_info: { type: 'string' },
                    schedule_items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string' },
                          time: { type: 'string' },
                        },
                        additionalProperties: false,
                      },
                    },
                    hotel_name: { type: 'string' },
                    hotel_address: { type: 'string' },
                    hotel_notes: { type: 'string' },
                    notes: { type: 'string' },
                    confidence: { type: 'number' },
                    flags: { type: 'array', items: { type: 'string' } },
                  },
                  additionalProperties: false,
                },
              },
              warnings: { type: 'array', items: { type: 'string' } },
            },
            required: ['rows'],
            additionalProperties: false,
          },
        },
      },
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenRouter request failed (${response.status}).`;
    throw new Error(message);
  }

  const text = payload?.choices?.[0]?.message?.content;
  const parsed = safeParseJson(typeof text === 'string' ? text : JSON.stringify(text ?? {}));
  return normalizeResult(parsed, 'openrouter', payload?.model || model, 1);
}

export async function runIntake(request: IntakeRequest): Promise<IntakeResult> {
  const hasImages = Boolean(request.images?.length);
  const primaryProvider = getPrimaryProvider();
  const fallbackProvider = getFallbackProvider();
  const primaryModel = hasImages ? getImageModel() : getTextModel();

  try {
    if (primaryProvider === 'openrouter') {
      return repairScheduleCoverage(await callOpenRouter(request, getOpenRouterModel()), request);
    }

    return repairScheduleCoverage(await callGemini(request, primaryModel), request);
  } catch (primaryError) {
    if (fallbackProvider === 'openrouter' && primaryProvider !== 'openrouter' && process.env.OPENROUTER_API_KEY) {
      const fallback = repairScheduleCoverage(await callOpenRouter(request, getOpenRouterModel()), request);
      return {
        ...fallback,
        warnings: [...(fallback.warnings || []), `Primary ${primaryProvider} request failed and fallback ${fallback.provider} was used.`],
      };
    }

    throw primaryError;
  }
}
