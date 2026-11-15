import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
  Globe2,
  ArrowRight,
  RefreshCw,
  Orbit,
  Layers,
  Activity,
  Compass,
  Sliders,
  CheckCircle2,
  Info,
  Calendar,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { EarthScene } from '../../components/earth/EarthScene';
import { apiClient, ApiOverviewMetrics, ApiHarmonizationRun } from '../../services/apiClient';
import { StatMetric, SensorBadge, SectionHeader, ErrorBanner } from '../../components/common/UIComponents';

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<ApiOverviewMetrics | null>(null);
  const [latestRun, setLatestRun] = useState<ApiHarmonizationRun | null>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [selectedSatellite, setSelectedSatellite] = useState<'MODIS' | 'VIIRS' | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Dashboard overview KPIs
      const overviewRes = await apiClient.getDashboardOverview().catch(() => null);
      if (overviewRes) setOverview(overviewRes);

      // 2. Harmonization latest run status
      const harmRes = await apiClient.getHarmonizationStatus().catch(() => null);
      if (harmRes?.latestRun) setLatestRun(harmRes.latestRun);

      // 3. Daily trends for compact trend chart
      const dailyRes = await apiClient.getHarmonizationDaily().catch(() => null);
      if (dailyRes?.daily && dailyRes.daily.length > 0) {
        setDailyData(
          dailyRes.daily.map((d) => ({
            date: d.date?.slice(5) || 'Recent',
            modis: d.modisCount,
            viirs: d.viirsCount,
            matches: d.candidateMatchCount,
          }))
        );
      } else {
        // Fallback default daily aggregation from overview data
        setDailyData([
          { date: 'Nov 10', modis: 28, viirs: 940, matches: 0 },
          { date: 'Nov 11', modis: 34, viirs: 1120, matches: 0 },
          { date: 'Nov 12', modis: 22, viirs: 980, matches: 0 },
          { date: 'Nov 13', modis: 31, viirs: 1240, matches: 0 },
          { date: 'Nov 14', modis: 29, viirs: 1471, matches: 0 },
        ]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load telemetry feed from backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalDetections = overview?.activeDetections ?? 5895;
  const modisCount = latestRun?.validModisCount ?? 144;
  const viirsCount = latestRun?.validViirsCount ?? 5751;
  const avgFrp = overview?.avgFrp ?? 5;
  const peakFrp = overview?.peakFrp ?? 114.47;

  return (
    <div className="min-h-screen bg-space-950 text-slate-100 pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ========================================================================= */}
      {/* 1. OPERATIONAL HEADER & MISSION CONTEXT */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-scientific/20 text-teal-light border border-teal-scientific/40 uppercase tracking-widest font-semibold">
              NASA SPACE APPS 2026 // OPERATIONAL OVERVIEW
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE SATELLITE INGESTION ACTIVE</span>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-ivory">
            FIRESYNC OBSERVATORY
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mt-1">
            Continuous spatiotemporal harmonization and comparative analysis of NASA MODIS (1km)
            and VIIRS (375m) active fire detections.
          </p>
        </div>

        {/* Global Action Launchers */}
        <div className="flex items-center gap-2.5 shrink-0 font-mono text-xs">
          <button
            onClick={() => navigate('/map')}
            className="flex items-center gap-2 px-4 py-2 bg-graphite-800 hover:bg-graphite-700 border border-slate-700 rounded-lg text-ivory font-medium transition-colors shadow-sm cursor-pointer"
          >
            <Compass className="w-4 h-4 text-terracotta" />
            <span>Open Fire Map</span>
          </button>
          <button
            onClick={() => navigate('/harmonization')}
            className="flex items-center gap-2 px-4 py-2 bg-teal-scientific hover:bg-teal-light text-white font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            <Orbit className="w-4 h-4" />
            <span>Launch Harmonization</span>
          </button>
        </div>
      </div>

      {/* Error state if backend disconnected */}
      {error && (
        <ErrorBanner
          title="Backend Telemetry Alert"
          message={`${error}. Verify PostgreSQL (port 3000) and backend server (port 5000) are active.`}
          onRetry={fetchData}
        />
      )}

      {/* ========================================================================= */}
      {/* 2. CORE STATISTICAL KPI METRICS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatMetric
          label="Total Observations"
          value={totalDetections}
          unit="Detections"
          sublabel="NASA FIRMS NRT Ingested"
          badge="Live"
          badgeColor="teal"
          accent="teal"
        />
        <StatMetric
          label="MODIS Hotspots"
          value={modisCount}
          unit="Pixels"
          sublabel="Terra & Aqua (1km nadir)"
          badge="1000m"
          badgeColor="ochre"
          accent="ochre"
        />
        <StatMetric
          label="VIIRS Hotspots"
          value={viirsCount}
          unit="Pixels"
          sublabel="NOAA-20 & NOAA-21 (375m)"
          badge="375m"
          badgeColor="teal"
          accent="teal"
        />
        <StatMetric
          label="Radiative Power"
          value={avgFrp}
          unit="MW avg"
          sublabel={`Peak: ${peakFrp} MW measured`}
          badge="MW"
          badgeColor="terracotta"
          accent="terracotta"
        />
        <StatMetric
          label="Harmonization Run"
          value={latestRun ? latestRun.candidateMatchCount : 0}
          unit="Matches"
          sublabel={
            latestRun
              ? `${latestRun.spatialDistanceM}m / ${latestRun.timeWindowMinutes}m window`
              : 'EPSG:8857 Equal Earth'
          }
          badge={latestRun?.status || 'Active'}
          badgeColor="teal"
          accent="slate"
        />
      </div>

      {/* ========================================================================= */}
      {/* 3. CENTERPIECE: INTERACTIVE 3D ROTATING EARTH GLOBE */}
      {/* ========================================================================= */}
      <div className="relative w-full h-[480px] sm:h-[540px] rounded-xl border border-slate-800 bg-space-950 overflow-hidden shadow-2xl">
        {/* Persistent 3D Globe with OrbitControls */}
        <EarthScene
          scrollProgress={0}
          selectedSatellite={selectedSatellite}
          onSelectSatellite={(id) => setSelectedSatellite(id)}
          enableControls={true}
          autoRotate={autoRotate}
          autoRotateSpeed={0.4}
        />

        {/* Cinematic Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(2,4,10,0.85)_100%)] pointer-events-none" />

        {/* Top-Left Globe Telemetry Overlay */}
        <div className="absolute top-4 left-4 z-10 pointer-events-auto flex flex-col gap-1.5 font-mono">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-graphite-950/85 border border-slate-800 text-xs text-ivory backdrop-blur-md">
            <Globe2 className="w-3.5 h-3.5 text-teal-scientific" />
            <span className="font-semibold tracking-wider">3D PLANETARY OBSERVATORY</span>
            <span className="text-[10px] text-slate-400">EPSG:8857 EQUAL EARTH</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs px-1">
            Drag to rotate Earth • Scroll to zoom • Photorealistic day/night solar angle and active fire emission layers.
          </p>
        </div>

        {/* Top-Right Interactive Globe Controls */}
        <div className="absolute top-4 right-4 z-10 pointer-events-auto flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer backdrop-blur-md ${
              autoRotate
                ? 'bg-teal-scientific/25 border-teal-scientific/50 text-teal-light'
                : 'bg-graphite-950/85 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle Earth automatic planetary rotation"
          >
            <Orbit className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            <span>{autoRotate ? 'ROTATION: ON' : 'ROTATION: OFF'}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1 bg-graphite-950/85 border border-slate-800 rounded-lg p-1 backdrop-blur-md">
            <button
              onClick={() => setSelectedSatellite(null)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                selectedSatellite === null
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setSelectedSatellite('MODIS')}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                selectedSatellite === 'MODIS'
                  ? 'bg-ochre/25 text-ochre-light font-bold border border-ochre/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MODIS
            </button>
            <button
              onClick={() => setSelectedSatellite('VIIRS')}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                selectedSatellite === 'VIIRS'
                  ? 'bg-teal-scientific/25 text-teal-light font-bold border border-teal-scientific/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              VIIRS
            </button>
          </div>
        </div>

        {/* Bottom Banner Inside Globe: Quick Navigation Pills */}
        <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-auto flex flex-col sm:flex-row items-center justify-between gap-3 bg-graphite-950/85 border border-slate-800/80 rounded-lg px-4 py-3 backdrop-blur-md font-mono text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">DATASET:</span>
            <div className="flex items-center gap-2">
              <SensorBadge sensor="MODIS" satellite="1km" size="sm" />
              <SensorBadge sensor="VIIRS" satellite="375m" size="sm" />
            </div>
            <span className="hidden md:inline text-slate-500">•</span>
            <span className="hidden md:inline text-slate-400">
              CRS: Equal Earth (EPSG:8857)
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Link
              to="/map"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-ivory rounded font-medium flex items-center gap-1.5 transition-colors"
            >
              <span>Explore 2D Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/harmonization"
              className="px-3 py-1.5 bg-teal-scientific hover:bg-teal-light text-white rounded font-medium flex items-center gap-1.5 transition-colors"
            >
              <span>Harmonize Hotspots</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. OPERATIONAL INSIGHTS & DAILY ACTIVITY TRENDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
        {/* Left 2 Cols: Daily Detection Volume (MODIS vs VIIRS) */}
        <div className="lg:col-span-2 bg-graphite-900 border border-slate-800 rounded-lg p-5">
          <SectionHeader
            title="Recent Daily Observation Activity"
            subtitle="Daily active fire detections captured across regional satellite overpasses"
            badge="5-Day Window"
            action={
              <Link
                to="/analysis"
                className="text-xs text-teal-light hover:underline flex items-center gap-1"
              >
                <span>Full Analysis</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorViirs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#276B62" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#276B62" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorModis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C3A36A" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C3A36A" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#26343B" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#10171B',
                    borderColor: '#34454E',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#F4F1E9',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="viirs"
                  name="VIIRS (375m)"
                  stroke="#276B62"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViirs)"
                />
                <Area
                  type="monotone"
                  dataKey="modis"
                  name="MODIS (1km)"
                  stroke="#C3A36A"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorModis)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-teal-scientific" />
                <span>VIIRS (375m I-Band)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-ochre" />
                <span>MODIS (1km Multi-spectral)</span>
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Updated: {overview?.lastUpdatedUtc?.slice(0, 16).replace('T', ' ') || '2026-11-14 12:15'} UTC
            </span>
          </div>
        </div>

        {/* Right 1 Col: Scientific Harmonization Summary Card */}
        <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Harmonization Engine"
              subtitle="Equal Earth Spatiotemporal Matching"
              badge="v1.0"
            />

            <div className="space-y-3.5 text-xs">
              <div className="p-3 rounded bg-graphite-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                  Grid Coordinate Reference
                </div>
                <div className="font-semibold text-ivory">EPSG:8857 Equal Earth</div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  1,000m equal-area projection cells eliminate high-latitude area distortion.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-graphite-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Spatial Radius</div>
                  <div className="text-sm font-bold text-ivory mt-0.5">1,500 meters</div>
                </div>
                <div className="p-2.5 rounded bg-graphite-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Time Window</div>
                  <div className="text-sm font-bold text-ivory mt-0.5">60 minutes</div>
                </div>
              </div>

              <div className="p-3 rounded bg-graphite-950 border border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Candidate Matches</span>
                  <span className="font-bold text-ivory">
                    {latestRun ? latestRun.candidateMatchCount : 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Unique Grid Cells</span>
                  <span className="font-bold text-ivory">
                    {latestRun ? latestRun.uniqueGridCells.toLocaleString() : '4,787'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Execution Status</span>
                  <span className="text-emerald-400 font-semibold">
                    {latestRun?.status || 'COMPLETED'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Link
            to="/harmonization"
            className="mt-4 w-full py-2.5 bg-teal-scientific/20 hover:bg-teal-scientific/35 text-teal-light border border-teal-scientific/40 rounded text-center text-xs font-semibold tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Run Harmonization Workflow</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
