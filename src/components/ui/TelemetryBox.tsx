import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ChevronDown, ChevronUp, Database, FileUp, RefreshCw, Shuffle } from 'lucide-react';
import { getAvailablePowerWatts, getPowerRequirements, SAMPLE_SCIENCE, useGameStore } from '../../store/useGameStore';
import type { MarsPhoto } from '../../store/useGameStore';
import {
  CURATED_DATA_SOURCE_LABEL,
  getKidScienceGuide,
  KID_GLOSSARY,
  LIVE_DATA_SOURCE_LABEL,
  MARS_ROVER_PHOTO,
  OFFICIAL_CHALLENGE_RESOURCES,
} from '../../utils/nasaDataEngine';

const KidCard = ({ title, children, className }: { title: string; children: ReactNode; className: string }) => (
  <section className={`rounded-xl border p-3 ${className}`}>
    <h4 className="text-sm font-bold text-white">{title}</h4>
    <p className="mt-1.5 text-xs leading-relaxed text-white/80">{children}</p>
  </section>
);

const MarsPhotoCard = ({ photo, context }: { photo: MarsPhoto; context: string }) => {
  const [useFallback, setUseFallback] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl border border-orange-200/25 bg-slate-950/70">
      {useFallback ? (
        <svg viewBox="0 0 640 260" role="img" aria-label="Offline procedural illustration of the Jezero sample depot; the NASA photograph could not be loaded" className="block aspect-[2.4/1] w-full">
          <defs>
            <linearGradient id="offline-mars-sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d98b5f" /><stop offset="1" stopColor="#f2bd8a" /></linearGradient>
            <linearGradient id="offline-mars-ground" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a84c2c" /><stop offset="1" stopColor="#592619" /></linearGradient>
          </defs>
          <rect width="640" height="260" fill="url(#offline-mars-sky)" />
          <path d="M0 135 95 82 180 126 280 62 390 126 500 78 640 132V260H0Z" fill="#7e3d29" opacity=".75" />
          <path d="M0 154Q170 120 330 154T640 145V260H0Z" fill="url(#offline-mars-ground)" />
          {[95, 190, 290, 395, 510].map((x) => <g key={x} transform={`translate(${x} 186)`}><rect x="-7" y="-28" width="14" height="42" rx="6" fill="#f7c948" /><rect x="-8" y="-30" width="16" height="7" rx="2" fill="#f1f5f9" /><ellipse cy="15" rx="15" ry="4" fill="#3b1710" opacity=".45" /></g>)}
          <text x="18" y="238" fill="#fff7ed" fontSize="16" fontFamily="sans-serif">Offline illustration — NASA photo unavailable</text>
        </svg>
      ) : (
        <img src={photo.url} alt={photo.caption} loading="lazy" className="aspect-[2.4/1] w-full bg-orange-950/30 object-cover" onError={() => setUseFallback(true)} />
      )}
      <figcaption className="space-y-1 p-3 text-[11px] leading-relaxed">
        <div className="font-bold text-amber-200">{context} · Real NASA rover photograph</div>
        <div className="text-white/75">{photo.description}</div>
        <div className="text-white/55">Captured on mission Sol {photo.capturedSol} · {photo.capturedOn}</div>
        <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="block break-words font-semibold text-sky-200 hover:text-white">{photo.credit} ↗</a>
      </figcaption>
    </figure>
  );
};

const EffectPill = ({ icon, label, status, detail, tone }: {
  icon: string;
  label: string;
  status: string;
  detail: string;
  tone: 'good' | 'warn' | 'boost';
}) => {
  const toneClass = tone === 'warn'
    ? 'border-amber-300/30 bg-amber-400/10 text-amber-100'
    : tone === 'boost'
      ? 'border-sky-300/30 bg-sky-400/10 text-sky-100'
      : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100';
  return (
    <div className={`rounded-xl border p-2 text-center ${toneClass}`}>
      <div className="text-lg" aria-hidden="true">{icon}</div>
      <div className="mt-0.5 text-[11px] font-bold text-white/85">{label}</div>
      <div className="mt-1 rounded-full bg-white/10 px-1 py-0.5 text-[10px] font-extrabold">{status}</div>
      <div className="mt-1 text-[10px] text-white/60">{detail}</div>
    </div>
  );
};

const getEffectStatus = (power: number, required: number, lowLabel: string) => {
  if (power < required) return { status: lowLabel, tone: 'warn' as const };
  if (power >= required + 8) return { status: 'Boosted!', tone: 'boost' as const };
  return { status: 'Normal', tone: 'good' as const };
};

