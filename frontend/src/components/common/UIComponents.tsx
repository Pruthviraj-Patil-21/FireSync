import React from 'react';
import { LucideIcon, Info, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Scientific KPI Stat Card
 */
export interface StatMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeColor?: 'teal' | 'terracotta' | 'ochre' | 'slate';
  accent?: 'teal' | 'terracotta' | 'ochre' | 'slate';
}

export const StatMetric: React.FC<StatMetricProps> = ({
  label,
  value,
  unit,
  sublabel,
  icon: Icon,
  badge,
  badgeColor = 'slate',
  accent = 'slate',
}) => {
  const accentBorder = {
    teal: 'border-l-2 border-l-teal-scientific',
    terracotta: 'border-l-2 border-l-terracotta',
    ochre: 'border-l-2 border-l-ochre',
    slate: 'border-l-2 border-l-slate-600',
  }[accent];

  const badgeBg = {
    teal: 'bg-teal-scientific/15 text-teal-light border-teal-scientific/30',
    terracotta: 'bg-terracotta/15 text-terracotta-light border-terracotta/30',
    ochre: 'bg-ochre/15 text-ochre-light border-ochre/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
  }[badgeColor];

  return (
    <div
      className={`bg-graphite-900 border border-slate-800/80 rounded-lg p-3.5 flex flex-col justify-between transition-colors hover:border-slate-700 ${accentBorder}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-medium truncate">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-medium ${badgeBg}`}
            >
              {badge}
            </span>
          )}
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-ivory">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-xs font-mono text-slate-400 font-medium">
            {unit}
          </span>
        )}
      </div>

      {sublabel && (
        <p className="mt-1.5 text-[11px] text-slate-400 leading-tight truncate font-sans">
          {sublabel}
        </p>
      )}
    </div>
  );
};

/**
 * Sensor Identifier Badge (MODIS vs VIIRS)
 */
export const SensorBadge: React.FC<{
  sensor: 'MODIS' | 'VIIRS' | string;
  satellite?: string;
  size?: 'sm' | 'md';
}> = ({ sensor, satellite, size = 'md' }) => {
  const isModis = sensor?.toUpperCase().includes('MODIS');
  const isViirs = sensor?.toUpperCase().includes('VIIRS');

  const colorClasses = isModis
    ? 'bg-ochre/15 text-ochre-light border-ochre/30'
    : isViirs
    ? 'bg-teal-scientific/15 text-teal-light border-teal-scientific/30'
    : 'bg-slate-800 text-slate-300 border-slate-700';

  const py = size === 'sm' ? 'py-0.5 text-[10px]' : 'py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 rounded font-mono font-medium border uppercase tracking-wider ${colorClasses} ${py}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{sensor}</span>
      {satellite && (
        <span className="opacity-75 font-normal">({satellite})</span>
      )}
    </span>
  );
};

/**
 * Harmonization Match Class Badge
 */
export const MatchClassBadge: React.FC<{
  matchClass: 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY' | string;
}> = ({ matchClass }) => {
  switch (matchClass) {
    case 'CANDIDATE_MATCH':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          CANDIDATE MATCH
        </span>
      );
    case 'MODIS_ONLY':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-ochre/15 text-ochre-light border border-ochre/30">
          <span className="w-1.5 h-1.5 rounded-full bg-ochre" />
          MODIS ONLY
        </span>
      );
    case 'VIIRS_ONLY':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-teal-scientific/15 text-teal-light border border-teal-scientific/30">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-scientific" />
          VIIRS ONLY
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
          {matchClass}
        </span>
      );
  }
};

/**
 * Clean Section Header
 */
export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  badge?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, badge, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-800">
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-ivory">
          {title}
        </h2>
        {badge && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/**
 * Scientific Empty State
 */
export const EmptyState: React.FC<{
  title: string;
  message: string;
  action?: React.ReactNode;
}> = ({ title, message, action }) => (
  <div className="py-12 px-4 text-center border border-dashed border-slate-800 rounded-lg bg-graphite-950/40">
    <Info className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-60" />
    <h3 className="text-sm font-mono font-medium text-slate-300 uppercase tracking-wider">
      {title}
    </h3>
    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
      {message}
    </p>
    {action && <div>{action}</div>}
  </div>
);

/**
 * Error / Offline State Banner
 */
export const ErrorBanner: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Data Feed Warning', message, onRetry }) => (
  <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center justify-between gap-3">
    <div className="flex items-center gap-2.5">
      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
      <div>
        <span className="font-semibold">{title}: </span>
        <span className="text-rose-200">{message}</span>
      </div>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 border border-rose-400/40 rounded text-[11px] text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        <span>Retry</span>
      </button>
    )}
  </div>
);
