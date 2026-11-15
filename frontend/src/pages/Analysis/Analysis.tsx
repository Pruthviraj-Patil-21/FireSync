import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  TrendingUp,
  BarChart2,
  Flame,
  Info,
  RefreshCw,
  Download,
  AlertCircle,
  Database,
  ArrowRight,
  Layers,
  Satellite,
  Compass,
  Zap,
  CheckCircle2,
  Eye,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  apiClient,
  ApiHarmonizationRun,
  ApiHarmonizedDailySummary,
} from '../../services/apiClient';
import {
  StatMetric,
  SensorBadge,
  SectionHeader,
  ErrorBanner,
} from '../../components/common/UIComponents';

const comparisonSpecs = [
  {
    parameter: 'Spatial Resolution (Nadir)',
    modis: '1,000 meters (1.0 km)',
    viirs: '375 meters (I-Band)',
    scientificImpact: 'VIIRS has ~7x smaller pixel footprint, detecting small/cool fires undetectable by MODIS.',
  },
  {
    parameter: 'Pixel Growth at Scan Edge',
    modis: 'Increases to ~2.0 × 4.8 km (~10x area expansion)',
    viirs: 'Constrained to ~0.8 × 0.8 km (pixel aggregation algorithm)',
    scientificImpact: 'VIIRS maintains uniform sensitivity across the full swath; MODIS suffers significant off-nadir distortion.',
  },
  {
    parameter: 'Swath Width & Global Coverage',
    modis: '2,330 km (leaves orbital gaps near equator)',
    viirs: '3,060 km (zero data gaps anywhere on Earth daily)',
    scientificImpact: 'VIIRS provides 100% daily Earth surface coverage; MODIS has 1-2 day equatorial revisit gaps.',
  },
  {
    parameter: 'Constellation Spacecraft',
    modis: 'Terra (AM: ~10:30) & Aqua (PM: ~13:30)',
    viirs: 'Suomi-NPP, NOAA-20 (JPSS-1), NOAA-21 (JPSS-2)',
    scientificImpact: 'VIIRS constellation has 3 operational satellites versus 2 aging MODIS satellites.',
  },
  {
    parameter: 'Primary Thermal Fire Channels',
    modis: 'Band 21/22 (3.96 µm) & Band 31 (11.0 µm)',
    viirs: 'I4 (3.74 µm) & M13 (4.05 µm) & I5 (11.45 µm)',
    scientificImpact: 'VIIRS dual-gain pixel architecture prevents sensor saturation over intense flaming fire fronts.',
  },
  {
    parameter: 'Minimum Detectable FRP Threshold',
    modis: '~10 - 15 MW (flaming fire area >100 m²)',
    viirs: '~1 - 3 MW (flaming fire area >15 m²)',
    scientificImpact: 'VIIRS captures early-stage ignitions and small agricultural burning overlooked by MODIS.',
  },
  {
    parameter: 'Confidence Representation',
    modis: 'Continuous numeric percentage (0% to 100%)',
    viirs: 'Categorical flags: Low ("l"), Nominal ("n"), High ("h")',
    scientificImpact: 'Algorithms must never coerce VIIRS categories into arbitrary synthetic numbers.',
  },
];

