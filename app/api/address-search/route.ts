import { NextRequest, NextResponse } from 'next/server';
import { AddressSuggestion } from '@/lib/types';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!query || query.length < 3 || !token) {
    return NextResponse.json([] satisfies AddressSuggestion[]);
  }

  const endpoint = new URL(`https://api.mapbox.com/search/geocode/v6/forward`);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('access_token', token);
  endpoint.searchParams.set('autocomplete', 'true');
  endpoint.searchParams.set('limit', '5');

  const response = await fetch(endpoint.toString(), { cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json([] satisfies AddressSuggestion[]);
  }

  const payload = await response.json() as { features?: Array<{ id: string; properties?: { full_address?: string; place_formatted?: string }; geometry?: { coordinates?: [number, number] } }> };

  const suggestions: AddressSuggestion[] = (payload.features ?? []).map((feature) => {
    const address = feature.properties?.full_address ?? feature.properties?.place_formatted ?? query;
    return {
      id: feature.id,
      label: address,
      address,
      maps_url: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
    };
  });

  return NextResponse.json(suggestions);
}
