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
  const [manualMode, setManualMode] = useState(false);
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
        const response = await fetch(`/api/address-search?q=${encodeURIComponent(value)}`, {
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
  }, [lookupEnabled, value]);

  function selectSuggestion(suggestion: AddressSuggestion) {
    onAddressChange(suggestion.address);
    onMapsUrlChange(suggestion.maps_url);
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
