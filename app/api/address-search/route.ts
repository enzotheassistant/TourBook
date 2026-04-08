import { NextRequest, NextResponse } from 'next/server';
import { AddressSuggestion } from '@/lib/types';

function tokenize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreSuggestion(label: string, countryCode: string, cityQuery: string, preferredCountry: string) {
  let score = 0;
  const normalized = label.toLowerCase();
  const preferred = preferredCountry.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (preferred.includes(countryCode)) score += 40;
  if (countryCode === 'CA' || countryCode === 'US') score += 10;
  for (const token of tokenize(cityQuery)) {
    if (normalized.includes(token)) score += 8;
  }
  return score;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const cityQuery = request.nextUrl.searchParams.get('city')?.trim() ?? '';
  const preferredCountry = request.nextUrl.searchParams.get('preferredCountry')?.trim() || 'CA,US';
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!query || query.length < 3 || !token) {
    return NextResponse.json([] satisfies AddressSuggestion[]);
  }

  const endpoint = new URL(`https://api.mapbox.com/search/geocode/v6/forward`);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('access_token', token);
  endpoint.searchParams.set('autocomplete', 'true');
  endpoint.searchParams.set('limit', '12');
  endpoint.searchParams.set('language', 'en');

  const response = await fetch(endpoint.toString(), { cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json([] satisfies AddressSuggestion[]);
  }

  const payload = await response.json() as { features?: Array<{ id: string; properties?: { full_address?: string; place_formatted?: string; context?: { country?: { country_code?: string; name?: string }; region?: { region_code?: string; name?: string }; place?: { name?: string }; locality?: { name?: string } } } }> };

  const suggestions: AddressSuggestion[] = (payload.features ?? []).map((feature) => {
    const address = feature.properties?.full_address ?? feature.properties?.place_formatted ?? query;
    const context = feature.properties?.context;
    const country = context?.country?.country_code?.toUpperCase() || '';
    const region = context?.region?.region_code?.split('-').pop() || context?.region?.name || '';
    const city = context?.place?.name || context?.locality?.name || '';
    return {
      id: feature.id,
      label: address,
      address,
      maps_url: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
      country,
      region,
      city,
    };
  }).sort((a, b) => scoreSuggestion(b.label, b.country || '', cityQuery, preferredCountry) - scoreSuggestion(a.label, a.country || '', cityQuery, preferredCountry));

  return NextResponse.json(suggestions.slice(0, 5));
}
