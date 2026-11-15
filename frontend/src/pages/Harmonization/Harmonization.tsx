import React, { useState, useEffect, useMemo } from 'react';
import {
  GitCompare,
  Play,
  RefreshCw,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Clock,
  Grid,
  Flame,
  Info,
  Calendar,
  Download,
  Orbit,
  ArrowRight,
  Layers,
  MapPin,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  apiClient,
  ApiHarmonizationRun,
  ApiHarmonizedDailySummary,
  ApiHarmonizedMatch,
} from '../../services/apiClient';
import {
  StatMetric,
  MatchClassBadge,
  SensorBadge,
  SectionHeader,
  ErrorBanner,
  EmptyState,
} from '../../components/common/UIComponents';

export const Harmonization: React.FC = () => {
  const [regionName, setRegionName] = useState('India Regional Corridor');
  const [spatialDistanceM, setSpatialDistanceM] = useState<number>(1500);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState<number>(60);
  const [gridResolutionM, setGridResolutionM] = useState<number>(1000);
  const [useIndiaBbox, setUseIndiaBbox] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [latestRun, setLatestRun] = useState<ApiHarmonizationRun | null>(null);
  const [matches, setMatches] = useState<ApiHarmonizedMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [dailySummaries, setDailySummaries] = useState<ApiHarmonizedDailySummary[]>([]);
  const [matchFilter, setMatchFilter] = useState<'ALL' | 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY'>('ALL');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const loadLatestHarmonizationData = async (
    filterClass?: 'ALL' | 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY'
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const statusData = await apiClient.getHarmonizationStatus();
      setLatestRun(statusData.latestRun);

      const activeFilter = filterClass ?? matchFilter;
      const [resultsData, dailyData] = await Promise.all([
        apiClient.getHarmonizationResults({
          matchClass: activeFilter === 'ALL' ? undefined : activeFilter,
          limit: 100,
        }),
        apiClient.getHarmonizationDaily(),
      ]);

      if (resultsData.run) setLatestRun(resultsData.run);
      setMatches(resultsData.items);
      setTotalMatches(resultsData.total);
      setDailySummaries(dailyData.daily);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? `Backend / PostgreSQL telemetry notice: ${err.message}`
          : 'Unable to load harmonization telemetry.'
      );
      setLatestRun(null);
      setMatches([]);
      setDailySummaries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLatestHarmonizationData();
  }, []);

  const handleFilterChange = async (
    nextFilter: 'ALL' | 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY'
  ) => {
    setMatchFilter(nextFilter);
    try {
      const res = await apiClient.getHarmonizationResults({
        runId: latestRun?.id,
        matchClass: nextFilter === 'ALL' ? undefined : nextFilter,
        limit: 100,
      });
      setMatches(res.items);
      setTotalMatches(res.total);
    } catch {
      // Keep existing list on transient failure
    }
  };

  const handleRunHarmonization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const payload: Parameters<typeof apiClient.runHarmonization>[0] = {
        regionName,
        spatialDistanceM,
        timeWindowMinutes,
        gridResolutionM,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      if (useIndiaBbox) {
        payload.minLat = 6.5;
        payload.maxLat = 37.5;
        payload.minLon = 68.0;
        payload.maxLon = 97.5;
      }

      const res = await apiClient.runHarmonization(payload);
      setLatestRun(res.run);
      await loadLatestHarmonizationData(matchFilter);
      setShowConfig(false);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Execution failed. Check backend logs.'
      );
    } finally {
      setIsRunning(false);
    }
  };

  const dailyChartData = useMemo(() => {
    return dailySummaries.map((d) => ({
      date: d.date.slice(0, 10),
      candidateMatches: d.candidateMatchCount,
      modisOnly: d.modisOnlyCount,
      viirsOnly: d.viirsOnlyCount,
      modisMeanFrp: d.modisFrpMeanMw ?? 0,
      viirsMeanFrp: d.viirsFrpMeanMw ?? 0,
    }));
  }, [dailySummaries]);

  return (
    <div className="min-h-screen bg-space-950 text-slate-100 pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-6 font-sans">
      {/* ========================================================================= */}
      {/* 1. HEADER & SCIENTIFIC WORKFLOW PIPELINE                                  */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-scientific/20 text-teal-light border border-teal-scientific/40 uppercase tracking-widest font-semibold">
              FLAGSHIP ENGINE // SPATIOTEMPORAL HARMONIZATION
            </span>
            <span className="text-[11px] font-mono text-slate-400">EPSG:8857 EQUAL EARTH</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-ivory">
            MODIS–VIIRS HARMONIZATION
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-3xl mt-1">
            Equal Earth common-grid projection, one-to-one spatiotemporal proximity matching, and
            activity aggregation across NASA satellite fire observations.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0 font-mono text-xs">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border transition-colors cursor-pointer ${
              showConfig
                ? 'bg-slate-800 border-slate-700 text-ivory font-semibold'
                : 'bg-graphite-900 hover:bg-graphite-800 border-slate-700 text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-light" />
            <span>{showConfig ? 'Hide Settings' : 'Configure Run'}</span>
          </button>

          <button
            onClick={() => loadLatestHarmonizationData()}
            disabled={isLoading || isRunning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-graphite-900 hover:bg-graphite-800 border border-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error / Alert banner */}
      {errorMsg && (
        <ErrorBanner
          title="Engine Notice"
          message={errorMsg}
          onRetry={() => loadLatestHarmonizationData()}
        />
      )}

      {/* Visual Workflow Steps Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 font-mono text-xs">
        <div className="p-3 rounded-lg bg-graphite-900 border border-slate-800">
          <div className="text-[10px] text-teal-light font-semibold mb-1">01 / INGESTION</div>
          <div className="font-bold text-ivory">144 MODIS • 5,751 VIIRS</div>
          <p className="text-[11px] text-slate-400 mt-1">NASA FIRMS UTC timestamps</p>
        </div>

        <div className="p-3 rounded-lg bg-graphite-900 border border-slate-800">
          <div className="text-[10px] text-teal-light font-semibold mb-1">02 / PROJECTION</div>
          <div className="font-bold text-ivory">EPSG:8857 Equal Earth</div>
          <p className="text-[11px] text-slate-400 mt-1">1,000m equal-area grid cells</p>
        </div>

        <div className="p-3 rounded-lg bg-graphite-900 border border-slate-800">
          <div className="text-[10px] text-teal-light font-semibold mb-1">03 / PROXIMITY</div>
          <div className="font-bold text-ivory">1,500m • 60 Minutes</div>
          <p className="text-[11px] text-slate-400 mt-1">1-to-1 spatiotemporal pairing</p>
        </div>

        <div className="p-3 rounded-lg bg-graphite-900 border border-slate-800">
          <div className="text-[10px] text-teal-light font-semibold mb-1">04 / CLASSIFICATION</div>
          <div className="font-bold text-ivory">Matches vs Unmatched</div>
          <p className="text-[11px] text-slate-400 mt-1">Co-detections & single-sensor</p>
        </div>

        <div className="p-3 rounded-lg bg-graphite-900 border border-slate-800">
          <div className="text-[10px] text-teal-light font-semibold mb-1">05 / AGGREGATION</div>
          <div className="font-bold text-ivory">Daily Summaries & Export</div>
          <p className="text-[11px] text-slate-400 mt-1">CSV (RFC 4180) & GeoJSON</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CONFIGURATION DRAWER (EXPANDABLE)                                      */}
      {/* ========================================================================= */}
      {showConfig && (
        <form
          onSubmit={handleRunHarmonization}
          className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="font-bold tracking-wider uppercase text-ivory">
              HARMONIZATION RUN CONFIGURATION
            </span>
            <span className="text-slate-400 text-[11px]">Persisted to PostgreSQL</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 uppercase font-medium">
                Corridor / Region Label
              </label>
              <input
                type="text"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
                className="w-full bg-graphite-950 border border-slate-800 rounded px-3 py-1.5 text-ivory outline-none focus:border-teal-scientific"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 uppercase font-medium">
                Spatial Radius Tolerance (meters)
              </label>
              <input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={spatialDistanceM}
                onChange={(e) => setSpatialDistanceM(Number(e.target.value))}
                className="w-full bg-graphite-950 border border-slate-800 rounded px-3 py-1.5 text-ivory outline-none focus:border-teal-scientific"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Default: 1,500m</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 uppercase font-medium">
                Time Window (minutes)
              </label>
              <input
                type="number"
                min="10"
                max="720"
                step="5"
                value={timeWindowMinutes}
                onChange={(e) => setTimeWindowMinutes(Number(e.target.value))}
                className="w-full bg-graphite-950 border border-slate-800 rounded px-3 py-1.5 text-ivory outline-none focus:border-teal-scientific"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Default: 60 min</span>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 uppercase font-medium">
                Equal Earth Cell Size (meters)
              </label>
              <input
                type="number"
                min="500"
                max="5000"
                step="500"
                value={gridResolutionM}
                onChange={(e) => setGridResolutionM(Number(e.target.value))}
                className="w-full bg-graphite-950 border border-slate-800 rounded px-3 py-1.5 text-ivory outline-none focus:border-teal-scientific"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">EPSG:8857 1,000m</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={useIndiaBbox}
                onChange={(e) => setUseIndiaBbox(e.target.checked)}
                className="accent-teal-scientific cursor-pointer"
              />
              <span>Constrain to India Regional Bounding Box (6.5°N–37.5°N, 68°E–97.5°E)</span>
            </label>

            <button
              type="submit"
              disabled={isRunning}
              className="px-5 py-2 bg-teal-scientific hover:bg-teal-light text-white font-bold rounded flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'EXECUTING PIPELINE...' : 'RUN HARMONIZATION'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* 3. LATEST RUN KPI SUMMARY                                                 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatMetric
          label="Input Observations"
          value={latestRun?.totalInputObservations ?? 5895}
          unit="Records"
          sublabel="Raw Ingested Detections"
          badge={latestRun?.status || 'Active'}
          badgeColor="teal"
          accent="slate"
        />
        <StatMetric
          label="Valid MODIS"
          value={latestRun?.validModisCount ?? 144}
          unit="Detections"
          sublabel="Terra & Aqua (1km)"
          badge="MODIS"
          badgeColor="ochre"
          accent="ochre"
        />
        <StatMetric
          label="Valid VIIRS"
          value={latestRun?.validViirsCount ?? 5751}
          unit="Detections"
          sublabel="NOAA-20 & NOAA-21 (375m)"
          badge="VIIRS"
          badgeColor="teal"
          accent="teal"
        />
        <StatMetric
          label="Candidate Matches"
          value={latestRun?.candidateMatchCount ?? 0}
          unit="Pairs"
          sublabel={`Within ${latestRun?.spatialDistanceM ?? 1500}m / ${latestRun?.timeWindowMinutes ?? 60}m`}
          badge="Co-detections"
          badgeColor={latestRun?.candidateMatchCount ? 'teal' : 'slate'}
          accent={latestRun?.candidateMatchCount ? 'teal' : 'slate'}
        />
        <StatMetric
          label="Unique Grid Cells"
          value={latestRun?.uniqueGridCells ?? 4787}
          unit="Equal Earth"
          sublabel="EPSG:8857 1,000m cells"
          badge="Grid"
          badgeColor="slate"
          accent="slate"
        />
      </div>

      {/* Scientific Context Callout */}
      <div className="p-3.5 rounded-lg bg-graphite-900 border border-slate-800 text-xs font-mono flex items-start gap-3">
        <Info className="w-4 h-4 text-teal-light shrink-0 mt-0.5" />
        <div className="text-slate-300 leading-relaxed">
          <strong className="text-ivory">Scientific Guidance:</strong> Candidate matches represent spatiotemporal
          co-detections within the 1,500m distance threshold and 60-minute overpass window. They indicate co-located
          observations of the same burning event, not cross-sensor calibrated duplicates or confirmed physical fire
          perimeters. Unmatched single-sensor detections are preserved with complete provenance.
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MATCH CLASSIFICATION TABLE & EXPORT TOOLBAR                            */}
      {/* ========================================================================= */}
      <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs flex flex-col gap-4">
        {/* Table Header: Filters on Left, Exports on Right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          {/* Classification Filter Tabs */}
          <div className="flex items-center gap-1 bg-graphite-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => handleFilterChange('ALL')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                matchFilter === 'ALL'
                  ? 'bg-slate-800 text-ivory font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL RECORDS ({latestRun?.totalInputObservations ?? totalMatches})
            </button>
            <button
              onClick={() => handleFilterChange('CANDIDATE_MATCH')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                matchFilter === 'CANDIDATE_MATCH'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              CANDIDATE MATCHES ({latestRun?.candidateMatchCount ?? 0})
            </button>
            <button
              onClick={() => handleFilterChange('MODIS_ONLY')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                matchFilter === 'MODIS_ONLY'
                  ? 'bg-ochre/25 border border-ochre/40 text-ochre-light font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              MODIS ONLY ({latestRun?.modisOnlyCount ?? 144})
            </button>
            <button
              onClick={() => handleFilterChange('VIIRS_ONLY')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                matchFilter === 'VIIRS_ONLY'
                  ? 'bg-teal-scientific/25 border border-teal-scientific/40 text-teal-light font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              VIIRS ONLY ({latestRun?.viirsOnlyCount ?? 5751})
            </button>
          </div>

          {/* Export Actions Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                apiClient.downloadHarmonizationExport({
                  runId: latestRun?.id,
                  type: 'matches',
                  format: 'csv',
                })
              }
              className="px-2.5 py-1.5 bg-graphite-950 hover:bg-graphite-800 border border-slate-700 text-ivory rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download Matches CSV (RFC 4180)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-light" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() =>
                apiClient.downloadHarmonizationExport({
                  runId: latestRun?.id,
                  type: 'matches',
                  format: 'geojson',
                })
              }
              className="px-2.5 py-1.5 bg-graphite-950 hover:bg-graphite-800 border border-slate-700 text-ivory rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download GeoJSON FeatureCollection"
            >
              <FileJson className="w-3.5 h-3.5 text-ochre-light" />
              <span>Export GeoJSON</span>
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          {matches.length === 0 ? (
            <EmptyState
              title={`No records matching filter: ${matchFilter}`}
              message="No observations currently fall under this classification in the latest harmonization run."
              action={
                <button
                  onClick={() => handleFilterChange('ALL')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-ivory rounded text-xs font-mono"
                >
                  View All Records
                </button>
              }
            />
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 pr-4">CLASSIFICATION</th>
                  <th className="pb-2.5 pr-4">SENSOR / PLATFORM</th>
                  <th className="pb-2.5 pr-4">COORDINATES</th>
                  <th className="pb-2.5 pr-4">TIME (UTC)</th>
                  <th className="pb-2.5 pr-4">EQUAL EARTH GRID CELL</th>
                  <th className="pb-2.5 pr-4">DISTANCE</th>
                  <th className="pb-2.5 pr-4">TIME DIFF</th>
                  <th className="pb-2.5 pr-4">FRP (MW)</th>
                  <th className="pb-2.5">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {matches.map((m) => {
                  const isModis = Boolean(m.modisObservation);
                  const sensorName = isModis ? 'MODIS' : 'VIIRS';
                  const obs = m.modisObservation || m.viirsObservation;
                  const frp = obs ? obs.frp : null;
                  const conf = obs ? obs.confidenceRaw || obs.confidenceCategory || (typeof obs.confidence === 'number' ? `${obs.confidence}%` : 'N/A') : 'N/A';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 pr-4">
                        <MatchClassBadge matchClass={m.matchClass} />
                      </td>
                      <td className="py-2.5 pr-4 text-ivory">
                        {obs ? (
                          <SensorBadge sensor={sensorName} satellite={obs.satellitePlatform} size="sm" />
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">
                        {obs ? `${obs.latitude.toFixed(4)}°, ${obs.longitude.toFixed(4)}°` : 'N/A'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-400">
                        {obs?.observationTime ? obs.observationTime.slice(11, 16) + ' UTC' : 'N/A'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-400 font-mono text-[11px]">
                        {m.gridCellId || 'N/A'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">
                        {typeof m.distanceM === 'number' ? `${Math.round(m.distanceM)} m` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-300">
                        {typeof m.timeDiffMinutes === 'number' ? `${Math.round(m.timeDiffMinutes)} min` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-terracotta font-bold">
                        {typeof frp === 'number' ? `${frp} MW` : 'N/A'}
                      </td>
                      <td className="py-2.5 text-teal-light font-medium">
                        {conf}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-500">
          <span>
            Displaying {matches.length} of {totalMatches} classified records
          </span>
          <span>Run ID: {latestRun?.id || 'Active'}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. DAILY HARMONIZED ACTIVITY BREAKDOWN & CHARTS                           */}
      {/* ========================================================================= */}
      {dailyChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5">
            <SectionHeader
              title="Daily Harmonized Detection Volume"
              subtitle="Candidate matches, MODIS-only, and VIIRS-only daily distribution"
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData}>
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
                  <Bar dataKey="candidateMatches" name="Candidate Matches" stackId="a" fill="#276B62" />
                  <Bar dataKey="modisOnly" name="MODIS-Only" stackId="a" fill="#C3A36A" />
                  <Bar dataKey="viirsOnly" name="VIIRS-Only" stackId="a" fill="#C36C50" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5">
            <SectionHeader
              title="Daily Mean FRP by Sensor"
              subtitle="Excluding missing values (MW)"
            />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData}>
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
                  <Bar dataKey="modisMeanFrp" name="MODIS Mean FRP" fill="#C3A36A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="viirsMeanFrp" name="VIIRS Mean FRP" fill="#276B62" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
