'use client';

import { useEffect, useRef, useState } from 'react';
import { AddressSuggestion } from '@/lib/types';

export function AddressAutocompleteField({
  label,
  value,
  mapsUrl,
  onAddressChange,
  onMapsUrlChange,
}: {
  label: string;
  value: string;
  mapsUrl: string;
  onAddressChange: (value: string) => void;
  onMapsUrlChange: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(Boolean(mapsUrl));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/address-search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = (await response.json()) as AddressSuggestion[];
        setSuggestions(payload);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function selectSuggestion(suggestion: AddressSuggestion) {
    onAddressChange(suggestion.address);
    onMapsUrlChange(suggestion.maps_url);
    setOpen(false);
    setManualMode(false);
  }

  function revealManualLink() {
    setManualMode(true);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block">{label}</span>
        <input
          value={value}
          onChange={(event) => {
            onAddressChange(event.target.value);
            if (!event.target.value) {
              onMapsUrlChange('');
            }
          }}
          onFocus={() => value.trim().length >= 3 && setOpen(true)}
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
              onClick={() => selectSuggestion(suggestion)}
              className="block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-zinc-200 last:border-b-0"
            >
              {suggestion.label}
            </button>
          ))}
          <button
            type="button"
            onClick={revealManualLink}
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
      ) : null}

      {!mapsUrl && value ? <p className="text-xs text-zinc-500">Address will stay plain text until you select a suggestion or add a manual link.</p> : null}
    </div>
  );
}