export const TelemetryBox = () => {
  const gameStatus = useGameStore((state) => state.gameStatus);
  const activeSol = useGameStore((state) => state.solsData[state.currentSolIndex]!);
  const cropHealth = useGameStore((state) => state.cropHealth);
  const sampleNoticeId = useGameStore((state) => state.sampleNoticeId);
  const lastSampleFact = useGameStore((state) => state.lastSampleFact);
  const lastSampleTubeId = useGameStore((state) => state.lastSampleTubeId);
  const liveApiReports = useGameStore((state) => state.liveApiReports);
  const missionSeed = useGameStore((state) => state.missionSeed);
  const dustLevel = useGameStore((state) => state.dustLevel);
  const thrusterPower = useGameStore((state) => state.thrusterPower);
  const thermalPower = useGameStore((state) => state.thermalPower);
  const shieldSensorPower = useGameStore((state) => state.shieldSensorPower);
  const dataSourceLabel = useGameStore((state) => state.dataSourceLabel);
  const dataSourceMode = useGameStore((state) => state.dataSourceMode);
  const isLiveSyncing = useGameStore((state) => state.isLiveSyncing);
  const liveSyncMessage = useGameStore((state) => state.liveSyncMessage);
  const importNasaData = useGameStore((state) => state.importNasaData);
  const syncLiveNasaApis = useGameStore((state) => state.syncLiveNasaApis);
  const shuffleMissionSols = useGameStore((state) => state.shuffleMissionSols);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'SCIENCE' | 'DOSSIER'>('SCIENCE');
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.code === 'KeyT' && !event.repeat) setIsExpanded((expanded) => !expanded);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isExpanded && document.pointerLockElement) void document.exitPointerLock();
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded) document.getElementById('nasa-pds-telemetry')?.scrollTo({ top: 0 });
  }, [activeTab, isExpanded]);

  if (gameStatus === 'MENU' || gameStatus === 'VICTORY') return null;

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setImportFeedback({ type: 'error', message: 'Choose a JSON or CSV file smaller than 25 MB.' });
      return;
    }
    setIsImporting(true);
    setImportFeedback(null);
    try {
      importNasaData(await file.text(), file.name);
      setImportFeedback({ type: 'success', message: `${file.name} loaded: five playable Sol missions generated with NASA/CSA context.` });
    } catch (error) {
      setImportFeedback({ type: 'error', message: error instanceof Error ? error.message : 'This dataset could not be read.' });
    } finally {
      setIsImporting(false);
    }
  };

  const guide = getKidScienceGuide(activeSol);
  const requirements = getPowerRequirements(activeSol);
  const isLive = dataSourceMode === 'LIVE_NASA_API';
  const sourceDetails = isLive ? dataSourceLabel : '';
  const activePhoto = activeSol.marsPhoto ?? MARS_ROVER_PHOTO;
  const samplePhoto = lastSampleTubeId === null
    ? activePhoto
    : SAMPLE_SCIENCE[lastSampleTubeId]?.marsPhoto ?? activePhoto;
  const availableWatts = getAvailablePowerWatts(dustLevel);
  const oxygenBaseline = activeSol.o2ConsumptionKgDay ?? 0.84;
  const harvestRecovery = Math.round(35 * (oxygenBaseline / 0.84));
  const fogTarget = Math.max(activeSol.visualEnvironment.fogDensity, 0.004 + activeSol.dustOpticalDepthTau * 0.0095);
  const speedStatus = getEffectStatus(thrusterPower, requirements.requiredMobility, 'Boost [1]!');
  const heaterStatus = getEffectStatus(thermalPower, requirements.requiredThermal, 'Fast Drain!');
  const shieldStatus = getEffectStatus(shieldSensorPower, requirements.requiredShield, 'Fast Drain!');
  const judgeProofs = [
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[0],
      reading: `${activeSol.airTempCelsius.toFixed(1)}°C · ${activeSol.pressurePascal.toFixed(0)} Pa · Tau ${activeSol.dustOpticalDepthTau.toFixed(2)}`,
      effect: `Heater need ${Math.ceil(requirements.requiredThermal)}%. Fog target ${fogTarget.toFixed(4)} = max(profile, 0.004 + 0.0095τ). Dust adds ${(activeSol.dustOpticalDepthTau * 2).toFixed(1)}/s when τ > 0.8; P = 110 − 0.4 × dust = ${availableWatts.toFixed(1)}W.`,
    },
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[1],
      reading: `${activeSol.donkiFlareClass} · CME ${activeSol.donkiCmeSpeedKms.toLocaleString()} km/s · ${activeSol.donkiEventId}`,
      effect: 'The solar-storm scenario activates the ultraviolet aurora and radar-alignment task. DONKI event context drives the radio warning; RadLab dose sets the numeric Shield demand.',
    },
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[3],
      reading: `${activeSol.radLabDoseMicroGyDay.toLocaleString()} µGy/day scenario dose · ISS comparison ≈280 µGy/day`,
      effect: `Radiation demand = clamp(34 + max(0, dose − 210) / 80, 34, 80). Dust can raise it further; today’s Shield requirement is ${Math.ceil(requirements.requiredShield)}%.`,
    },
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[2],
      reading: `${activeSol.osdrStudyId} · spaceflight bones, muscles, immunity, and plant biology`,
      effect: 'Perseverance sample scans reveal this study’s finding. The 0.38g jump model and kid health tips connect low gravity to bone and muscle care.',
    },
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[4],
      reading: activeSol.marsTrekCoords,
      effect: 'Jezero coordinates and −2,540m MOLA elevation anchor the outpost location, station labels, sample discoveries, and compass waypoints.',
    },
    {
      resource: OFFICIAL_CHALLENGE_RESOURCES[5],
      reading: `CSA crop toolkit · ${oxygenBaseline.toFixed(2)} kg O₂/day crew-use reference`,
      effect: `Greenhouse harvest restores up to ${harvestRecovery} suit O₂ points (35 × baseline / 0.84) and 30 crop-health points. Thermal [2] protects the recirculating crop trays.`,
    },
  ];

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-col items-end gap-3">
      <aside
        aria-label="Mars weather and science guide"
        className={isExpanded
          ? 'pointer-events-auto max-h-[72dvh] w-[92vw] max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-md'
          : 'pointer-events-auto w-52 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/15 bg-slate-900/55 text-xs text-white backdrop-blur-md md:w-64 md:text-sm'}
      >
        <div className={`${isExpanded ? '' : 'border-b border-white/10 px-3 py-2'} flex items-center justify-between gap-2`}>
          <span className="font-display text-sm font-bold text-white">🪐 MARS WEATHER</span>
          <span title={KID_GLOSSARY.sol} className="shrink-0 rounded-md bg-orange-600 px-2 py-0.5 font-mono text-xs font-bold text-white">Sol {activeSol.sol}/5</span>
        </div>

        {!isExpanded && (
          <div className="space-y-2 p-3 text-sm font-bold text-white">
            <p className="flex items-center justify-between gap-2"><span>🌡️ Air Temp</span><span className="text-right text-orange-300">{Math.round(activeSol.airTempCelsius)}°C <span className="text-[10px] text-white/60">(Freezing!)</span></span></p>
            <p className="flex items-center justify-between gap-2"><span>💨 Wind</span><span className="text-right text-sky-300">{Math.round(activeSol.windSpeedMps)} m/s <span className="text-[10px] text-white/60">({guide.windLabel})</span></span></p>
            <p className="flex items-center justify-between gap-2"><span>☀️ Space Sky</span><span className={`text-right text-xs ${activeSol.weatherType === 'SOLAR_STORM' ? 'text-violet-200' : 'text-amber-200'}`}>{guide.skyLabel}</span></p>
          </div>
        )}

        {isExpanded && (
          <div id="nasa-pds-telemetry">
            <div role="tablist" aria-label="Mars science and data sources" className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
              <button id="kid-guide-tab" type="button" role="tab" aria-selected={activeTab === 'SCIENCE'} aria-controls="kid-guide-panel" onClick={() => setActiveTab('SCIENCE')} className={`cursor-pointer rounded-lg px-2 py-2 text-xs font-bold ${activeTab === 'SCIENCE' ? 'bg-sky-300 text-slate-950' : 'text-white/70 hover:bg-white/10'}`}>🎒 Kid&apos;s Mars Guide</button>
              <button id="judge-data-tab" type="button" role="tab" aria-selected={activeTab === 'DOSSIER'} aria-controls="judge-data-panel" onClick={() => setActiveTab('DOSSIER')} className={`cursor-pointer rounded-lg px-2 py-2 text-xs font-bold ${activeTab === 'DOSSIER' ? 'bg-amber-300 text-slate-950' : 'text-white/70 hover:bg-white/10'}`}>🏆 Judge Data Dossier</button>
            </div>

            {activeTab === 'SCIENCE' ? (
              <div id="kid-guide-panel" role="tabpanel" aria-labelledby="kid-guide-tab" className="mt-3 space-y-3">
                <section>
                  <h3 className="font-display text-lg font-bold text-sky-200">1. Today on Mars vs. Earth</h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/65">A Sol is one Martian day: 24 hours and 39 minutes. Today’s sky: <strong className="text-amber-200">{guide.skyLabel}</strong></p>
                </section>
                <MarsPhotoCard photo={activePhoto} context={`Mission Sol ${activeSol.sol}/5`} />
                <KidCard title={`🌡️ Temperature (${Math.round(activeSol.airTempCelsius)}°C)`} className="border-orange-300/25 bg-orange-400/10">
                  {guide.temperature}
                </KidCard>
                <KidCard title="🛡️ Space Sun Energy · NASA RadLab" className="border-violet-300/25 bg-violet-400/10">
                  {guide.radiation}
                </KidCard>
                <KidCard title="🌱 Space Food & Air · CSA Greenhouse" className="border-emerald-300/25 bg-emerald-400/10">
                  {guide.spaceFood}
                  <span className="mt-2 flex items-center gap-2 text-[11px] font-bold text-emerald-100">
                    <span>Greenhouse health</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className={`block h-full ${cropHealth < 50 ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${cropHealth}%` }} /></span>
                    <span>{Math.round(cropHealth)}%</span>
                  </span>
                </KidCard>
                <KidCard title="🦴 Jumping in 0.38g Gravity · NASA OSDR" className="border-sky-300/25 bg-sky-400/10">
                  {guide.gravity}
                </KidCard>
                <p className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">💡 <strong>Your mission:</strong> {guide.whatToDoKidTip}</p>

                <section className="border-t border-white/10 pt-3">
                  <h3 className="font-display text-base font-bold text-sky-200">2. How Weather Changes Your Suit Right Now</h3>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <EffectPill icon="🚀" label="Jetpack Speed" status={speedStatus.status} tone={speedStatus.tone} detail={`${Math.round(thrusterPower)}% · need ${Math.ceil(requirements.requiredMobility)}%`} />
                    <EffectPill icon="🔥" label="Heater Drain" status={heaterStatus.status} tone={heaterStatus.tone} detail={`${Math.round(thermalPower)}% · need ${Math.ceil(requirements.requiredThermal)}%`} />
                    <EffectPill icon="🛡️" label="Shield Drain" status={shieldStatus.status} tone={shieldStatus.tone} detail={`${Math.round(shieldSensorPower)}% · need ${Math.ceil(requirements.requiredShield)}%`} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/65">{guide.dataToGameEffect}</p>
                </section>
              </div>
            ) : (
              <div id="judge-data-panel" role="tabpanel" aria-labelledby="judge-data-tab" className="mt-3 space-y-3">
                <section>
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold text-amber-200"><Database className="h-5 w-5" aria-hidden="true" /> Judge Data Dossier</h3>
                  <div className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold ${isLive ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-sky-300/30 bg-sky-400/10 text-sky-200'}`}>
                    {isLive ? LIVE_DATA_SOURCE_LABEL : CURATED_DATA_SOURCE_LABEL}
                  </div>
                  {sourceDetails && <p className="mt-2 break-words text-[11px] leading-relaxed text-white/55">{sourceDetails}</p>}
                  <p className="mt-2 text-xs leading-relaxed text-white/65">Bundled Sols are curated training scenarios, not live measurements. Live sync updates only returned DONKI, APOD, and OSDR metadata.</p>
                </section>
                <MarsPhotoCard photo={activePhoto} context={`Mission Sol ${activeSol.sol}/5`} />

                <section className="space-y-2">
                  <button type="button" disabled={isLiveSyncing} onClick={() => void syncLiveNasaApis()} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-100/25 bg-cyan-400/10 px-3 py-2.5 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60">
                    <RefreshCw className={`h-4 w-4 shrink-0 ${isLiveSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {isLiveSyncing ? 'Contacting NASA APIs…' : '🔄 Connect Live NASA APIs'}
                  </button>
                  {liveApiReports.length > 0 && (
                    <section aria-label="Live NASA API HTTP results" className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
                      <h4 className="text-xs font-bold text-white">Actual API responses</h4>
                      {liveApiReports.map((report) => (
                        <div key={report.name} className="rounded-lg border border-white/10 p-2 text-[11px] leading-relaxed">
                          <div className="flex items-center justify-between gap-2">
                            <strong>{report.name}</strong>
                            <span className={report.ok ? 'font-bold text-emerald-300' : 'font-bold text-amber-300'}>{report.status === 0 ? 'NETWORK ERROR' : `HTTP ${report.status}`}</span>
                          </div>
                          <p className="mt-1 break-words text-white/65">{report.detail}</p>
                          <a href={report.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sky-300/80 hover:text-sky-100">Official endpoint ↗</a>
                        </div>
                      ))}
                    </section>
                  )}
                  <input ref={fileInputRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={handleUpload} aria-label="NASA JSON or CSV dataset" />
                  <button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15 disabled:cursor-wait disabled:opacity-60">
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    {isImporting ? 'Reading dataset…' : '📂 Load Custom JSON/CSV'}
                  </button>
                  {liveSyncMessage && <p role="status" aria-live="polite" className={`rounded-lg border p-2 text-xs leading-relaxed ${isLive ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'}`}>{liveSyncMessage}</p>}
                  {importFeedback && <p role={importFeedback.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-lg border p-2 text-xs font-semibold ${importFeedback.type === 'error' ? 'border-red-400/40 bg-red-950/50 text-red-200' : 'border-emerald-400/30 bg-emerald-950/50 text-emerald-200'}`}>{importFeedback.message}</p>}
                </section>

                <section className="border-t border-white/10 pt-3">
                  <h4 className="text-sm font-bold text-white">Data-to-Game Mechanics Proof</h4>
                  <p className="mt-1 text-xs text-white/60">Each official source links to its NASA or CSA page. Values and formulas describe the current Sol.</p>
                  <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full border-collapse text-left text-[11px] leading-relaxed">
                      <thead className="bg-white/10 text-white/85"><tr><th scope="col" className="p-2">Official source & reading</th><th scope="col" className="p-2">Game effect</th></tr></thead>
                      <tbody>
                        {judgeProofs.map(({ resource, reading, effect }, index) => (
                          <tr key={resource.name} className="border-t border-white/10 align-top odd:bg-white/[0.03]">
                            <td className="min-w-40 p-2">
                              <a href={resource.url} target="_blank" rel="noreferrer" className="font-bold text-sky-200 hover:text-white">{index + 1}. {resource.name} ↗</a>
                              <span className="mt-1 block break-words text-white/60">{reading}</span>
                            </td>
                            <td className="min-w-44 p-2 text-white/75">{effect}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="border-t border-white/10 pt-3">
                  <h4 className="text-sm font-bold text-white">Archive record citations</h4>
                  {activeSol.archiveNote && <p className="mt-1 text-xs leading-relaxed text-amber-100/75">{activeSol.archiveNote}</p>}
                  <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-white/60">
                    {(activeSol.recordCitations ?? []).map((citation) => <li key={citation} className="break-words border-l-2 border-sky-300/25 pl-2">{citation}</li>)}
                  </ul>
                </section>

                <section className="border-t border-white/10 pt-3">
                  <button type="button" onClick={shuffleMissionSols} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-orange-100/25 bg-orange-400/10 px-3 py-2.5 text-xs font-bold text-orange-100 hover:bg-orange-400/20">
                    <Shuffle className="h-4 w-4" aria-hidden="true" /> 🎲 Shuffle Archived Space Weather
                  </button>
                  <p className="mt-2 text-center text-[10px] text-white/55">Mission seed {missionSeed} · Sol 1 stays the tutorial; later events shuffle without changing any archived measurement.</p>
                  <p className="mt-2 text-[10px] leading-relaxed text-white/50">Imported records are normalized into five Sols with matching DONKI, OSDR, Mars Trek, and CSA context. Imports remain archive data.</p>
                </section>
              </div>
            )}
          </div>
        )}

        <button type="button" aria-expanded={isExpanded} aria-controls="nasa-pds-telemetry" onClick={() => setIsExpanded((expanded) => !expanded)} className={`${isExpanded ? 'sticky bottom-0 mt-3 rounded-xl border border-white/15' : 'border-t border-white/10'} flex w-full shrink-0 cursor-pointer items-center justify-center gap-1 bg-slate-900/95 px-2 py-2.5 text-xs font-bold text-sky-200 backdrop-blur-md hover:bg-slate-800/95`}>
          {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          {isExpanded ? 'Close Mars Guide [T]' : '📖 Mars Kid Guide & NASA Data [T]'}
        </button>
      </aside>
      {sampleNoticeId > 0 && (
        <div key={sampleNoticeId} className="sample-toast max-w-sm rounded-2xl border border-white/20 bg-slate-900/70 px-4 py-3 text-sm font-bold text-amber-200 backdrop-blur-md" aria-live="polite">
          <div>+1 Mars Sample!</div>
          {lastSampleFact && <p className="mt-1 text-xs leading-relaxed font-semibold text-white/85">{lastSampleFact}</p>}
          <div className="mt-3">
            <MarsPhotoCard photo={samplePhoto} context={`Sample Discovery ${lastSampleTubeId === null ? '' : lastSampleTubeId + 1}`} />
          </div>
        </div>
      )}
    </div>
  );
};
