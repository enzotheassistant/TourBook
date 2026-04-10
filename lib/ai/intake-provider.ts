import { AiIntakeImageInput, AiIntakeResponse, AiIntakeRow } from '@/lib/types';

export type IntakeRequestPayload = {
  source_text: string;
  images: AiIntakeImageInput[];
};

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function getProvider() {
  return (process.env.AI_INTAKE_PROVIDER || 'gemini').trim().toLowerCase();
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getGeminiModel() {
  return process.env.AI_INTAKE_MODEL || 'gemini-2.5-flash';
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asConfidence(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return 0;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => asText(item)).filter(Boolean);
}

function normalizeScheduleItems(value: unknown) {
  if (!Array.isArray(value)) return [] as { label: string; time: string }[];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const label = asText(record.label);
      const time = asText(record.time);
      if (!label && !time) return null;
      return { label, time };
    })
    .filter((item): item is { label: string; time: string } => Boolean(item))
    .slice(0, 8);
}

function normalizeRow(row: unknown): AiIntakeRow | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const scheduleItems = normalizeScheduleItems(record.schedule_items);
  const normalized: AiIntakeRow = {
    id: crypto.randomUUID(),
    date: asText(record.date),
    city: asText(record.city),
    region: asText(record.region).toUpperCase(),
    venue_name: asText(record.venue_name),
    tour_name: asText(record.tour_name),
    venue_address: asText(record.venue_address),
    dos_name: asText(record.dos_name),
    dos_phone: asText(record.dos_phone),
    parking_load_info: asText(record.parking_load_info),
    hotel_name: asText(record.hotel_name),
    hotel_address: asText(record.hotel_address),
    hotel_notes: asText(record.hotel_notes),
    notes: asText(record.notes),
    schedule_items: scheduleItems,
    include: true,
    confidence: asConfidence(record.confidence),
    flags: asStringArray(record.flags),
  };

  const hasUsefulContent = Boolean(
    normalized.date ||
      normalized.city ||
      normalized.region ||
      normalized.venue_name ||
      normalized.notes ||
      normalized.schedule_items.length,
  );

  return hasUsefulContent ? normalized : null;
}

function normalizeResponse(payload: unknown, model: string): AiIntakeResponse {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const rows = Array.isArray(record.rows) ? record.rows.map(normalizeRow).filter((row): row is AiIntakeRow => Boolean(row)) : [];
  return {
    provider: getProvider(),
    model,
    rows,
  };
}

function buildPrompt(sourceText: string, imageCount: number) {
  return [
    'You are TourBook intake AI.',
    'Your job is to extract touring/show information from messy source material and map it to TourBook draft fields.',
    'Return strict JSON only. No markdown. No prose.',
    'If there are multiple dates, return multiple rows.',
    'Only populate fields that are present or strongly implied. Do not hallucinate.',
    'If a field is uncertain, leave it blank when needed and add a short reason to flags.',
    'Move leftover logistical or deal details into notes instead of polluting city or venue.',
    'Expected schema:',
    JSON.stringify({
      rows: [
        {
          date: 'YYYY-MM-DD or best available raw date string',
          city: '',
          region: '',
          venue_name: '',
          tour_name: '',
          venue_address: '',
          dos_name: '',
          dos_phone: '',
          parking_load_info: '',
          hotel_name: '',
          hotel_address: '',
          hotel_notes: '',
          notes: '',
          schedule_items: [{ label: '', time: '' }],
          confidence: 0.0,
          flags: ['short warning'],
        },
      ],
    }),
    'Schedule lines should map items like Load in, Soundcheck, Doors, Set time, Curfew, etc.',
    'For routing lists, split city and venue like a human tour manager would.',
    `The request may include ${imageCount} image(s). Use them along with text if present.`,
    sourceText ? `Source text:\n${sourceText}` : 'No source text was provided.',
  ].join('\n\n');
}

async function callGemini(payload: IntakeRequestPayload): Promise<AiIntakeResponse> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Set GEMINI_API_KEY in your environment.');
  }

  const model = getGeminiModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts: GeminiPart[] = [{ text: buildPrompt(payload.source_text, payload.images.length) }];

  for (const image of payload.images) {
    parts.push({
      inline_data: {
        mime_type: image.mime_type,
        data: image.data_base64,
      },
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
    cache: 'no-store',
  });

  const json = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message || 'Gemini request failed.');
  }

  const text = stripCodeFence(
    json.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text || '')
      .join('') || '',
  );

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned invalid JSON.');
  }

  return normalizeResponse(parsed, model);
}

export async function runAiIntake(payload: IntakeRequestPayload): Promise<AiIntakeResponse> {
  const provider = getProvider();
  if (provider !== 'gemini') {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  return callGemini(payload);
}
