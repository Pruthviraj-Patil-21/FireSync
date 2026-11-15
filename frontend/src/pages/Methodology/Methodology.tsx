import React from 'react';
import {
  Satellite,
  Flame,
  Info,
  ShieldAlert,
  Cpu,
  BookOpen,
  CheckCircle2,
  Layers,
  ArrowRight,
  ExternalLink,
  Orbit,
  Scale,
  Compass,
} from 'lucide-react';
import { SectionHeader } from '../../components/common/UIComponents';

export const Methodology: React.FC = () => {
  return (
    <div className="min-h-screen bg-space-950 text-slate-100 pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-8 font-sans">
      {/* ========================================================================= */}
      {/* 1. HEADER                                                                 */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 mb-1.5 font-mono">
          <span className="text-[10px] px-2 py-0.5 rounded bg-teal-scientific/20 text-teal-light border border-teal-scientific/40 uppercase tracking-widest font-semibold">
            REFERENCE DOCUMENTATION // NASA SPACE APPS 2026
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-ivory">
          SCIENTIFIC METHODOLOGY &amp; DATA PROVENANCE
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-3xl mt-1">
          Technical specifications, physical radiometry principles, Equal Earth coordinate systems,
          and spatiotemporal matching algorithms governing FireSync’s MODIS–VIIRS harmonization engine.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE 5-STAGE HARMONIZATION PIPELINE                                     */}
      {/* ========================================================================= */}
      <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs">
        <SectionHeader
          title="Five-Stage Harmonization Architecture"
          subtitle="How raw satellite detections are ingested, projected, matched, and aggregated"
          badge="Algorithm Flow"
        />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-light font-bold mb-1">STAGE 1</div>
              <h3 className="font-bold text-ivory text-xs mb-1">Ingestion &amp; Normalization</h3>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Raw NASA FIRMS CSV payloads are parsed with exact UTC acquisition timestamps, valid sensor
                identifications, and strict preservation of missing FRP values as null.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">No false zero coercion</span>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-light font-bold mb-1">STAGE 2</div>
              <h3 className="font-bold text-ivory text-xs mb-1">Equal Earth Grid</h3>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Observations are projected into EPSG:8857 (Equal Earth) at 1,000m resolution. Equal-area
                projection guarantees true regional fire density without high-latitude distortion.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">EPSG:8857 standard</span>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-light font-bold mb-1">STAGE 3</div>
              <h3 className="font-bold text-ivory text-xs mb-1">Proximity Matching</h3>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                MODIS and VIIRS candidate pairs are identified within a 1,500-meter spatial distance and
                a 60-minute overpass window using strict one-to-one Euclidean pairing.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">1-to-1 match assignment</span>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-light font-bold mb-1">STAGE 4</div>
              <h3 className="font-bold text-ivory text-xs mb-1">Classification</h3>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Every observation is deterministically classified as a Candidate Match, MODIS-Only, or
                VIIRS-Only detection. Sensor provenance and raw confidence are preserved.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">Preserves unmatched obs</span>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-teal-light font-bold mb-1">STAGE 5</div>
              <h3 className="font-bold text-ivory text-xs mb-1">Daily Aggregation</h3>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Observations are aggregated by UTC calendar date and Equal Earth grid cell, computing valid
                FRP sums, means, and peak intensities, exportable as RFC 4180 CSV and GeoJSON.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mt-2 block">RFC 4180 / GeoJSON</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PHYSICAL RADIOMETRY PRINCIPLES                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
        <div className="lg:col-span-2 bg-graphite-900 border border-slate-800 rounded-lg p-5 space-y-3">
          <SectionHeader
            title="Thermal Infrared Radiometry Principles"
            subtitle="Physics governing active fire emission detection from low Earth orbit"
          />

          <p className="text-slate-300 font-sans leading-relaxed text-xs">
            Wildfire detection relies on the Planck Radiation Law. Typical ambient Earth surfaces radiate peak thermal
            energy in the longwave infrared spectrum (~10–12 µm) at approximately 300 Kelvin. Actively flaming vegetation
            burns between 800 K and 1,200 K, dramatically shifting its peak spectral radiant emittance toward the
            middle-infrared (MIR) atmospheric window at 3.7–4.0 µm.
          </p>

          <p className="text-slate-300 font-sans leading-relaxed text-xs">
            By monitoring the differential brightness temperature between the mid-infrared channels (~3.9 µm) and
            thermal longwave channels (~11.0 µm), NASA algorithms detect sub-pixel flaming hotspots even when the fire
            occupies less than 0.1% of the total pixel footprint.
          </p>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800 font-mono text-xs space-y-1.5 mt-2">
            <div className="text-teal-light font-bold uppercase">Wien's Displacement Formulation:</div>
            <div className="text-ivory font-semibold text-sm">λ_max = 2898 µm·K / T</div>
            <div className="text-slate-400 text-[11px] font-sans">
              • Ambient Earth (T ≈ 300 K): λ_max ≈ 9.6 µm (Thermal Longwave IR)<br />
              • Flaming Wildfire (T ≈ 1000 K): λ_max ≈ 2.9 µm (Middle-Infrared Radiative Peak)
            </div>
          </div>
        </div>

        {/* Spacecraft Constellations Card */}
        <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Constellation Orbits"
              subtitle="Sun-synchronous polar passes"
            />
            <div className="space-y-2 mt-2">
              <div className="p-2.5 rounded bg-graphite-950 border border-slate-800">
                <span className="text-ochre-light font-bold block">TERRA (EOS AM-1)</span>
                <span className="text-slate-400 text-[11px]">Descending equator pass: ~10:30 AM local</span>
              </div>
              <div className="p-2.5 rounded bg-graphite-950 border border-slate-800">
                <span className="text-ochre-light font-bold block">AQUA (EOS PM-1)</span>
                <span className="text-slate-400 text-[11px]">Ascending equator pass: ~1:30 PM local</span>
              </div>
              <div className="p-2.5 rounded bg-graphite-950 border border-slate-800">
                <span className="text-teal-light font-bold block">SUOMI-NPP, NOAA-20 &amp; NOAA-21</span>
                <span className="text-slate-400 text-[11px]">Ascending equator pass: ~1:30 PM local (VIIRS)</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 font-sans">
            Altitude: ~705 km (MODIS) / ~824 km (VIIRS) • Inclination: ~98.7°
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. DEFINITIONS & KEY SCIENTIFIC TERMS                                     */}
      {/* ========================================================================= */}
      <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs">
        <SectionHeader
          title="Key Scientific Definitions &amp; Measurement Units"
          subtitle="Standard nomenclature employed across FireSync"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <h4 className="font-bold text-ivory text-xs mb-1">Fire Radiative Power (FRP)</h4>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              Measured in megawatts (MW). Quantifies the radiant energy released per unit time from actively burning
              biomass. FRP is proportional to the rate of biomass consumption (approximately 0.082 kg/s per MW of FRP)
              and atmospheric carbon emissions.
            </p>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <h4 className="font-bold text-ivory text-xs mb-1">Candidate Match vs. Physical Fire</h4>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              A Candidate Match indicates that MODIS and VIIRS detected fire activity within 1,500m and 60 minutes of
              each other. It is not an assertion that both sensors saw the exact same flame perimeter or that the
              measurements are cross-calibrated.
            </p>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <h4 className="font-bold text-ivory text-xs mb-1">Brightness Temperature (Kelvin)</h4>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              The apparent radiometric temperature of the ground pixel measured in the middle-infrared (3.9–4.0 µm) or
              thermal infrared (11 µm) spectral bands, calibrated against Planck blackbody functions.
            </p>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <h4 className="font-bold text-ivory text-xs mb-1">Equal Earth Coordinate System (EPSG:8857)</h4>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              An equal-area pseudocylindrical projection designed by Bojan Šavrič et al. (2018). It preserves relative area
              scale globally, ensuring regional fire density comparisons are statistically unbiased across latitudes.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. UNCERTAINTIES & SENSOR LIMITATIONS                                     */}
      {/* ========================================================================= */}
      <div className="bg-graphite-900 border border-slate-800 rounded-lg p-5 font-mono text-xs">
        <SectionHeader
          title="Measurement Uncertainties &amp; Operational Limitations"
          subtitle="Factors influencing satellite fire detectability"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-2">
          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <span className="text-terracotta font-bold block mb-1">Cloud &amp; Smoke Obscuration</span>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              Dense meteorological cloud cover and thick pyroconvective smoke can completely attenuate thermal radiation,
              producing false negatives until clear overpass conditions occur.
            </p>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <span className="text-ochre-light font-bold block mb-1">Pixel Expansion at Scan Edges</span>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              MODIS pixels expand up to ~2.0 × 4.8 km near the swath edge (the "bow-tie" effect), reducing sensitivity to
              isolated fires. VIIRS employs a 3-to-1 pixel aggregation algorithm to constrain pixel growth to &lt;2x.
            </p>
          </div>

          <div className="p-3.5 rounded bg-graphite-950 border border-slate-800">
            <span className="text-teal-light font-bold block mb-1">Diurnal Overpass Blind Spots</span>
            <p className="text-slate-300 font-sans leading-relaxed text-xs">
              Polar sun-synchronous satellites pass any given point approximately twice every 24 hours. Fast-moving
              agricultural burns occurring between overpass times cannot be detected by MODIS or VIIRS.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. DATA PROVENANCE & NASA CITATION                                        */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-lg bg-graphite-900 border border-slate-800 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="font-bold text-ivory block uppercase">Data Provenance &amp; Attribution</span>
          <p className="text-slate-400 text-[11px] font-sans mt-0.5">
            Active fire observations provided by NASA Land, Atmosphere Near real-time Capability for EOS (LANCE)
            Fire Information for Resource Management System (FIRMS).
          </p>
        </div>

        <a
          href="https://firms.modaps.eosdis.nasa.gov/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-ivory rounded font-medium flex items-center gap-1.5 transition-colors shrink-0"
        >
          <span>NASA FIRMS Map</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
