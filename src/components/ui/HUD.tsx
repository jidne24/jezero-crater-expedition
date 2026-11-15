import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Crosshair, MousePointer2, Snowflake, Volume2, VolumeX } from 'lucide-react';
import { setVirtualKey, triggerVirtualAction, useKeyboardDisplayState } from '../../hooks/useKeyboard';
import type { VirtualKey } from '../../hooks/useKeyboard';
import { getPowerRequirements, useGameStore } from '../../store/useGameStore';
import type { ActiveStation, PowerSystem, SolTasks } from '../../store/useGameStore';
import { KID_GLOSSARY } from '../../utils/nasaDataEngine';
import { useNavigationTelemetry } from '../../utils/navigationTelemetry';
import { SAMPLE_TUBES, STATIONS } from '../canvas/MarsOutpost';

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const formatPower = (value: number) => Number.isInteger(value) ? value.toString() : value.toFixed(1);

const Keycap = ({ label, pressed, virtualKey }: { label: string; pressed: boolean; virtualKey: VirtualKey }) => (
  <button
    type="button"
    aria-label={`${label} key`}
    data-ui-interactive
    data-pressed={pressed}
    onPointerDown={(event) => {
      event.stopPropagation();
      setVirtualKey(virtualKey, true);
    }}
    onPointerUp={(event) => {
      event.stopPropagation();
      setVirtualKey(virtualKey, false);
    }}
    onPointerLeave={() => setVirtualKey(virtualKey, false)}
    onPointerCancel={() => setVirtualKey(virtualKey, false)}
    onContextMenu={(event) => event.preventDefault()}
    className={`pointer-events-auto flex h-10 w-10 touch-none select-none items-center justify-center rounded-lg font-sans text-lg font-bold transition-all duration-75 md:h-12 md:w-12 md:rounded-xl lg:h-14 lg:w-[54px] ${pressed ? 'scale-95 bg-white text-slate-900 shadow-md' : 'border border-white/15 bg-slate-900/55 text-white/90 backdrop-blur-md'}`}
  >
    {label}
  </button>
);

const MiniKeycap = ({ label, pressed }: { label: string; pressed: boolean }) => (
  <kbd className={`min-w-5 rounded-md px-1.5 py-0.5 text-center font-mono text-xs font-bold transition-all duration-75 ${pressed ? 'scale-95 bg-white text-slate-900 shadow-md' : 'border border-white/20 bg-white/5 text-white/85'}`}>
    {label}
  </kbd>
);

