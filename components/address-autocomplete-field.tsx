
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AddressSuggestion } from '@/lib/types';

const DEFAULT_BIAS = 'CA,US';
const STORAGE_KEY = 'tourbook_address_bias_v1';

type BiasState = {
  preferredCountry: string;
  streakCountry: string | null;
  streakCount: number;
};

function readBiasState(): BiasState {
  if (typeof window === 'undefined') return { preferredCountry: DEFAULT_BIAS, streakCountry: null, streakCount: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { preferredCountry: DEFAULT_BIAS, streakCountry: null, streakCount: 0 };
    const parsed = JSON.parse(raw) as Partial<BiasState>;
    return { preferredCountry: parsed.preferredCountry || DEFAULT_BIAS, streakCountry: parsed.streakCountry || null, streakCount: parsed.streakCount || 0 };
  } catch {
    return { preferredCountry: DEFAULT_BIAS, streakCountry: null, streakCount: 0 };
  }
}

function writeBiasState(state: BiasState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function AddressAutocompleteField({
  label,
  value,
  mapsUrl,
  city = '',
  region = '',
  onAddressChange,
  onMapsUrlChange,
  onRegionDetected,
  onCountryDetected,
}: {
  label: string;
  value: string;
  mapsUrl: string;
  city?: string;
  region?: string;
  onAddressChange: (value: string) => void;
  onMapsUrlChange: (value: string) => void;
  onRegionDetected?: (value: string) => void;
  onCountryDetected?: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [preferredCountry, setPreferredCountry] = useState(DEFAULT_BIAS);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPreferredCountry(readBiasState().preferredCountry || DEFAULT_BIAS);
  }, []);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    function handlePointerDown(event: MouseEvent) {
      if (target && !target.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const cityQuery = useMemo(() => [city.trim(), region.trim()].filter(Boolean).join(', '), [city, region]);

  useEffect(() => {
    if (!lookupEnabled) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: value, preferredCountry });
        if (cityQuery) params.set('city', cityQuery);
        const response = await fetch(`/api/address-search?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = (await response.json()) as AddressSuggestion[];
        setSuggestions(payload);
        setOpen(payload.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lookupEnabled, value, preferredCountry, cityQuery]);

  function rememberSelection(suggestion: AddressSuggestion) {
    const country = suggestion.country?.toUpperCase();
    if (!country) return;
    if (country === 'CA' || country === 'US') {
      const nextState = { preferredCountry: DEFAULT_BIAS, streakCountry: null, streakCount: 0 };
      writeBiasState(nextState);
      setPreferredCountry(nextState.preferredCountry);
      return;
    }
    const current = readBiasState();
    const nextCount = current.streakCountry === country ? current.streakCount + 1 : 1;
    const nextState = {
      preferredCountry: nextCount >= 2 ? country : current.preferredCountry || DEFAULT_BIAS,
      streakCountry: country,
      streakCount: nextCount,
    };
    writeBiasState(nextState);
    setPreferredCountry(nextState.preferredCountry);
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    onAddressChange(suggestion.address);
    onMapsUrlChange(suggestion.maps_url);
    if (suggestion.region && onRegionDetected && !region.trim()) onRegionDetected(suggestion.region);
    if (suggestion.country && onCountryDetected) onCountryDetected(suggestion.country.toUpperCase());
    rememberSelection(suggestion);
    setSuggestions([]);
    setOpen(false);
    setLookupEnabled(false);
    setManualMode(false);
  }

  function revealManualLink() {
    setManualMode(true);
    setOpen(false);
    setLookupEnabled(false);
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block">{label}</span>
        <input
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            onAddressChange(nextValue);
            setLookupEnabled(Boolean(nextValue));
            if (!nextValue) {
              onMapsUrlChange('');
              setManualMode(false);
            }
          }}
          onFocus={() => {
            if (lookupEnabled && value.trim().length >= 3 && suggestions.length > 0) {
              setOpen(true);
            }
          }}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
          placeholder="Start typing an address"
        />
      </label>

      {open ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
              className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200 last:border-b-0"
            >
              {suggestion.label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              revealManualLink();
            }}
            className="block w-full px-4 py-3 text-left text-sm text-emerald-300"
          >
            + Enter address / link manually
          </button>
        </div>
      ) : null}

      {manualMode ? (
        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block">Manual maps link</span>
          <input
            value={mapsUrl}
            onChange={(event) => onMapsUrlChange(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-white/20"
            placeholder="https://maps.google.com/..."
          />
        </label>
      ) : mapsUrl ? (
        <button
          type="button"
          onClick={revealManualLink}
          className="text-xs text-zinc-500 transition hover:text-zinc-300"
        >
          Edit map link
        </button>
      ) : null}

      {!mapsUrl && value ? <p className="text-xs text-zinc-500">Address will stay plain text until you select a suggestion or add a manual link.</p> : null}
    </div>
  );
}