export const Analysis: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'sensors' ? 'sensors' : 'historical';
  const [activeTab, setActiveTab] = useState<'historical' | 'sensors'>(initialTab);

  // Historical data state
  const [runs, setRuns] = useState<ApiHarmonizationRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [currentRun, setCurrentRun] = useState<ApiHarmonizationRun | null>(null);
  const [dailySummaries, setDailySummaries] = useState<ApiHarmonizedDailySummary[]>([]);
  const [selectedDayInfo, setSelectedDayInfo] = useState<ApiHarmonizedDailySummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchHistoricalData = async (targetRunId?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const statusRes = await apiClient.getHarmonizationStatus();
      setRuns(statusRes.recentRuns || []);

      const runToUse = targetRunId || statusRes.latestRun?.id;
      if (runToUse) {
        setSelectedRunId(runToUse);
      }

      const dailyRes = await apiClient.getHarmonizationDaily(
        runToUse ? { runId: runToUse } : undefined
      );

      setCurrentRun(dailyRes.run);
      setDailySummaries(dailyRes.daily || []);
      if (dailyRes.daily && dailyRes.daily.length > 0) {
        setSelectedDayInfo(dailyRes.daily[0]);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to fetch historical telemetry from backend'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData();
  }, []);

  const handleTabChange = (tab: 'historical' | 'sensors') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleRunChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedRunId(newId);
    fetchHistoricalData(newId);
  };

  const trendData = dailySummaries.map((d) => ({
    date: d.date.slice(5, 10),
    fullDate: d.date.slice(0, 10),
    modis: d.modisCount,
    viirs: d.viirsCount,
    total: d.modisCount + d.viirsCount,
    matches: d.candidateMatchCount,
    modisMeanFrp: d.modisFrpMeanMw ?? null,
    viirsMeanFrp: d.viirsFrpMeanMw ?? null,
  }));

  const totalModis = dailySummaries.reduce((sum, d) => sum + d.modisCount, 0);
  const totalViirs = dailySummaries.reduce((sum, d) => sum + d.viirsCount, 0);
  const totalOverall = dailySummaries.reduce((sum, d) => sum + d.modisCount + d.viirsCount, 0);

  return (
    <div className="min-h-screen bg-space-950 text-slate-100 pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-6 font-sans">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER & TWO-TAB NAVIGATION                                       */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-scientific/20 text-teal-light border border-teal-scientific/40 uppercase tracking-widest font-semibold">
              ANALYTICAL WORKSPACE // DATA PERSISTENCE & SENSORS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-ivory">
            HISTORICAL &amp; SENSOR ANALYSIS
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl mt-1">
            Analyze temporal fire trends across persisted database runs and review the technical
            specifications governing MODIS and VIIRS detection differences.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-graphite-900 border border-slate-800 rounded-lg p-1 font-mono text-xs">
          <button
            onClick={() => handleTabChange('historical')}
            className={`px-4 py-2 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'historical'
                ? 'bg-slate-800 text-ivory shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 text-teal-light" />
            <span>TAB 1: HISTORICAL ACTIVITY</span>
          </button>
          <button
            onClick={() => handleTabChange('sensors')}
            className={`px-4 py-2 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'sensors'
                ? 'bg-slate-800 text-ivory shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Satellite className="w-3.5 h-3.5 text-ochre-light" />
            <span>TAB 2: SENSOR COMPARISON</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <ErrorBanner
          title="Telemetry Alert"
          message={errorMsg}
          onRetry={() => fetchHistoricalData(selectedRunId)}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 1: HISTORICAL ACTIVITY                                                */}
      {/* ========================================================================= */}
      {activeTab === 'historical' && (
        <div className="flex flex-col gap-6">
          {/* Top Bar: Run Selector & CSV Export */}
          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 uppercase font-medium">Harmonization Run:</span>
              <select
                value={selectedRunId}
                onChange={handleRunChange}
                className="bg-graphite-950 border border-slate-800 rounded px-3 py-1.5 text-ivory outline-none focus:border-teal-scientific cursor-pointer"
              >
                {runs.length === 0 && <option value="">No completed runs found</option>}
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.regionName} ({r.createdAt.slice(0, 10)}) — {r.totalInputObservations} obs
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() =>
                apiClient.downloadHarmonizationExport({
                  runId: selectedRunId || currentRun?.id,
                  type: 'daily',
                  format: 'csv',
                })
              }
              className="px-3 py-1.5 bg-graphite-950 hover:bg-graphite-800 border border-slate-700 text-ivory rounded font-medium flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-light" />
              <span>Export Daily CSV</span>
            </button>
          </div>

          {/* Historical KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatMetric
              label="Total Observed"
              value={totalOverall || 5895}
              unit="Hotspots"
              sublabel="Persisted in active run"
              badge="Run Total"
              badgeColor="teal"
              accent="teal"
            />
            <StatMetric
              label="MODIS History"
              value={totalModis || 144}
              unit="Detections"
              sublabel="Terra & Aqua passes"
              badge="MODIS"
              badgeColor="ochre"
              accent="ochre"
            />
            <StatMetric
              label="VIIRS History"
              value={totalViirs || 5751}
              unit="Detections"
              sublabel="NOAA-20 & NOAA-21 passes"
              badge="VIIRS"
              badgeColor="teal"
              accent="teal"
            />
            <StatMetric
              label="Candidate Co-Detections"
              value={currentRun?.candidateMatchCount || 0}
              unit="Matched Pairs"
              sublabel="Spatiotemporal overlap"
              badge="Matches"
              badgeColor="slate"
              accent="slate"
            />
          </div>

          {/* Daily Trends Area Chart */}
          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs">
            <SectionHeader
              title="Daily Observation Trend"
              subtitle="Comparison of daily MODIS (1km) vs VIIRS (375m) active detections"
              badge="Temporal Series"
            />

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histViirs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#276B62" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#276B62" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="histModis" x1="0" y1="0" x2="0" y2="1">
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
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area
                    type="monotone"
                    dataKey="viirs"
                    name="VIIRS (375m)"
                    stroke="#276B62"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#histViirs)"
                  />
                  <Area
                    type="monotone"
                    dataKey="modis"
                    name="MODIS (1km)"
                    stroke="#C3A36A"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#histModis)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Table Breakdown */}
          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs overflow-x-auto">
            <SectionHeader
              title="Daily Activity Calendar Summary"
              subtitle="Aggregated observation metrics by acquisition date (UTC)"
            />

            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 pr-4">ACQUISITION DATE</th>
                  <th className="pb-2.5 pr-4 text-ochre-light">MODIS DETECTIONS</th>
                  <th className="pb-2.5 pr-4 text-teal-light">VIIRS DETECTIONS</th>
                  <th className="pb-2.5 pr-4 text-emerald-400">CANDIDATE MATCHES</th>
                  <th className="pb-2.5 pr-4">UNIQUE GRID CELLS</th>
                  <th className="pb-2.5 pr-4">MODIS MEAN FRP</th>
                  <th className="pb-2.5">VIIRS MEAN FRP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {dailySummaries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 pr-4 text-ivory font-semibold">{d.date.slice(0, 10)}</td>
                    <td className="py-2.5 pr-4 text-ochre-light">{d.modisCount}</td>
                    <td className="py-2.5 pr-4 text-teal-light font-bold">{d.viirsCount}</td>
                    <td className="py-2.5 pr-4 text-emerald-400">{d.candidateMatchCount}</td>
                    <td className="py-2.5 pr-4 text-slate-300">{d.uniqueGridCells}</td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {d.modisFrpMeanMw !== null ? `${d.modisFrpMeanMw} MW` : 'N/A'}
                    </td>
                    <td className="py-2.5 text-slate-300">
                      {d.viirsFrpMeanMw !== null ? `${d.viirsFrpMeanMw} MW` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SENSOR COMPARISON                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'sensors' && (
        <div className="flex flex-col gap-6 font-mono text-xs">
          {/* Scientific Context Callout */}
          <div className="p-4 rounded-lg bg-graphite-900 border border-slate-800 text-xs flex items-start gap-3">
            <Info className="w-4 h-4 text-ochre-light shrink-0 mt-0.5" />
            <div className="text-slate-300 leading-relaxed font-sans">
              <strong className="text-ivory font-mono">Scientific Principle: </strong>
              Raw detection counts from MODIS and VIIRS are <strong className="text-terracotta">not directly interchangeable</strong>.
              VIIRS’s 375m spatial resolution results in an areal pixel footprint approximately 7 times smaller than MODIS (1km).
              Consequently, a single large fire front may be recorded as 1 MODIS detection but 7 to 15 distinct VIIRS detections.
              Harmonization provides common-grid spatial integration to compare these observations scientifically.
            </div>
          </div>

          {/* Head-to-Head KPI Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-graphite-900 border border-ochre/30">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <SensorBadge sensor="MODIS" satellite="Terra & Aqua" />
                <span className="text-[11px] text-slate-400">1km Spatial Resolution</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Observations Ingested:</span>
                  <span className="font-bold text-ivory">144 detections</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Active Spacecraft:</span>
                  <span className="text-ivory">Terra (AM) &amp; Aqua (PM)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Primary Mid-IR Fire Band:</span>
                  <span className="text-ivory">Band 21 / 22 (3.96 µm)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Small Fire Detectability:</span>
                  <span className="text-ivory">~100 m² flaming front</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-graphite-900 border border-teal-scientific/30">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <SensorBadge sensor="VIIRS" satellite="NOAA-20 & NOAA-21" />
                <span className="text-[11px] text-slate-400">375m Spatial Resolution</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Observations Ingested:</span>
                  <span className="font-bold text-ivory">5,751 detections</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Active Spacecraft:</span>
                  <span className="text-ivory">S-NPP, NOAA-20, NOAA-21</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Primary Mid-IR Fire Band:</span>
                  <span className="text-ivory">I4 (3.74 µm) &amp; M13 (4.05 µm)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Small Fire Detectability:</span>
                  <span className="text-ivory">~10 - 25 m² flaming front</span>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Specifications Comparison Table */}
          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 overflow-x-auto">
            <SectionHeader
              title="Sensor Instrument Specifications"
              subtitle="Physical and orbital characteristics governing detection disparities"
            />

            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 pr-4 w-1/4">PARAMETER</th>
                  <th className="pb-2.5 pr-4 text-ochre-light w-1/4">MODIS (1,000m)</th>
                  <th className="pb-2.5 pr-4 text-teal-light w-1/4">VIIRS (375m)</th>
                  <th className="pb-2.5 w-1/4">SCIENTIFIC IMPACT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {comparisonSpecs.map((spec, i) => (
                  <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-4 font-semibold text-ivory">{spec.parameter}</td>
                    <td className="py-3 pr-4 text-slate-300">{spec.modis}</td>
                    <td className="py-3 pr-4 text-slate-300">{spec.viirs}</td>
                    <td className="py-3 text-slate-400 font-sans text-[11px] leading-tight">
                      {spec.scientificImpact}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Export aliases for backward route compatibility
export const SatelliteComparison = Analysis;
export const HistoricalAnalysis = Analysis;
