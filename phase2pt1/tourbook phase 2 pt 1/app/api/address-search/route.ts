import { NextRequest, NextResponse } from 'next/server';
import { AddressSuggestion } from '@/lib/types';

function tokenize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreSuggestion(suggestion: AddressSuggestion, cityQuery: string, preferredCountry: string) {
  let score = 0;
  const haystack = [suggestion.label, suggestion.city || '', suggestion.region || ''].join(' ').toLowerCase();
  const preferred = preferredCountry.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (preferred.includes((suggestion.country || '').toUpperCase())) score += 40;
  if (suggestion.country === 'CA' || suggestion.country === 'US') score += 12;
  for (const token of tokenize(cityQuery)) {
    if (haystack.includes(token)) score += 10;
  }
  return score;
}

async function fetchSuggestions({ query, token, country, limit }: { query: string; token: string; country?: string; limit: number }) {
  const endpoint = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('access_token', token);
  endpoint.searchParams.set('autocomplete', 'true');
  endpoint.searchParams.set('limit', String(limit));
  endpoint.searchParams.set('language', 'en');
  if (country) endpoint.searchParams.set('country', country.toLowerCase());

  const response = await fetch(endpoint.toString(), { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json() as { features?: Array<{ id: string; properties?: { full_address?: string; place_formatted?: string; context?: { country?: { country_code?: string; name?: string }; region?: { region_code?: string; name?: string }; place?: { name?: string }; locality?: { name?: string } } } }> };

  return (payload.features ?? []).map((feature) => {
    const address = feature.properties?.full_address ?? feature.properties?.place_formatted ?? query;
    const context = feature.properties?.context;
    const countryCode = context?.country?.country_code?.toUpperCase() || '';
    const region = context?.region?.region_code?.split('-').pop() || context?.region?.name || '';
    const city = context?.place?.name || context?.locality?.name || '';
    return {
      id: feature.id,
      label: address,
      address,
      maps_url: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
      country: countryCode,
      region,
      city,
    } satisfies AddressSuggestion;
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const cityQuery = request.nextUrl.searchParams.get('city')?.trim() ?? '';
  const preferredCountry = request.nextUrl.searchParams.get('preferredCountry')?.trim() || 'CA,US';
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!query || query.length < 3 || !token) {
    return NextResponse.json([] satisfies AddressSuggestion[]);
  }

  const boostedQuery = cityQuery ? `${query} ${cityQuery}` : query;
  const preferredPromise = fetchSuggestions({ query: boostedQuery, token, country: preferredCountry, limit: 6 });
  const globalPromise = fetchSuggestions({ query: boostedQuery, token, limit: 8 });
  const plainGlobalPromise = cityQuery ? fetchSuggestions({ query, token, limit: 6 }) : Promise.resolve([] as AddressSuggestion[]);

  const [preferredResults, globalResults, plainGlobalResults] = await Promise.all([preferredPromise, globalPromise, plainGlobalPromise]);
  const merged = new Map<string, AddressSuggestion>();
  [...preferredResults, ...globalResults, ...plainGlobalResults].forEach((item) => {
    if (!merged.has(item.id)) merged.set(item.id, item);
  });

  const suggestions = Array.from(merged.values()).sort((a, b) => scoreSuggestion(b, cityQuery, preferredCountry) - scoreSuggestion(a, cityQuery, preferredCountry));
  return NextResponse.json(suggestions.slice(0, 5));
}
