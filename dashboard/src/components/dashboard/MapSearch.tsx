'use client';

// ---------------------------------------------------------------------------
// CurbOps — MapSearch
// Operations console search component with autocomplete over Bengaluru enforcement zones.
// Supports collapsed and expanded states, universal command indexing (Stations, Zones,
// Areas, Junctions, Landmarks, Routes), keyboard navigation, relevance ranking,
// and state clearing when ALL STATIONS filter is chosen.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useMemo } from 'react';
import type { Zone } from '@/lib/dashboard/types';
import { getJunctionDisplayName } from '@/lib/dashboard/tiers';

export interface PlaceResult {
  placeId: number;
  lat: number;
  lon: number;
  label: string;        // primary name
  detail: string;       // secondary line
  zone: Zone;           // reference to full zone object
}

interface MapSearchProps {
  zones: Zone[];
  onSelect: (place: PlaceResult) => void;
  onSelectStation?: (station: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  theme?: 'header' | 'map';
  stationFilter?: string;
  placeResult?: PlaceResult | null;
}

interface SearchItem {
  id: string;
  type: 'station_id' | 'station_name' | 'area' | 'landmark' | 'junction' | 'zone' | 'route';
  label: string;
  entityType: string;
  detail: string;
  icon: string;
  zone: Zone;
  lat: number;
  lon: number;
  stationName?: string;
}

interface RecentSearchItem {
  type: string;
  id: string;
  label: string;
  detail?: string;
}

function highlightText(text: string, query: string, isLight: boolean) {
  if (!query.trim()) {
    return <span className={isLight ? 'text-slate-800' : 'text-[#DDE8FF]'}>{text}</span>;
  }
  const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <span className={isLight ? 'text-slate-800' : 'text-[#DDE8FF]'}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-blue-500/20 text-blue-600 font-semibold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export default function MapSearch({ 
  zones, 
  onSelect, 
  onSelectStation, 
  onOpenChange,
  open: controlledOpen,
  setOpen: controlledSetOpen,
  theme = 'map',
  stationFilter,
  placeResult
}: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [localOpen, setLocalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : localOpen;
  const setOpen = (val: boolean) => {
    if (controlledSetOpen) {
      controlledSetOpen(val);
    } else {
      setLocalOpen(val);
    }
    onOpenChange?.(val);
  };

  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  const boxRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-clear query on global reset (when stationFilter === 'ALL' and placeResult === null)
  useEffect(() => {
    if (stationFilter === 'ALL' && !placeResult) {
      setQuery('');
      setActiveIndex(-1);
    }
  }, [stationFilter, placeResult]);

  // Load recent searches
  useEffect(() => {
    const saved = localStorage.getItem('curbops_recent_searches_v3');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save to recent searches
  const saveRecentSearch = (item: RecentSearchItem) => {
    const updated = [item, ...recentSearches.filter((x) => !(x.type === item.type && x.id === item.id))].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('curbops_recent_searches_v3', JSON.stringify(updated));
  };

  // Build searchable index of all entities (Station ID, PS name, Zone, Area, Junction, Landmark, Route)
  const searchIndex = useMemo(() => {
    const items: SearchItem[] = [];
    const seen = new Set<string>();

    zones.forEach((z) => {
      // 1. Station ID (e.g. BTP057)
      const stationId = `BTP${String(z.zone_id).padStart(3, '0')}`;
      const stIdKey = `stationid-${z.zone_id}`;
      if (!seen.has(stIdKey)) {
        seen.add(stIdKey);
        items.push({
          id: stIdKey,
          type: 'station_id',
          label: stationId,
          entityType: 'Police Station',
          detail: getJunctionDisplayName(z),
          icon: '🚓',
          zone: z,
          lat: z.centroid_lat,
          lon: z.centroid_lon,
        });
      }

      // 2. Police Station Name
      const psName = z.police_station;
      const psKey = `ps-${psName.toLowerCase()}`;
      if (!seen.has(psKey)) {
        seen.add(psKey);
        items.push({
          id: psKey,
          type: 'station_name',
          label: `${psName} Police Station`,
          entityType: 'Police Station',
          detail: `BTP${String(z.zone_id).padStart(3, '0')}`,
          icon: '🚓',
          zone: z,
          lat: z.centroid_lat,
          lon: z.centroid_lon,
          stationName: psName,
        });
      }

      // 3. Zone (#284)
      const zoneKey = `zone-${z.zone_id}`;
      if (!seen.has(zoneKey)) {
        seen.add(zoneKey);
        items.push({
          id: zoneKey,
          type: 'zone',
          label: `Zone #${z.zone_id}`,
          entityType: 'Zone',
          detail: z.dominant_junction || 'Unnamed Cluster',
          icon: '⚠',
          zone: z,
          lat: z.centroid_lat,
          lon: z.centroid_lon,
        });
      }

      // 4. Area / Locality
      const areaName = z.police_station;
      const areaKey = `area-${areaName.toLowerCase()}`;
      if (!seen.has(areaKey)) {
        seen.add(areaKey);
        items.push({
          id: areaKey,
          type: 'area',
          label: areaName,
          entityType: 'Area',
          detail: `Zone ${z.zone_id}`,
          icon: '📍',
          zone: z,
          lat: z.centroid_lat,
          lon: z.centroid_lon,
        });
      }

      // 5. Junction or Landmark
      if (z.dominant_junction) {
        const jName = z.dominant_junction;
        const jKey = `junction-${jName.toLowerCase()}`;
        if (!seen.has(jKey)) {
          seen.add(jKey);

          // Categorize as Landmark if matching known keywords
          const isLandmark = /market|mall|metro|airport|soudha|forum|phoenix|orion|mg road/i.test(jName);

          items.push({
            id: jKey,
            type: isLandmark ? 'landmark' : 'junction',
            label: jName,
            entityType: isLandmark ? 'Landmark' : (z.priority_score > 70 ? 'High Priority Junction' : 'Junction'),
            detail: `Zone ${z.zone_id} · ${z.police_station} PS`,
            icon: '📍',
            zone: z,
            lat: z.centroid_lat,
            lon: z.centroid_lon,
          });
        }
      }
    });

    // 6. Routes (If searchable data exists)
    if (zones.length > 0) {
      items.push({
        id: 'patrol-route',
        type: 'route',
        label: 'Patrol Route',
        entityType: 'Route',
        detail: 'Active Patrol Plan',
        icon: '🚓',
        zone: zones[0],
        lat: zones[0].centroid_lat,
        lon: zones[0].centroid_lon,
      });
    }

    return items;
  }, [zones]);

  // Client-side filtering & relevance scoring logic
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      return [];
    }

    const scored = searchIndex.map((item) => {
      const label = item.label.toLowerCase();
      const detail = item.detail.toLowerCase();
      const type = item.type;
      let score = 0;

      // Exact match bonus
      if (label === q) {
        score += 1000;
      } else if (label.startsWith(q)) {
        score += 400;
      } else if (label.includes(q)) {
        score += 200;
      }

      if (detail.includes(q)) {
        score += 50;
      }

      // Relevance sorting weight order (Exact Station ID -> PS Name -> Area -> Landmark -> Junction -> Zone)
      if (score > 0) {
        if (type === 'station_id') score += 90;
        else if (type === 'station_name') score += 80;
        else if (type === 'area') score += 70;
        else if (type === 'landmark') score += 60;
        else if (type === 'junction') score += 50;
        else if (type === 'zone') score += 30;
        
        // CBM tie-breaker
        if (item.zone) {
          score += (item.zone.zone_CBM_sum || 0) / 1000000;
        }
      }

      return { item, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item)
      .slice(0, 8);
  }, [query, searchIndex]);

  // Flat options for keyboard navigation
  const flatOptions = useMemo(() => {
    if (query.trim().length === 0) {
      // Return recent items mapping to searchable index structure
      return recentSearches
        .map((r) => {
          const match = searchIndex.find((x) => x.label === r.label || (x.type === 'station_name' && x.stationName === r.id));
          if (match) return match;
          return null;
        })
        .filter((x): x is SearchItem => x !== null);
    }
    return searchResults;
  }, [query, searchResults, recentSearches, searchIndex]);

  // Close dropdown on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectOption = (opt: SearchItem) => {
    if (opt.type === 'station_name' && opt.stationName) {
      if (onSelectStation) {
        onSelectStation(opt.stationName);
      }
      saveRecentSearch({
        type: 'station',
        id: opt.stationName,
        label: opt.label,
        detail: opt.detail,
      });
      setQuery(opt.label);
    } else {
      onSelect({
        placeId: opt.zone.zone_id,
        lat: opt.lat,
        lon: opt.lon,
        label: opt.label,
        detail: opt.detail || '',
        zone: opt.zone,
      });
      saveRecentSearch({
        type: 'zone',
        id: String(opt.zone.zone_id),
        label: opt.label,
        detail: opt.detail,
      });
      setQuery(opt.label);
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') {
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (flatOptions.length > 0 ? (prev + 1) % flatOptions.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (flatOptions.length > 0 ? (prev - 1 + flatOptions.length) % flatOptions.length : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && flatOptions[activeIndex]) {
        selectOption(flatOptions[activeIndex]);
      }
    }
  };

  const showDropdown = open && (query.trim().length >= 2 || (query.trim().length === 0 && recentSearches.length > 0));

  useEffect(() => {
    onOpenChange?.(showDropdown);
  }, [showDropdown, onOpenChange]);

  // Render inline header theme
  if (theme === 'header') {
    return (
      <div
        ref={boxRef}
        className={`relative rounded-md border transition-all duration-150 ease-out font-mono text-[11px] h-9 w-[280px] flex items-center justify-between ${
          open ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        {/* Input Row */}
        <div className="flex items-center h-full px-3 gap-2 w-full">
          <svg
            className="text-slate-400 flex-shrink-0"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400 w-full text-[11px] font-mono leading-none"
            placeholder="Search station, zone or route..."
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="map-search-listbox"
            role="combobox"
          />
          {query && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 transition flex-shrink-0"
              onClick={() => {
                setQuery('');
                setActiveIndex(-1);
                inputRef.current?.focus();
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Floating command palette dropdown overlaying the map */}
        {showDropdown && (
          <ul
            id="map-search-listbox"
            role="listbox"
            className="absolute left-0 top-[40px] z-[1000] w-[340px] sm:w-[440px] bg-[#071228]/96 border border-[#508cff]/20 rounded-lg p-1 shadow-[0_8px_32px_rgba(0,0,0,0.65)] max-h-[280px] overflow-y-auto py-1 scroll-thin font-mono"
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {/* Empty state */}
            {query.trim().length >= 2 && flatOptions.length === 0 && (
              <li className="px-4 py-3.5 text-center text-[#6E7F9E] text-[11px]">
                No matches for &ldquo;{query}&rdquo;
              </li>
            )}

            {/* Flat list of options */}
            {flatOptions.map((item, idx) => {
              const active = idx === activeIndex;
              return (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={active}
                  className={`px-3.5 py-2 cursor-pointer flex items-center justify-between transition-colors text-[11px] rounded-md mx-1 my-0.5 ${
                    active ? 'bg-blue-500/15 text-[#22d3ee]' : 'hover:bg-blue-500/8 text-[#DDE8FF]'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(item);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-[12px] flex-shrink-0">{item.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate text-[#DDE8FF]">
                        {highlightText(item.label, query, false)}
                      </span>
                      <span className="text-[9px] text-[#6E7F9E] truncate mt-0.5">
                        {item.detail}
                      </span>
                    </div>
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-[#6E7F9E] font-bold pl-2 flex-shrink-0">
                    {item.entityType}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // Fallback trigger button when collapsed
  if (!open) {
    return (
      <button
        ref={boxRef}
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-11 h-11 flex items-center justify-center rounded bg-[#071022]/92 border border-[rgba(80,140,255,0.18)] text-[#DDE8FF] backdrop-blur-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition hover:border-[#508cff]/40 focus:outline-none focus:shadow-[0_0_8px_rgba(80,140,255,0.25)] cursor-pointer"
        aria-label="Open search console"
      >
        <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <div
      ref={boxRef}
      className={`relative rounded border transition-all duration-200 ease-out font-mono text-[13px] ${
        open ? 'shadow-[0_0_12px_rgba(80,140,255,0.25)] border-[#508cff]/40 bg-[#071022]/96' : 'border-[rgba(80,140,255,0.18)] bg-[#071022]/92'
      }`}
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Input Row */}
      <div className="flex items-center h-[42px] px-3.5 gap-2.5">
        <svg
          className="text-[#6E7F9E] flex-shrink-0"
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-0 outline-none text-[#DDE8FF] placeholder-[#6E7F9E] w-full text-[13px] tracking-wide"
          placeholder="Jump to station, zone or route..."
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="map-search-listbox"
          role="combobox"
        />
        {query && (
          <button
            type="button"
            className="text-[#6E7F9E] hover:text-[#DDE8FF] transition flex-shrink-0"
            onClick={() => {
              setQuery('');
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            title="Clear search"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
              <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown Container */}
      {showDropdown && (
        <ul
          id="map-search-listbox"
          role="listbox"
          className="max-h-[280px] overflow-y-auto border-t border-[rgba(80,140,255,0.12)] py-1.5 scroll-thin"
        >
          {query.trim().length >= 2 && flatOptions.length === 0 && (
            <li className="px-4 py-3 text-center text-[#6E7F9E] text-[11px]">
              No matches for &ldquo;{query}&rdquo;
            </li>
          )}

          {flatOptions.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={item.id}
                role="option"
                aria-selected={active}
                className={`px-3.5 py-1.5 cursor-pointer flex items-center justify-between transition-colors text-[11px] ${
                  active ? 'bg-blue-500/12 text-[#22d3ee]' : 'hover:bg-blue-500/8 text-[#DDE8FF]'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[12px] flex-shrink-0">{item.icon}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold truncate text-[#DDE8FF]">{item.label}</span>
                    <span className="text-[9px] text-[#6E7F9E] truncate">{item.detail}</span>
                  </div>
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#6E7F9E] font-bold pl-2 flex-shrink-0">
                  {item.entityType}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
