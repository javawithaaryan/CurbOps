'use client';

// ---------------------------------------------------------------------------
// CausaFlow AI — MapSearch
// Free-text place search with autocomplete, scoped to Bengaluru / Karnataka.
//
// Typing "Cha" surfaces matches like "Chamarajpet", "Chamarajanagara", etc.
// Powered by Nominatim (OpenStreetMap) — no API key required, CORS-enabled.
// A bounding-box `viewbox` around greater Bengaluru biases results locally
// while `countrycodes=in` keeps matches inside India. We request structured
// address parts so the dropdown shows clean "Name · Type · District" lines.
//
// Debounce: 350ms — avoids hammering Nominatim on every keystroke and
// respects their <1 req/s usage policy.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

export interface PlaceResult {
  placeId: number;
  lat: number;
  lon: number;
  label: string;        // primary name
  detail: string;       // secondary line (type / district)
}

interface MapSearchProps {
  onSelect: (place: PlaceResult) => void;
  onOpenChange?: (open: boolean) => void;
}

// Greater-Bengaluru bias box (left, top, right, bottom in lon/lat).
// Nominatim wants `<lon1>,<lat1>,<lon2>,<lat2>`.
const BENGALURU_VIEWBOX = '77.40,13.10,77.85,12.80';
const DEBOUNCE_MS = 350;

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  addresstype?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    district?: string;
    state_district?: string;
    state?: string;
  };
}

function buildLabel(r: NominatimResult): { label: string; detail: string } {
  // Prefer the short `name` field, then fall back to the first comma chunk
  // of display_name — that's the most specific part of the address.
  const name = (r.name && r.name.trim()) || r.display_name.split(',')[0].trim();
  const a = r.address || {};
  // Detail line: neighbourhood/suburb → district → state.
  const detail = [
    a.neighbourhood || a.suburb || a.road,
    a.district || a.state_district,
    a.state,
  ]
    .filter(Boolean)
    .join(' · ');
  const typeStr = r.addresstype || r.type;
  return {
    label: name || r.display_name,
    detail: detail || (typeStr ? typeStr.replace(/_/g, ' ') : ''),
  };
}

export default function MapSearch({ onSelect, onOpenChange }: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0); // races: ignore stale fetches
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search. Only fires once the user pauses typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const url =
          'https://nominatim.openstreetmap.org/search?' +
          new URLSearchParams({
            q,
            format: 'json',
            addressdetails: '1',
            limit: '8',
            countrycodes: 'in',
            viewbox: BENGALURU_VIEWBOX,
            bounded: '0', // bias, don't hard-restrict (so Chamarajanagara still shows)
          }).toString();
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data = (await res.json()) as NominatimResult[];
        if (id !== reqId.current) return; // a newer query superseded us
        const mapped: PlaceResult[] = data.map((r) => {
          const { label, detail } = buildLabel(r);
          return {
            placeId: r.place_id,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            label,
            detail,
          };
        });
        setResults(mapped);
        setActiveIndex(mapped.length > 0 ? 0 : -1);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when clicking outside the search box.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = (place: PlaceResult) => {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || (results.length === 0 && !loading)) {
      if (e.key === 'ArrowDown' && results.length > 0) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && (query.trim().length >= 2);

  useEffect(() => {
    onOpenChange?.(showDropdown);
  }, [showDropdown, onOpenChange]);

  return (
    <div ref={boxRef} className="map-search-wrap">
      <div className="map-search-input-row">
        <svg
          className="map-search-icon"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M11 11 L14 14"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <input
          className="map-search-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search a place — e.g. Chamarajpet, Majestic, Indiranagar…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion registers before we close.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          aria-label="Search places on map"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="map-search-listbox"
          role="combobox"
        />
        {query && (
          <button
            type="button"
            className="map-search-clear"
            onClick={() => {
              setQuery('');
              setResults([]);
              setActiveIndex(-1);
              setOpen(false);
            }}
            title="Clear search"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
              <path
                d="M3 3 L9 9 M9 3 L3 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        {loading && <span className="map-search-spinner" aria-hidden />}
      </div>

      {showDropdown && (
        <ul id="map-search-listbox" role="listbox" className="map-search-list">
          {error && (
            <li className="map-search-empty map-search-error">
              ⚠ {error}. Retype to retry.
            </li>
          )}
          {!error && loading && results.length === 0 && (
            <li className="map-search-empty">Searching places…</li>
          )}
          {!error && !loading && results.length === 0 && (
            <li className="map-search-empty">
              No places match &ldquo;{query.trim()}&rdquo;.
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={r.placeId}
              role="option"
              aria-selected={i === activeIndex}
              className={`map-search-item ${i === activeIndex ? 'active' : ''}`}
              onMouseDown={(e) => {
                // mousedown fires before blur → keep focus behaviour clean
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="map-search-pin" aria-hidden>
                <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
                  <path
                    d="M6 1 C3.8 1 2 2.7 2 4.8 C2 7.6 6 11 6 11 C6 11 10 7.6 10 4.8 C10 2.7 8.2 1 6 1 Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <circle cx="6" cy="4.8" r="1.3" fill="currentColor" />
                </svg>
              </span>
              <span className="map-search-text">
                <span className="map-search-label">{r.label}</span>
                {r.detail && (
                  <span className="map-search-detail">{r.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