const ActionPrompt = ({ icon, label, keyLabel, pressed, action }: {
  icon: string;
  label: string;
  keyLabel: string;
  pressed: boolean;
  action: 'interact' | 'jump' | 'togglePov' | 'sprint';
}) => {
  const isSprint = action === 'sprint';
  return (
    <button
      type="button"
      aria-label={label}
      data-ui-interactive
      onPointerDown={(event) => {
        event.stopPropagation();
        if (isSprint) setVirtualKey('shift', true);
        else triggerVirtualAction(action);
      }}
      onPointerUp={() => {
        if (isSprint) setVirtualKey('shift', false);
      }}
      onPointerLeave={() => {
        if (isSprint) setVirtualKey('shift', false);
      }}
      onPointerCancel={() => {
        if (isSprint) setVirtualKey('shift', false);
      }}
      className={`pointer-events-auto flex shrink-0 touch-none select-none items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 py-1 text-xs font-bold transition-colors ${pressed ? 'scale-95 bg-white/15 text-white' : 'text-white/75 hover:bg-white/10'}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <MiniKeycap label={keyLabel} pressed={pressed} />
    </button>
  );
};

const PowerToggle = ({ system, icon, label, shortcut, value, pressed }: {
  system: PowerSystem;
  icon: string;
  label: string;
  shortcut: string;
  value: number;
  pressed: boolean;
}) => {
  const action = system === 'thruster' ? 'power1' : system === 'thermal' ? 'power2' : 'power3';
  return (
    <button
      type="button"
      aria-label={`Boost ${label} by 10 percent`}
      title={`Boost ${label} by 10% · the other systems share the cost`}
      data-ui-interactive
      onPointerDown={(event) => {
        event.stopPropagation();
        triggerVirtualAction(action);
      }}
      className={`pointer-events-auto flex shrink-0 touch-none select-none cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-1 py-1 text-xs font-bold transition-colors ${pressed ? 'scale-95 bg-white text-slate-900' : 'text-white/85 hover:bg-white/10'}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <MiniKeycap label={shortcut} pressed={pressed} />
      <span className="w-9 text-right font-mono text-white">{formatPower(value)}%</span>
    </button>
  );
};

const Task = ({ complete, children }: { complete: boolean; children: ReactNode }) => (
  <span className={`whitespace-nowrap ${complete ? 'text-emerald-300' : 'text-white/70'}`}>
    {children}{complete && <span aria-label=" complete"> ✓</span>}
  </span>
);

const Vital = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <span className="flex items-center gap-2 whitespace-nowrap">
    <span>{label}</span>
    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/15">
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${clampPercent(value)}%` }} />
    </span>
    <strong className="w-9 font-mono">{Math.round(value)}%</strong>
  </span>
);

const getStationPrompt = (station: ActiveStation, tasks: SolTasks, dustLevel: number, carriedSamples: number): string | null => {
  switch (station) {
    case 'SOLAR_ARRAY': return dustLevel > 0 ? '[E] Clean Solar Panels' : 'Solar Panels Clean ✓';
    case 'HYDROPONICS': return tasks.cropsHarvested ? 'O₂ Crops Harvested ✓' : '[E] Harvest O₂ Crops';
    case 'RADAR_TOWER': return tasks.dishAligned ? 'Radar Aligned · Shield Online ✓' : '[E] Align the Radar';
    case 'ROVER':
      if (carriedSamples > 0) return '[E] Scan a Mars Sample';
      return tasks.samplesAnalyzed > 0 ? 'Sample Scanned by SHERLOC ✓' : 'Bring a golden sample tube to the Rover';
    case 'NONE': return null;
  }
};

const CARDINALS = [
  { label: 'N', bearing: 0 },
  { label: 'E', bearing: Math.PI / 2 },
  { label: 'S', bearing: Math.PI },
  { label: 'W', bearing: -Math.PI / 2 },
] as const;
const STATION_NAVIGATION: Record<Exclude<ActiveStation, 'NONE'>, { icon: string; label: string }> = {
  SOLAR_ARRAY: { icon: '☀️', label: 'Solar' },
  HYDROPONICS: { icon: '🌱', label: 'O₂ Dome' },
  RADAR_TOWER: { icon: '📡', label: 'Radar' },
  ROVER: { icon: '🤖', label: 'Rover' },
};
const COMPASS_HALF_ANGLE = Math.PI / 3;

const relativeBearing = (bearing: number, heading: number): number =>
  Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading));

const compassPosition = (relative: number): number => 50 + (relative / COMPASS_HALF_ANGLE) * 50;

const CompassRibbon = () => {
  const navigation = useNavigationTelemetry();
  const collectedSampleTubeIds = useGameStore((state) => state.collectedSampleTubeIds);
  const heading = -navigation.cameraYaw;
  let nearestSample: (typeof SAMPLE_TUBES)[number] | null = null;
  let nearestSampleDistance = Number.POSITIVE_INFINITY;

  for (const sample of SAMPLE_TUBES) {
    if (collectedSampleTubeIds.includes(sample.id)) continue;
    const distance = Math.hypot(
      navigation.playerX - sample.position[0],
      navigation.playerZ - sample.position[2],
    );
    if (distance < nearestSampleDistance) {
      nearestSample = sample;
      nearestSampleDistance = distance;
    }
  }

  return (
    <section aria-label="Compass and mission navigation" className="absolute top-3 left-1/2 h-[70px] w-[42vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-100/20 bg-slate-950/65 text-xs shadow-[0_0_30px_rgba(34,211,238,0.08)] backdrop-blur-md md:text-sm lg:w-[min(580px,48vw)]">
      <div className="absolute inset-x-0 top-0 h-7 border-b border-white/10 bg-white/[0.03]">
        {CARDINALS.map((cardinal) => {
          const relative = relativeBearing(cardinal.bearing, heading);
          if (Math.abs(relative) > COMPASS_HALF_ANGLE) return null;
          return (
            <span key={cardinal.label} className="absolute top-1 -translate-x-1/2 font-mono text-xs font-bold tracking-widest text-white/90 transition-[left] duration-100 ease-linear" style={{ left: `${compassPosition(relative)}%` }}>
              {cardinal.label}
            </span>
          );
        })}
      </div>
      <div className="absolute top-[26px] left-1/2 h-2 w-px bg-orange-300 shadow-[0_0_8px_#fb923c]" />
      <div className="absolute inset-x-2 bottom-1 h-8">
        {STATIONS.map((station) => {
          const navigationIcon = STATION_NAVIGATION[station.id];
          const bearing = Math.atan2(
            station.position[0] - navigation.playerX,
            -(station.position[2] - navigation.playerZ),
          );
          const relative = relativeBearing(bearing, heading);
          const isOffscreen = Math.abs(relative) > COMPASS_HALF_ANGLE;
          const markerPosition = Math.min(90, Math.max(10, compassPosition(relative)));
          const distance = Math.round(Math.hypot(
            navigation.playerX - station.position[0],
            navigation.playerZ - station.position[2],
          ));
          return (
            <span key={station.id} title={`${navigationIcon.label} · ${distance}m`} aria-label={`${navigationIcon.label}, ${distance} meters${isOffscreen ? ', off screen' : ''}`} className={`absolute bottom-0 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-cyan-100 transition-[left] duration-100 ease-linear ${isOffscreen ? 'opacity-60' : ''}`} style={{ left: `${markerPosition}%` }}>
              {isOffscreen && <span aria-hidden="true">{relative < 0 ? '‹' : '›'}</span>}
              <span aria-hidden="true">{navigationIcon.icon}</span>
              <span className="hidden sm:inline">{navigationIcon.label}</span>
            </span>
          );
        })}
        {nearestSample && (() => {
          const bearing = Math.atan2(
            nearestSample.position[0] - navigation.playerX,
            -(nearestSample.position[2] - navigation.playerZ),
          );
          const relative = relativeBearing(bearing, heading);
          const isOffscreen = Math.abs(relative) > COMPASS_HALF_ANGLE;
          const markerPosition = Math.min(90, Math.max(10, compassPosition(relative)));
          return (
            <span aria-label={`Nearest sample, ${Math.round(nearestSampleDistance)} meters${isOffscreen ? ', off screen' : ''}`} className={`absolute bottom-0 flex -translate-x-1/2 items-center gap-1 rounded-full border border-amber-200/25 bg-amber-950/75 px-1.5 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap text-amber-100 transition-[left] duration-100 ease-linear ${isOffscreen ? 'opacity-70' : ''}`} style={{ left: `${markerPosition}%` }}>
              {isOffscreen && <span aria-hidden="true">{relative < 0 ? '‹' : '›'}</span>}
              <span aria-hidden="true">🧪</span>{Math.round(nearestSampleDistance)}m
            </span>
          );
        })()}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 to-transparent" />
    </section>
  );
};

export const HUD = () => {
  const gameStatus = useGameStore((state) => state.gameStatus);
  const audioMuted = useGameStore((state) => state.audioMuted);
  const toggleAudioMuted = useGameStore((state) => state.toggleAudioMuted);
  const cameraPov = useGameStore((state) => state.cameraPov);
  const suitOxygenAndHeat = useGameStore((state) => state.suitOxygenAndHeat);
  const outpostIntegrity = useGameStore((state) => state.outpostIntegrity);
  const activeStation = useGameStore((state) => state.activeStation);
  const tasksCompleted = useGameStore((state) => state.tasksCompleted);
  const dustLevel = useGameStore((state) => state.dustLevel);
  const carriedSamples = useGameStore((state) => state.carriedSamples);
  const sampleTubesCollected = useGameStore((state) => state.sampleTubesCollected);
  const thrusterPower = useGameStore((state) => state.thrusterPower);
  const thermalPower = useGameStore((state) => state.thermalPower);
  const shieldSensorPower = useGameStore((state) => state.shieldSensorPower);
  const activeSol = useGameStore((state) => state.solsData[state.currentSolIndex]!);
  const pressed = useKeyboardDisplayState();
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isTouchDevice] = useState(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);
  const requirements = getPowerRequirements(activeSol);
  const showFrost = suitOxygenAndHeat < 45 || activeSol.weatherType === 'DEEP_FREEZE';
  const showRadiation = outpostIntegrity < 45 || activeSol.weatherType === 'SOLAR_STORM' || shieldSensorPower < requirements.requiredShield;
  const stationPrompt = getStationPrompt(activeStation, tasksCompleted, dustLevel, carriedSamples);
  const stationDefinition = STATIONS.find((station) => station.id === activeStation);

  useEffect(() => {
    const handlePointerLockChange = () => setIsPointerLocked(document.pointerLockElement !== null);
    handlePointerLockChange();
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  if (gameStatus !== 'PLAYING') return null;
  let weatherWarning: string | null = null;
  if (thermalPower < requirements.requiredThermal) weatherWarning = `Cold suit + CSA crops! [2] Heater needs ${Math.ceil(requirements.requiredThermal)}%`;
  else if (shieldSensorPower < requirements.requiredShield) weatherWarning = `DONKI/RadLab alert! [3] Shield needs ${Math.ceil(requirements.requiredShield)}%`;
  else if (thrusterPower < requirements.requiredMobility) weatherWarning = `Mars headwind! [1] Mobility needs ${Math.ceil(requirements.requiredMobility)}%`;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden font-sans">
      <div className="helmet-visor-vignette absolute inset-0" />
      {showFrost && <div className="visor-frost absolute inset-0"><Snowflake className="absolute top-20 left-3 h-5 w-5 text-cyan-100" aria-hidden="true" /></div>}
      {showRadiation && <div className="radiation-static absolute inset-0" />}

      <section aria-label="Suit and outpost vitals" className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/55 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur-md md:gap-3 md:px-4 md:text-sm">
        <Vital label="O₂" value={suitOxygenAndHeat} color={suitOxygenAndHeat < 45 ? 'bg-red-400' : 'bg-orange-300'} />
        <span className="h-4 w-px bg-white/15" />
        <Vital label="Shield" value={outpostIntegrity} color={outpostIntegrity < 45 ? 'bg-red-400' : 'bg-sky-300'} />
        <span className="hidden text-amber-200 lg:inline">🧪 {sampleTubesCollected}</span>
      </section>
      <button type="button" data-ui-interactive onClick={toggleAudioMuted} aria-label={audioMuted ? 'Unmute NASA audio [M]' : 'Mute NASA audio [M]'} title="NASA audio · [M]" className="pointer-events-auto absolute top-14 left-3 flex h-8 w-8 touch-none select-none items-center justify-center rounded-full border border-white/15 bg-slate-900/55 text-white/85 backdrop-blur-md hover:bg-white/15">
        {audioMuted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      </button>

      <CompassRibbon />
      <div className="absolute top-[88px] left-1/2 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 text-center">
        <div className="flex items-center justify-center gap-3 rounded-full border border-white/15 bg-slate-900/55 px-4 py-2 text-xs font-bold whitespace-nowrap backdrop-blur-md">
          <span className="text-orange-300" title={KID_GLOSSARY.sol}>SOL {activeSol.sol}/5</span>
          <span className="text-white/50">ANY 3:</span>
          <Task complete={tasksCompleted.panelsCleaned}>☀️ Solar</Task>
          <Task complete={tasksCompleted.cropsHarvested}>🌱 O₂</Task>
          <Task complete={tasksCompleted.dishAligned}>📡 Radar</Task>
          <Task complete={tasksCompleted.samplesAnalyzed > 0}>🤖 Sample</Task>
        </div>
        {stationPrompt && <p title={stationDefinition ? `${stationDefinition.marsTrekCoords}\n${stationDefinition.resourceName}: ${stationDefinition.resourceRole}${activeStation === 'HYDROPONICS' ? `\n${KID_GLOSSARY.hydroponics}` : ''}` : undefined} className="mt-2 inline-block rounded-full border border-white/15 bg-slate-900/70 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-md">{stationPrompt}</p>}
        {weatherWarning && <p title={thermalPower < requirements.requiredThermal ? KID_GLOSSARY.hydroponics : shieldSensorPower < requirements.requiredShield ? KID_GLOSSARY.radiation : undefined} role="alert" className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{weatherWarning}</p>}
      </div>

      {cameraPov === 'FIRST_PERSON' && <div aria-label="First-person reticle" className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-sky-200/60"><Crosshair className="h-full w-full" aria-hidden="true" /></div>}
      <p className="absolute bottom-36 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/55 px-3 py-1 text-xs font-bold whitespace-nowrap text-white/75 backdrop-blur-md"><MousePointer2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> {isTouchDevice ? 'Swipe Mars to look around' : `Press [C] to Lock/Free Cursor${isPointerLocked ? ' · Locked' : ''}`}</p>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex w-full items-end justify-between gap-2 px-3 pb-3 md:gap-4 md:px-6 md:pb-5">
        <div aria-label="WASD movement controls" className="pointer-events-auto grid shrink-0 touch-none select-none grid-cols-3 gap-1.5 w-[132px] md:w-[156px] lg:w-[174px]">
          <div aria-hidden="true" />
          <Keycap label="W" virtualKey="w" pressed={pressed.w} />
          <div aria-hidden="true" />
          <Keycap label="A" virtualKey="a" pressed={pressed.a} />
          <Keycap label="S" virtualKey="s" pressed={pressed.s} />
          <Keycap label="D" virtualKey="d" pressed={pressed.d} />
        </div>

        <div className="flex min-w-0 justify-center px-0 md:px-2">
          <div className="pointer-events-auto flex max-w-[calc(100vw-290px)] touch-none select-none flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/15 bg-slate-900/55 px-3 py-2 text-xs backdrop-blur-md md:max-w-fit md:rounded-full md:px-6 md:text-sm" aria-label="Actions and 110 watt power allocation">
            <ActionPrompt icon="⚡" label="Interact" keyLabel="E" action="interact" pressed={pressed.e} />
            <ActionPrompt icon="🏃" label="Jump" keyLabel="Space" action="jump" pressed={pressed.space} />
            <ActionPrompt icon="💨" label="Sprint" keyLabel="Shift" action="sprint" pressed={pressed.shift} />
            <ActionPrompt icon="🎥" label="POV" keyLabel="V" action="togglePov" pressed={pressed.v} />
            <span className="hidden h-5 w-px shrink-0 bg-white/15 lg:block" />
            <span className="hidden shrink-0 font-mono text-xs font-bold text-white/55 lg:inline">110W</span>
            <PowerToggle system="thruster" icon="🚀" label="Speed" shortcut="1" value={thrusterPower} pressed={pressed.key1} />
            <PowerToggle system="thermal" icon="🔥" label="Heater" shortcut="2" value={thermalPower} pressed={pressed.key2} />
            <PowerToggle system="shieldSensor" icon="🛡️" label="Shield" shortcut="3" value={shieldSensorPower} pressed={pressed.key3} />
          </div>
        </div>

        <div aria-label="Arrow movement controls" className="pointer-events-auto grid shrink-0 touch-none select-none grid-cols-3 gap-1.5 w-[132px] md:w-[156px] lg:w-[174px]">
          <div aria-hidden="true" />
          <Keycap label="↑" virtualKey="up" pressed={pressed.up} />
          <div aria-hidden="true" />
          <Keycap label="←" virtualKey="left" pressed={pressed.left} />
          <Keycap label="↓" virtualKey="down" pressed={pressed.down} />
          <Keycap label="→" virtualKey="right" pressed={pressed.right} />
        </div>
      </div>
    </div>
  );
};
