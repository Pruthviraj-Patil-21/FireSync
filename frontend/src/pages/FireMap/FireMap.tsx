import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import {
  Flame,
  Satellite,
  Search,
  Maximize2,
  Compass,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Target,
  ChevronRight,
  Eye,
  Sliders,
  Layers,
  ShieldCheck,
  Radio,
  ArrowRight,
  ArrowRightLeft,
  Calendar,
  Clock,
  ExternalLink,
  SlidersHorizontal,
  Map as MapIcon,
  Check,
} from 'lucide-react';
import { GLOBAL_HOTSPOTS, HotspotPoint } from '../../components/earth/fireData';
import { apiClient } from '../../services/apiClient';
import { DedicatedSatelliteWorkspace } from '../../components/dashboard/DedicatedSatelliteWorkspace';
import { SensorBadge } from '../../components/common/UIComponents';

// ============================================================================
// 1. BASEMAP CONFIGURATIONS & RELIABLE TILE PROVIDERS
// ============================================================================
export type BasemapKey = 'carto-dark' | 'esri-dark' | 'satellite' | 'osm';

interface BasemapLayerDef {
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string[];
  opacity?: number;
}

interface BasemapOption {
  key: BasemapKey;
  label: string;
  description: string;
  layers: BasemapLayerDef[];
}

const BASEMAP_OPTIONS: Record<BasemapKey, BasemapOption> = {
  'carto-dark': {
    key: 'carto-dark',
    label: 'Dark Matter',
    description: 'Crisp borders, coastlines & place labels in high-contrast dark theme',
    layers: [
      {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        subdomains: ['a', 'b', 'c', 'd'],
      },
    ],
  },
  'esri-dark': {
    key: 'esri-dark',
    label: 'Esri Dark Canvas',
    description: 'Esri dark gray base canvas with reference boundary overlay',
    layers: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16,
      },
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Reference &copy; Esri',
        maxZoom: 16,
      },
    ],
  },
  satellite: {
    key: 'satellite',
    label: 'Satellite Hybrid',
    description: 'Esri high-resolution World Imagery with country boundaries & labels',
    layers: [
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18,
      },
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Borders &copy; Esri',
        maxZoom: 18,
      },
    ],
  },
  osm: {
    key: 'osm',
    label: 'OpenStreetMap',
    description: 'Standard OpenStreetMap global cartography',
    layers: [
      {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    ],
  },
};

// ============================================================================
// 2. LEAFLET MAP LIFECYCLE & RESIZE MANAGER
// ============================================================================
const MapLifecycleManager: React.FC<{
  center: [number, number];
  zoom: number;
  isFilterPanelOpen: boolean;
  isDetailDrawerOpen: boolean;
}> = ({ center, zoom, isFilterPanelOpen, isDetailDrawerOpen }) => {
  const map = useMap();

  // Invalidate map size on mount, whenever sidebar/panels toggle, and on window resize
  useEffect(() => {
    const triggerInvalidate = () => {
      try {
        map.invalidateSize();
      } catch (e) {
        // Safe catch if map unmounting
      }
    };

    // Staggered invalidations guarantee layout has settled in DOM
    triggerInvalidate();
    const t1 = setTimeout(triggerInvalidate, 60);
    const t2 = setTimeout(triggerInvalidate, 200);
    const t3 = setTimeout(triggerInvalidate, 450);
    const t4 = setTimeout(triggerInvalidate, 800);

    window.addEventListener('resize', triggerInvalidate);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      window.removeEventListener('resize', triggerInvalidate);
    };
  }, [map, isFilterPanelOpen, isDetailDrawerOpen]);

  // Smoothly fly to selected coordinates
  useEffect(() => {
    try {
      map.flyTo(center, zoom, {
        duration: 1.0,
        easeLinearity: 0.25,
      });
    } catch (e) {
      // Safe catch for invalid coordinates
    }
  }, [center, zoom, map]);

  return null;
};

// ============================================================================
// 3. MAIN FIREMAP COMPONENT
// ============================================================================
export interface FireMapProps {
  isEmbedded?: boolean;
  onClose?: () => void;
}

export const FireMap: React.FC<FireMapProps> = ({
  isEmbedded = false,
  onClose,
}) => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'map' | 'satellite'>('map');
  const [activeBasemap, setActiveBasemap] = useState<BasemapKey>('carto-dark');
  const [isBasemapMenuOpen, setIsBasemapMenuOpen] = useState<boolean>(false);
  const [tileErrorOccurred, setTileErrorOccurred] = useState<boolean>(false);

  const [selectedSensorFamily, setSelectedSensorFamily] = useState<'ALL' | 'MODIS' | 'VIIRS'>('ALL');
  const [selectedSatellite, setSelectedSatellite] = useState<string>('ALL');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [minFrp, setMinFrp] = useState<number>(0);
  const [searchRegion, setSearchRegion] = useState<string>('');
  const [livePoints, setLivePoints] = useState<HotspotPoint[]>([]);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const [selectedHotspot, setSelectedHotspot] = useState<HotspotPoint | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([22.5, 82.0]);
  const [mapZoom, setMapZoom] = useState<number>(4.5);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(true);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(true);
  const [searchParams] = useSearchParams();

  // Load real NASA observations from PostgreSQL via apiClient
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    apiClient
      .getFires({ fetchAll: true })
      .then((fires) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (fires) {
          const mapped: HotspotPoint[] = fires.map((f) => {
            const isViirs = (f.sensorFamily || f.sensor || '').toUpperCase().includes('VIIRS');
            const satStr = (f.satellite || '').toUpperCase();
            let satName = 'VIIRS (NOAA-20)';
            if (satStr.includes('NOAA-21') || satStr.includes('NOAA21')) satName = 'VIIRS (NOAA-21)';
            else if (satStr.includes('NOAA-20') || satStr.includes('NOAA20')) satName = 'VIIRS (NOAA-20)';
            else if (satStr.includes('TERRA')) satName = 'MODIS (Terra)';
            else if (satStr.includes('AQUA')) satName = 'MODIS (Aqua)';
            else if (isViirs) satName = 'VIIRS (S-NPP)';
            else satName = 'MODIS (Terra)';

            const confCat =
              (f as any).confidenceCategory ||
              (typeof f.confidence === 'number' && f.confidence >= 80
                ? 'HIGH'
                : typeof f.confidence === 'number' && f.confidence < 50
                ? 'LOW'
                : 'NOMINAL');
            const frp = typeof f.frp === 'number' && Number.isFinite(f.frp) ? f.frp : null;
            const brightnessTempK =
              typeof f.brightnessTempK === 'number' && Number.isFinite(f.brightnessTempK)
                ? f.brightnessTempK
                : null;

            return {
              id: f.id,
              lat: f.lat,
              lon: f.lon,
              intensity:
                typeof frp === 'number' ? Math.min(1.0, Math.max(0.2, (frp || 5) / 50)) : 0.4,
              frp,
              confidence: typeof f.confidence === 'number' ? f.confidence : null,
              confidenceCategory: confCat,
              region: f.region || `${f.country} Corridor`,
              satellite: satName as any,
              acquiredDate: f.acquisitionDate ? f.acquisitionDate.slice(0, 10) : undefined,
              acquiredTime: f.observationTime ? f.observationTime.slice(11, 16) + ' UTC' : undefined,
              brightnessTemp: brightnessTempK || undefined,
              scanResolution: f.scanResolution || (isViirs ? '375m I-Band' : '1000m'),
              dayNight: f.dayNight as any,
            };
          });
          setLivePoints(mapped);
          setTotalDbCount(mapped.length);
          setIsLiveActive(true);
          if (mapped.length > 0) {
            setSelectedHotspot(mapped[0]);
            setMapCenter([mapped[0].lat, mapped[0].lon]);
            setMapZoom(5);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsLoading(false);
        setIsLiveActive(false);
        setLoadError(
          err instanceof Error ? err.message : 'Failed to connect to FireSync live backend'
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const basePool = useMemo(() => {
    if (demoMode) return GLOBAL_HOTSPOTS;
    return livePoints;
  }, [demoMode, livePoints]);

  // Deep-linking from Harmonization or Overview
  useEffect(() => {
    const pool = basePool;
    const selectedId = searchParams.get('selected');
    if (selectedId) {
      const baseId = selectedId.split('-c')[0];
      const match = pool.find((h) => h.id === selectedId || h.id === baseId);
      if (match) {
        setSelectedHotspot(match);
        setMapCenter([match.lat, match.lon]);
        setMapZoom(7);
        setIsDetailDrawerOpen(true);
      }
    }
    const regionParam = searchParams.get('region');
    if (regionParam) {
      setSearchRegion(regionParam);
      const match = pool.find((h) =>
        h.region.toLowerCase().includes(regionParam.toLowerCase())
      );
      if (match) {
        setSelectedHotspot(match);
        setMapCenter([match.lat, match.lon]);
        setMapZoom(5);
        setIsDetailDrawerOpen(true);
      }
    }
  }, [searchParams, basePool]);

  // Filter hotspots based on user controls and ensure coordinate validity
  const filteredHotspots = useMemo(() => {
    return basePool.filter((point) => {
      // Validate coordinates strictly to avoid Leaflet crashes
      if (
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon) ||
        point.lat < -90 ||
        point.lat > 90 ||
        point.lon < -180 ||
        point.lon > 180
      ) {
        return false;
      }

      // Sensor family filter
      if (selectedSensorFamily !== 'ALL') {
        if (selectedSensorFamily === 'MODIS' && !point.satellite.includes('MODIS')) return false;
        if (selectedSensorFamily === 'VIIRS' && !point.satellite.includes('VIIRS')) return false;
      }
      // Specific satellite platform filter
      if (selectedSatellite !== 'ALL') {
        if (!point.satellite.includes(selectedSatellite)) return false;
      }
      // Confidence threshold (sensor-aware)
      if (minConfidence > 0) {
        if (typeof point.confidence === 'number' && point.confidence < minConfidence) return false;
        if (point.confidence === null && point.confidenceCategory) {
          if (minConfidence >= 80 && point.confidenceCategory !== 'HIGH') return false;
          if (minConfidence >= 50 && point.confidenceCategory === 'LOW') return false;
        }
      }
      // FRP threshold
      if (minFrp > 0) {
        if (typeof point.frp !== 'number' || point.frp < minFrp) return false;
      }
      // Geographic region search
      if (searchRegion && !point.region.toLowerCase().includes(searchRegion.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [basePool, selectedSensorFamily, selectedSatellite, minConfidence, minFrp, searchRegion]);

  const currentBasemapDef = BASEMAP_OPTIONS[activeBasemap] || BASEMAP_OPTIONS['carto-dark'];

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden bg-space-950 text-slate-100 font-sans mt-16">
      {/* ========================================================================= */}
      {/* 1. TOP OPERATIONAL SUB-HEADER & FILTER CONTROLS BAR                       */}
      {/* ========================================================================= */}
      <div className="bg-graphite-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-30 font-mono text-xs shrink-0">
        {/* Left: Title & Live Observation Counter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-terracotta" />
            <span className="font-bold tracking-wider uppercase text-ivory">FIRE MAP</span>
          </div>

          <span className="text-slate-600">|</span>

          {isLoading ? (
            <div className="flex items-center gap-1.5 text-teal-light text-[11px]">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>SYNCING DATABASE...</span>
            </div>
          ) : isLiveActive ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {filteredHotspots.length} OF {totalDbCount} DETECTIONS
              </span>
            </div>
          ) : demoMode ? (
            <div className="flex items-center gap-1.5 text-ochre-light text-[11px]">
              <AlertTriangle className="w-3 h-3" />
              <span>DEMO MODE ({filteredHotspots.length} SYNTHETIC)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-400 text-[11px]">
              <AlertCircle className="w-3 h-3" />
              <span>OFFLINE</span>
            </div>
          )}
        </div>

        {/* Center: Quick Sensor Switcher Pills */}
        <div className="flex items-center gap-1 bg-graphite-950 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setSelectedSensorFamily('ALL')}
            className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
              selectedSensorFamily === 'ALL'
                ? 'bg-slate-800 text-ivory font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ALL SENSORS ({basePool.length})
          </button>
          <button
            onClick={() => setSelectedSensorFamily('MODIS')}
            className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
              selectedSensorFamily === 'MODIS'
                ? 'bg-ochre/25 text-ochre-light font-bold border border-ochre/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            MODIS (144)
          </button>
          <button
            onClick={() => setSelectedSensorFamily('VIIRS')}
            className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
              selectedSensorFamily === 'VIIRS'
                ? 'bg-teal-scientific/25 text-teal-light font-bold border border-teal-scientific/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            VIIRS (5,751)
          </button>
        </div>

        {/* Right: Actions, View Modes, Basemap Picker & Panels Toggle */}
        <div className="flex items-center gap-2">
          {/* Basemap Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsBasemapMenuOpen(!isBasemapMenuOpen)}
              className="px-2.5 py-1 rounded-lg border border-slate-800 bg-graphite-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Change Map Style"
            >
              <MapIcon className="w-3.5 h-3.5 text-teal-light" />
              <span>{currentBasemapDef.label}</span>
            </button>

            {isBasemapMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-graphite-950 border border-slate-800 rounded-lg shadow-2xl p-1.5 z-50 font-mono text-xs">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider px-2 py-1 font-semibold border-b border-slate-800/80 mb-1">
                  Cartographic Basemap
                </div>
                {(Object.keys(BASEMAP_OPTIONS) as BasemapKey[]).map((key) => {
                  const opt = BASEMAP_OPTIONS[key];
                  const isCur = key === activeBasemap;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setActiveBasemap(key);
                        setIsBasemapMenuOpen(false);
                        setTileErrorOccurred(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors cursor-pointer ${
                        isCur
                          ? 'bg-slate-800 text-teal-light font-bold'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs">{opt.label}</div>
                        <div className="text-[10px] text-slate-500 line-clamp-1">{opt.description}</div>
                      </div>
                      {isCur && <Check className="w-3.5 h-3.5 text-teal-light shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Toggle View Mode: Map vs Satellite GIBS */}
          <div className="flex items-center gap-1 bg-graphite-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setActiveView('map')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                activeView === 'map'
                  ? 'bg-slate-800 text-ivory font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3 text-teal-light" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setActiveView('satellite')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                activeView === 'satellite'
                  ? 'bg-teal-scientific text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Satellite className="w-3 h-3" />
              <span>GIBS Imagery</span>
            </button>
          </div>

          {/* Toggle Filter Panel */}
          <button
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFilterPanelOpen
                ? 'bg-slate-800 border-slate-700 text-ivory'
                : 'bg-graphite-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle Filter Sidebar"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>

          {/* Explicit Demo Mode Toggle */}
          <button
            type="button"
            onClick={() => setDemoMode(!demoMode)}
            className={`px-2 py-1 rounded text-[10px] border transition-colors cursor-pointer ${
              demoMode
                ? 'bg-ochre/25 border-ochre/50 text-ochre-light font-bold'
                : 'bg-graphite-950 hover:bg-graphite-800 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle demonstration dataset"
          >
            {demoMode ? 'DEMO: ON' : 'DEMO: OFF'}
          </button>
        </div>
      </div>

      {/* Main View Area: Either Leaflet Map OR Dedicated GIBS Imagery Workspace */}
      {activeView === 'satellite' ? (
        <DedicatedSatelliteWorkspace
          selectedHotspot={selectedHotspot}
          hotspotsList={filteredHotspots}
          onSelectHotspot={(point) => {
            setSelectedHotspot(point);
            setMapCenter([point.lat, point.lon]);
          }}
          onBackToMap={() => setActiveView('map')}
        />
      ) : (
        <div className="flex-1 min-h-0 relative flex overflow-hidden h-[calc(100vh-7rem)]">
          {/* ===================================================================== */}
          {/* 2. COLLAPSIBLE FILTER SIDEBAR (LEFT)                                  */}
          {/* ===================================================================== */}
          {isFilterPanelOpen && (
            <div className="w-72 bg-graphite-900 border-r border-slate-800 z-20 flex flex-col justify-between shrink-0 font-mono text-xs p-4 overflow-y-auto h-full">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold tracking-wider text-ivory uppercase">FILTERS</span>
                  <button
                    onClick={() => {
                      setSelectedSensorFamily('ALL');
                      setSelectedSatellite('ALL');
                      setMinConfidence(0);
                      setMinFrp(0);
                      setSearchRegion('');
                    }}
                    className="text-[10px] text-teal-light hover:underline cursor-pointer"
                  >
                    Reset All
                  </button>
                </div>

                {/* Specific Platform Filter */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1.5 uppercase font-medium">
                    Satellite Mission Platform
                  </label>
                  <select
                    value={selectedSatellite}
                    onChange={(e) => setSelectedSatellite(e.target.value)}
                    className="w-full bg-graphite-950 border border-slate-800 rounded px-2.5 py-1.5 text-ivory outline-none focus:border-teal-scientific cursor-pointer text-xs"
                  >
                    <option value="ALL">All Platforms</option>
                    <option value="Terra">Terra (MODIS 1km)</option>
                    <option value="Aqua">Aqua (MODIS 1km)</option>
                    <option value="NOAA-20">NOAA-20 (VIIRS 375m)</option>
                    <option value="NOAA-21">NOAA-21 (VIIRS 375m)</option>
                  </select>
                </div>

                {/* FRP Slider */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-400 uppercase font-medium">Minimum Radiative Power</span>
                    <span className="text-terracotta font-bold">{minFrp} MW</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={minFrp}
                    onChange={(e) => setMinFrp(Number(e.target.value))}
                    className="w-full accent-terracotta cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                    <span>0 MW (All)</span>
                    <span>50 MW</span>
                    <span>100 MW+</span>
                  </div>
                </div>

                {/* Confidence Threshold */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-400 uppercase font-medium">Confidence Level</span>
                    <span className="text-ivory font-bold">
                      {minConfidence === 0
                        ? 'All Qualities'
                        : minConfidence >= 80
                        ? 'High (>=80%)'
                        : 'Nominal (>=50%)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => setMinConfidence(0)}
                      className={`py-1 text-[10px] rounded border transition-colors cursor-pointer ${
                        minConfidence === 0
                          ? 'bg-slate-800 border-slate-700 text-ivory font-bold'
                          : 'bg-graphite-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      ALL
                    </button>
                    <button
                      onClick={() => setMinConfidence(50)}
                      className={`py-1 text-[10px] rounded border transition-colors cursor-pointer ${
                        minConfidence === 50
                          ? 'bg-slate-800 border-slate-700 text-ivory font-bold'
                          : 'bg-graphite-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      NOMINAL
                    </button>
                    <button
                      onClick={() => setMinConfidence(80)}
                      className={`py-1 text-[10px] rounded border transition-colors cursor-pointer ${
                        minConfidence === 80
                          ? 'bg-slate-800 border-slate-700 text-ivory font-bold'
                          : 'bg-graphite-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      HIGH
                    </button>
                  </div>
                </div>

                {/* Region Search */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1.5 uppercase font-medium">
                    Search Region / Corridor
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. India, Forest, Corridor..."
                      value={searchRegion}
                      onChange={(e) => setSearchRegion(e.target.value)}
                      className="w-full bg-graphite-950 border border-slate-800 rounded pl-8 pr-2.5 py-1.5 text-ivory placeholder-slate-500 outline-none focus:border-teal-scientific text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar Footer Info */}
              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500">
                <p>Basemap: {currentBasemapDef.label}</p>
                <p className="mt-0.5">Visible Hotspots: {filteredHotspots.length}</p>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* 3. FULL INTERACTIVE LEAFLET MAP VIEWPORT                              */}
          {/* ===================================================================== */}
          <div className="flex-1 min-w-0 h-[calc(100vh-7rem)] relative bg-[#091124] overflow-hidden">
            {/* Tile Error Fallback Banner */}
            {tileErrorOccurred && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-graphite-950/95 border border-amber-500/50 rounded-lg px-3 py-2 flex items-center gap-3 text-xs font-mono shadow-xl backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-200">Map tile loading slowed or timed out.</span>
                <button
                  onClick={() => {
                    setActiveBasemap(activeBasemap === 'carto-dark' ? 'esri-dark' : 'carto-dark');
                    setTileErrorOccurred(false);
                  }}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] transition-colors cursor-pointer"
                >
                  Switch Basemap Provider
                </button>
                <button
                  onClick={() => setTileErrorOccurred(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Container wrapper strictly absolute full-size to prevent zero-height collapse */}
            <div className="absolute inset-0 w-full h-full">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                minZoom={2}
                maxZoom={14}
                style={{ height: '100%', width: '100%', background: '#091124' }}
                className="w-full h-full"
                zoomControl={true}
              >
                <MapLifecycleManager
                  center={mapCenter}
                  zoom={mapZoom}
                  isFilterPanelOpen={isFilterPanelOpen}
                  isDetailDrawerOpen={isDetailDrawerOpen}
                />

                {/* Configured Basemap Tile Layers */}
                {currentBasemapDef.layers.map((layer, idx) => (
                  <TileLayer
                    key={`${currentBasemapDef.key}-${idx}`}
                    url={layer.url}
                    attribution={layer.attribution}
                    maxZoom={layer.maxZoom || 18}
                    subdomains={layer.subdomains || 'abc'}
                    opacity={layer.opacity ?? 1.0}
                    eventHandlers={{
                      tileerror: () => {
                        setTileErrorOccurred(true);
                      },
                    }}
                  />
                ))}

                {/* Hotspot Markers */}
                {filteredHotspots.map((point) => {
                  const isSelected = selectedHotspot?.id === point.id;
                  const isModis = point.satellite.includes('MODIS');

                  // Color based on FRP and sensor
                  const color =
                    typeof point.frp === 'number'
                      ? point.frp > 50
                        ? '#C36C50' // terracotta
                        : point.frp > 15
                        ? '#C3A36A' // ochre
                        : '#276B62' // teal
                      : isModis
                      ? '#C3A36A'
                      : '#276B62';

                  const radius =
                    typeof point.frp === 'number'
                      ? 3 + Math.min(6, (point.frp / 60) * 4)
                      : 4;

                  return (
                    <React.Fragment key={point.id}>
                      {/* Targeting reticle rings for selected hotspot */}
                      {isSelected && (
                        <CircleMarker
                          center={[point.lat, point.lon]}
                          radius={radius + 8}
                          pathOptions={{
                            color: '#00e5ff',
                            fillColor: '#00e5ff',
                            fillOpacity: 0.15,
                            weight: 1.5,
                            dashArray: '3, 4',
                          }}
                        />
                      )}

                      {/* Core Hotspot Marker */}
                      <CircleMarker
                        center={[point.lat, point.lon]}
                        radius={isSelected ? radius + 2 : radius}
                        pathOptions={{
                          color: isSelected ? '#ffffff' : color,
                          fillColor: color,
                          fillOpacity: 0.85,
                          weight: isSelected ? 2 : 1,
                        }}
                        eventHandlers={{
                          click: () => {
                            setSelectedHotspot(point);
                            setIsDetailDrawerOpen(true);
                          },
                        }}
                      >
                        <Popup className="custom-fire-popup">
                          <div className="font-mono text-xs p-1 text-slate-900">
                            <div className="font-bold border-b pb-1 mb-1">{point.satellite}</div>
                            <div>Coordinates: {point.lat.toFixed(4)}°, {point.lon.toFixed(4)}°</div>
                            <div>FRP: {typeof point.frp === 'number' ? `${point.frp} MW` : 'N/A'}</div>
                            <div>Acquired: {point.acquiredTime || 'N/A'}</div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            </div>

            {/* Pinned Bottom-Left Map Legend */}
            <div className="absolute bottom-4 left-4 z-[400] bg-graphite-950/90 border border-slate-800 rounded-lg p-3 font-mono text-[11px] backdrop-blur-md shadow-lg pointer-events-auto">
              <span className="font-bold text-ivory block mb-1.5 uppercase text-[10px] tracking-wider">
                Fire Radiative Legend
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-terracotta" />
                  <span className="text-slate-300">High FRP (&gt;50 MW)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-ochre" />
                  <span className="text-slate-300">Moderate FRP (15-50 MW)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-scientific" />
                  <span className="text-slate-300">Nominal / Low FRP (&lt;15 MW)</span>
                </div>
              </div>
            </div>

            {/* ===================================================================== */}
            {/* 4. SLIDE-OVER OBSERVATION DETAILS PANEL (RIGHT)                        */}
            {/* ===================================================================== */}
            {isDetailDrawerOpen && selectedHotspot && (
              <div className="absolute top-4 right-4 bottom-4 w-80 bg-graphite-950/95 border border-slate-800 rounded-xl z-[400] shadow-2xl p-4 flex flex-col justify-between font-mono text-xs backdrop-blur-xl pointer-events-auto overflow-y-auto">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-ivory uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-teal-light" />
                      <span>Observation Telemetry</span>
                    </span>
                    <button
                      onClick={() => setIsDetailDrawerOpen(false)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Satellite Mission Badge */}
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block mb-1">
                      Sensor & Platform
                    </span>
                    <SensorBadge sensor={selectedHotspot.satellite} size="md" />
                  </div>

                  {/* Telemetry Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded bg-graphite-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase">Radiative Power</span>
                      <div className="text-sm font-bold text-terracotta mt-0.5">
                        {typeof selectedHotspot.frp === 'number' ? `${selectedHotspot.frp} MW` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-graphite-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase">Brightness Temp</span>
                      <div className="text-sm font-bold text-ivory mt-0.5">
                        {selectedHotspot.brightnessTemp ? `${selectedHotspot.brightnessTemp} K` : 'Not reported'}
                      </div>
                    </div>
                  </div>

                  {/* Geolocation Coordinates */}
                  <div className="p-2.5 rounded bg-graphite-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase">Coordinates</span>
                    <div className="text-xs font-semibold text-ivory mt-0.5">
                      {selectedHotspot.lat.toFixed(5)}°N, {selectedHotspot.lon.toFixed(5)}°E
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Region: {selectedHotspot.region}
                    </span>
                  </div>

                  {/* Acquisition Timestamp & Confidence */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">Acquisition Time</span>
                      <span className="text-ivory font-medium">
                        {selectedHotspot.acquiredDate} {selectedHotspot.acquiredTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">Scan Resolution</span>
                      <span className="text-ivory font-medium">{selectedHotspot.scanResolution}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">Confidence</span>
                      <span className="text-teal-light font-bold">
                        {typeof selectedHotspot.confidence === 'number'
                          ? `${selectedHotspot.confidence}%`
                          : selectedHotspot.confidenceCategory || 'Nominal'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-400">Orbit Pass</span>
                      <span className="text-ivory font-medium">{selectedHotspot.dayNight || 'Day'}</span>
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <button
                    onClick={() => setActiveView('satellite')}
                    className="w-full py-2 bg-graphite-900 hover:bg-slate-800 border border-slate-700 text-ivory rounded text-center text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Satellite className="w-3.5 h-3.5 text-teal-light" />
                    <span>View NASA GIBS Imagery</span>
                  </button>

                  <button
                    onClick={() => navigate(`/harmonization?selected=${selectedHotspot.id}`)}
                    className="w-full py-2 bg-teal-scientific hover:bg-teal-light text-white rounded text-center text-xs font-semibold tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Harmonize this Detection</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Export as both FireMap and HotspotExplorer for route compatibility
export const HotspotExplorer = FireMap;
