import { create } from 'zustand';
import {
  CURATED_DATA_SOURCE_LABEL,
  getKidScienceGuide,
  getSolResourceContext,
  LIVE_DATA_SOURCE_LABEL,
  MARS_ROVER_PHOTO,
  parseNasaDataset,
  randomizeMissionSols,
  syncLiveNasaOpenApis,
} from '../utils/nasaDataEngine';
import type { LiveNasaEndpointReport } from '../utils/nasaDataEngine';
import {
  playPowerShift,
  playSafetyAlert,
  playSamplePickup,
  playStationComplete,
  playUiClick,
  setSoundMuted,
  stopDialogue,
  stopRocketLaunchSound,
  stopVictoryFanfare,
} from '../utils/soundEngine';

export interface VisualEnvironment {
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  sunIntensity: number;
  dustParticleSpeed: number;
}

export interface MarsPhoto {
  url: string;
  credit: string;
  caption: string;
  description: string;
  capturedSol: number;
  capturedOn: string;
  sourceUrl: string;
}

export interface SolTelemetry {
  sol: number;
  sourceSol?: number;
  nightLowTempCelsius?: number;
  recordCitations?: string[];
  archiveNote?: string;
  marsPhoto?: MarsPhoto;
  title: string;
  weatherType: 'CLEAR' | 'DUST_DEVIL' | 'DEEP_FREEZE' | 'SOLAR_STORM' | 'MEGA_STORM';
  airTempCelsius: number;
  groundTempCelsius: number;
  pressurePascal: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  solarIrradianceWm2: number;
  dustOpticalDepthTau: number;
  radiationDoseMicroGyDay: number;
  radLabDoseMicroGyDay: number;
  donkiEventId: string;
  donkiFlareClass: string;
  donkiCmeSpeedKms: number;
  donkiSepEvent: boolean;
  donkiAlert: string;
  osdrStudyId: string;
  osdrFinding: string;
  csaFoodStatus: string;
  marsTrekCoords: string;
  o2ConsumptionKgDay?: number;
  kidFriendlySummary?: string;
  earthComparison?: string;
  whatToDoKidTip?: string;
  dataToGameEffect?: string;
  visualEnvironment: VisualEnvironment;
  missionBrief: string;
  optimalTradeoffHint: string;
}

export interface NasaMetadata {
  source: string;
  location: string;
  powerSource: string;
  baseOutputWatts: number;
}

export interface NasaDataset {
  metadata: NasaMetadata;
  sols: SolTelemetry[];
}

export type GameStatus = 'MENU' | 'PLAYING' | 'SOL_COMPLETE' | 'GAME_OVER' | 'VICTORY';
export type DataSourceMode = 'VERIFIED_ARCHIVE' | 'LIVE_NASA_API';
export type CameraPov = 'THIRD_PERSON' | 'FIRST_PERSON';
export type PowerSystem = 'thruster' | 'thermal' | 'shieldSensor';
export type ActiveStation = 'NONE' | 'HYDROPONICS' | 'SOLAR_ARRAY' | 'RADAR_TOWER' | 'ROVER';
export type OnboardingPhase = 'TITLE_SCREEN' | 'PRE_FLIGHT_DIALOGUE' | 'BOARDING_LAUNCH' | 'MARS_LANDING' | 'COMPLETE';
export type OnboardingStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type VictoryPhase = 'MARS_BOARDING_ASCENT' | 'DEEP_SPACE_TRANSIT' | 'EARTH_PARACHUTE_LANDING' | 'EARTH_WELCOME_CEREMONY';

export interface SolTasks {
  panelsCleaned: boolean;
  cropsHarvested: boolean;
  dishAligned: boolean;
  samplesAnalyzed: number;
}

export const SAMPLE_SCIENCE = [
  {
    marsPhoto: MARS_ROVER_PHOTO,
    fact: 'Perseverance seals Martian rock cores in titanium tubes for a possible future trip to Earth.',
    osdrStudyId: 'OSD-104',
    osdrFinding: 'Spaceflight changes muscle genes; exercise protects muscles when 0.38g gravity means only 38% of Earth’s pull.',
    marsTrekCoords: '18.4447°N, 77.4508°E • Elev -2,540m • Octavia E. Butler Landing',
  },
  {
    marsPhoto: MARS_ROVER_PHOTO,
    fact: 'Jezero Crater once held a lake and a river delta billions of years ago.',
    osdrStudyId: 'OSD-379',
    osdrFinding: 'Rodent Research compares bone density, muscle, and immunity changes so future crews can plan healthy missions.',
    marsTrekCoords: '18.4447°N, 77.4508°E • Elev -2,540m • Neretva Vallis Delta Sample',
  },
  {
    marsPhoto: MARS_ROVER_PHOTO,
    fact: 'MOXIE demonstrated making oxygen from Mars’s carbon-dioxide atmosphere.',
    osdrStudyId: 'OSD-321',
    osdrFinding: 'Plant spaceflight research shows why warm nutrient water, light, and careful nutrition matter for fresh space food.',
    marsTrekCoords: '18.4447°N, 77.4508°E • Elev -2,540m • MOXIE Delta Sample',
  },
  {
    marsPhoto: MARS_ROVER_PHOTO,
    fact: 'MEDA measures Mars weather to help scientists plan safe future exploration.',
    osdrStudyId: 'OSD-379',
    osdrFinding: 'Immunity means the body’s defenses against illness; radiation and stress can challenge those defenses.',
    marsTrekCoords: '18.4447°N, 77.4508°E • Elev -2,540m • Crater Rim Ridge Sample',
  },
  {
    marsPhoto: MARS_ROVER_PHOTO,
    fact: 'Mars gravity is 0.38g: you jump about 2.6× higher, but still need to protect bones and muscles.',
    osdrStudyId: 'OSD-104',
    osdrFinding: 'NASA muscle research helps explain why exercise and nutrition remain important on lower-gravity worlds.',
    marsTrekCoords: '18.4447°N, 77.4508°E • Elev -2,540m • Octavia E. Butler Landing',
  },
] as const;

export const SAMPLE_FACTS: readonly string[] = SAMPLE_SCIENCE.map(
  (sample) => `${sample.fact} ${sample.osdrStudyId}: ${sample.osdrFinding}`,
);

const INITIAL_SOL_TASKS: SolTasks = {
  panelsCleaned: false,
  cropsHarvested: false,
  dishAligned: false,
  samplesAnalyzed: 0,
};

export const getCompletedTaskCount = (tasks: SolTasks): number => {
  let count = 0;
  if (tasks.panelsCleaned) count += 1;
  if (tasks.cropsHarvested) count += 1;
  if (tasks.dishAligned) count += 1;
  if (tasks.samplesAnalyzed >= 1) count += 1;
  return count;
};

interface GameStoreState {
  gameStatus: GameStatus;
  audioMuted: boolean;
  cameraPov: CameraPov;
  onboardingPhase: OnboardingPhase;
  onboardingStage: OnboardingStage;
  victoryPhase: VictoryPhase;
  victoryRunId: number;
  currentSolIndex: number;
  missionSeed: number;
  solsData: SolTelemetry[];
  thrusterPower: number;
  thermalPower: number;
  shieldSensorPower: number;
  suitOxygenAndHeat: number;
  outpostIntegrity: number;
  cropHealth: number;
  missionProgress: number;
  playerRespawnId: number;
  activeStation: ActiveStation;
  sampleTubesCollected: number;
  collectedSampleTubeIds: number[];
  sampleNoticeId: number;
  lastSampleFact: string | null;
  lastSampleTubeId: number | null;
  tasksCompleted: SolTasks;
  dustLevel: number;
  carriedSamples: number;
  dataSourceLabel: string;
  dataSourceMode: DataSourceMode;
  isLiveSyncing: boolean;
  liveSyncMessage: string | null;
  liveApiReports: LiveNasaEndpointReport[];
  loadNasaData: () => Promise<void>;
  importNasaData: (rawJsonOrCsv: string | unknown, sourceName?: string) => void;
  syncLiveNasaApis: (apiKey?: string) => Promise<void>;
  shuffleMissionSols: () => void;
  allocatePower: (system: PowerSystem, delta: number) => void;
  tickSimulation: (dt: number) => void;
  advanceSol: () => void;
  resumeFromSafetyPause: (recommendedThruster: number, recommendedThermal: number, recommendedShield: number) => void;
  restartSolFromOutpost: () => void;
  startGame: () => void;
  resetGame: () => void;
  startVictory: () => void;
  startEarthReturnJourney: () => void;
  setVictoryPhase: (phase: VictoryPhase) => void;
  returnToLaunchComplex: () => void;
  advanceOnboardingPhase: () => void;
  skipOnboardingToMars: () => void;
  setOnboardingStage: (stage: OnboardingStage) => void;
  setOnboardingPhase: (phase: OnboardingPhase) => void;
  toggleCameraPov: () => void;
  toggleAudioMuted: () => void;
  setActiveStation: (station: ActiveStation) => void;
  setMissionProgress: (progress: number) => void;
  collectSampleTube: (tubeId: number) => void;
  interactStation: (station: Exclude<ActiveStation, 'NONE'>) => void;
}

const BASE_FALLBACK_SOLS: SolTelemetry[] = [
  {
    sol: 1,
    title: 'Nominal Martian Morning (Clear Skies)',
    weatherType: 'CLEAR',
    ...getSolResourceContext('CLEAR'),
    radLabDoseMicroGyDay: 210,
    airTempCelsius: -22.4,
    groundTempCelsius: -14.1,
    pressurePascal: 742.5,
    windSpeedMps: 4.2,
    windDirectionDeg: 115,
    solarIrradianceWm2: 580.0,
    dustOpticalDepthTau: 0.45,
    radiationDoseMicroGyDay: 210,
    visualEnvironment: {
      skyColor: '#d98b5f',
      fogColor: '#c97a4e',
      fogDensity: 0.008,
      sunIntensity: 2.4,
      dustParticleSpeed: 0.5,
    },
    missionBrief:
      'Telemetry nominal. Solar arrays operating at 98% efficiency. Walk to the Hydroponics Dome and calibrate the oxygen scrubbers.',
    optimalTradeoffHint:
      'Low thermal and shielding demand. Route power to Suit Thrusters & Life Support to complete calibration quickly.',
  },
  {
    sol: 2,
    title: 'Regional Dust Devil Passage (Pressure Drop)',
    weatherType: 'DUST_DEVIL',
    ...getSolResourceContext('DUST_DEVIL'),
    radLabDoseMicroGyDay: 195,
    airTempCelsius: -38.9,
    groundTempCelsius: -31.0,
    pressurePascal: 718.2,
    windSpeedMps: 19.8,
    windDirectionDeg: 240,
    solarIrradianceWm2: 290.0,
    dustOpticalDepthTau: 1.65,
    radiationDoseMicroGyDay: 195,
    visualEnvironment: {
      skyColor: '#a84c2c',
      fogColor: '#963f21',
      fogDensity: 0.032,
      sunIntensity: 1.1,
      dustParticleSpeed: 3.2,
    },
    missionBrief:
      'MEDA barometers detect a sudden 24.3 Pa pressure drop! A convective vortex (dust devil) is sweeping across the Solar Array.',
    optimalTradeoffHint:
      'Visibility is dropping fast and wind drag is high. Boost Visor LiDAR/HUD and Suit Thrusters to reach the Solar Array and clear the panels.',
  },
  {
    sol: 3,
    title: 'Deep Martian Night Thermal Plunge',
    weatherType: 'DEEP_FREEZE',
    ...getSolResourceContext('DEEP_FREEZE'),
    radLabDoseMicroGyDay: 205,
    airTempCelsius: -84.6,
    groundTempCelsius: -88.2,
    pressurePascal: 755.0,
    windSpeedMps: 2.1,
    windDirectionDeg: 90,
    solarIrradianceWm2: 0.0,
    dustOpticalDepthTau: 0.4,
    radiationDoseMicroGyDay: 205,
    visualEnvironment: {
      skyColor: '#0b1021',
      fogColor: '#0f172e',
      fogDensity: 0.015,
      sunIntensity: 0.15,
      dustParticleSpeed: 0.2,
    },
    missionBrief:
      'Solar irradiance is 0 W/m\u00B2. Ambient temperature at Jezero Crater has plunged to -84.6\u00B0C. The greenhouse water pipes are freezing!',
    optimalTradeoffHint:
      'CRITICAL THERMAL WARNING: Divert at least 55% power to Thermal Heaters immediately or your suit and hydroponics will freeze.',
  },
  {
    sol: 4,
    title: 'Coronal Mass Ejection (Solar Particle Event)',
    weatherType: 'SOLAR_STORM',
    ...getSolResourceContext('SOLAR_STORM'),
    radLabDoseMicroGyDay: 4850,
    airTempCelsius: -29.0,
    groundTempCelsius: -21.5,
    pressurePascal: 740.1,
    windSpeedMps: 6.5,
    windDirectionDeg: 180,
    solarIrradianceWm2: 540.0,
    dustOpticalDepthTau: 0.55,
    radiationDoseMicroGyDay: 4850,
    visualEnvironment: {
      skyColor: '#512b78',
      fogColor: '#6e388a',
      fogDensity: 0.018,
      sunIntensity: 2.8,
      dustParticleSpeed: 1.0,
    },
    missionBrief:
      "RAD sensor spike: 4,850 \u00B5Gy/day! A solar flare is bombarding Mars' thin atmosphere, triggering an ultraviolet Martian aurora.",
    optimalTradeoffHint:
      'Divert maximum wattage to the Outpost Magnetic Shield Generator and hurry to the Radar Tower to lock the emergency deflector.',
  },
  {
    sol: 5,
    title: 'Jezero Global Dust Storm Peak (Tau > 3.2)',
    weatherType: 'MEGA_STORM',
    ...getSolResourceContext('MEGA_STORM'),
    radLabDoseMicroGyDay: 160,
    airTempCelsius: -56.2,
    groundTempCelsius: -52.8,
    pressurePascal: 695.4,
    windSpeedMps: 28.4,
    windDirectionDeg: 275,
    solarIrradianceWm2: 65.0,
    dustOpticalDepthTau: 3.4,
    radiationDoseMicroGyDay: 160,
    visualEnvironment: {
      skyColor: '#59180b',
      fogColor: '#4a1207',
      fogDensity: 0.055,
      sunIntensity: 0.3,
      dustParticleSpeed: 6.0,
    },
    missionBrief:
      'Atmospheric opacity (Tau) has hit 3.4! 89% of sunlight is blocked, winds are 28.4 m/s, and temperatures are plummeting simultaneously.',
    optimalTradeoffHint:
      'The ultimate engineering trade-off: dynamically juggle power between Thermal Heaters, Visor LiDAR, and Shield/Thrusters in real time to reach the Perseverance Rover!',
  },
];

const FALLBACK_SOLS: SolTelemetry[] = BASE_FALLBACK_SOLS.map((sol, index) => ({
  ...sol,
  sourceSol: [15, 117, 68][index],
  nightLowTempCelsius: sol.weatherType === 'CLEAR' ? -83 : undefined,
  marsPhoto: MARS_ROVER_PHOTO,
  recordCitations: [
    'NASA PDS Mars 2020 MEDA archive • https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/Mars2020/mars2020.html',
    `NASA DONKI archive event ${sol.donkiEventId} • https://ccmc.gsfc.nasa.gov/tools/DONKI/`,
    `NASA OSDR ${sol.osdrStudyId} • https://osdr.nasa.gov/bio/repo/`,
    'NASA RadLab dosimetry • https://visualization.osdr.nasa.gov/radlab/',
    'NASA Mars Trek Jezero 18.4447°N, 77.4508°E • https://trek.nasa.gov/mars/',
    'CSA Space Food Production Toolkit • https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/',
  ],
  archiveNote: 'Immutable curated training scenario, not live telemetry. Linked records provide source context; row-level values must not be described as live measurements.',
  o2ConsumptionKgDay: sol.o2ConsumptionKgDay ?? 0.84,
  ...getKidScienceGuide(sol),
}));

const OTHER_SYSTEMS: Record<PowerSystem, readonly [PowerSystem, PowerSystem]> = {
  thruster: ['thermal', 'shieldSensor'],
  thermal: ['thruster', 'shieldSensor'],
  shieldSensor: ['thruster', 'thermal'],
};

const INITIAL_SESSION_STATE = {
  currentSolIndex: 0,
  thrusterPower: 34,
  thermalPower: 33,
  shieldSensorPower: 33,
  suitOxygenAndHeat: 100,
  outpostIntegrity: 100,
  cropHealth: 100,
  missionProgress: 0,
  playerRespawnId: 0,
  activeStation: 'NONE' as ActiveStation,
  sampleTubesCollected: 0,
  collectedSampleTubeIds: [] as number[],
  sampleNoticeId: 0,
  lastSampleFact: null as string | null,
  lastSampleTubeId: null as number | null,
  tasksCompleted: { ...INITIAL_SOL_TASKS },
  dustLevel: 60,
  carriedSamples: 0,
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const getAvailablePowerWatts = (dustLevel: number): number =>
  110 - clamp(dustLevel, 0, 100) * 0.4;

const getThermalDemand = (airTempCelsius: number): number =>
  clamp(36 + Math.max(0, -airTempCelsius - 30) * 0.45, 36, 80);

const getShieldDemand = (sol: SolTelemetry): number => {
  const radiationDemand = clamp(
    34 + Math.max(0, sol.radLabDoseMicroGyDay - 210) / 80,
    34,
    80,
  );
  const dustDemand = clamp(34 + Math.max(0, sol.dustOpticalDepthTau - 0.45) * 12, 34, 80);

  return Math.max(radiationDemand, dustDemand);
};

export interface PowerRequirements {
  requiredMobility: number;
  requiredThermal: number;
  requiredShield: number;
}

export const getPowerRequirements = (sol: SolTelemetry): PowerRequirements => ({
  requiredMobility: clamp(
    34 + Math.max(0, sol.windSpeedMps - 8) * 1.2 + Math.max(0, sol.dustOpticalDepthTau - 1) * 3,
    34,
    65,
  ),
  requiredThermal: getThermalDemand(sol.airTempCelsius),
  requiredShield: getShieldDemand(sol),
});

export interface RecommendedPowerSplit {
  thruster: number;
  thermal: number;
  shield: number;
}

export const getRecommendedPowerSplit = (
  sol: SolTelemetry,
  dustLevel: number,
  priority: 'SUIT' | 'SHIELD',
): RecommendedPowerSplit => {
  const availablePowerRatio = getAvailablePowerWatts(dustLevel) / 110;
  const thermalNeed = Math.ceil(getThermalDemand(sol.airTempCelsius) / availablePowerRatio + 6);
  const shieldNeed = Math.ceil(getShieldDemand(sol) / availablePowerRatio + 6);

  if (priority === 'SUIT') {
    const thermal = clamp(thermalNeed, 45, 75);
    const thruster = Math.min(28, 100 - thermal - 10);
    return { thruster, thermal, shield: 100 - thruster - thermal };
  }

  const shield = clamp(shieldNeed, 45, 80);
  const thruster = Math.min(20, 100 - shield - 10);
  return { thruster, thermal: 100 - thruster - shield, shield };
};

export const useGameStore = create<GameStoreState>()((set, get) => ({
  gameStatus: 'MENU',
  audioMuted: false,
  cameraPov: 'THIRD_PERSON',
  onboardingPhase: 'TITLE_SCREEN',
  onboardingStage: 1,
  victoryPhase: 'MARS_BOARDING_ASCENT',
  victoryRunId: 0,
  missionSeed: 1,
  ...INITIAL_SESSION_STATE,
  solsData: FALLBACK_SOLS,
  dataSourceLabel: CURATED_DATA_SOURCE_LABEL,
  dataSourceMode: 'VERIFIED_ARCHIVE',
  isLiveSyncing: false,
  liveSyncMessage: null,
  liveApiReports: [],

  loadNasaData: async () => {
    const fetchDataset = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status} ${response.statusText}`);
      return parseNasaDataset(await response.text());
    };

    let dataset;
    try {
      dataset = await fetchDataset('/data/nasa_nov13_challenge_data.json');
    } catch {
      dataset = await fetchDataset('/data/nasa_meda_sols.json');
    }
    set({
      solsData: dataset.sols,
      dataSourceLabel: CURATED_DATA_SOURCE_LABEL,
      dataSourceMode: 'VERIFIED_ARCHIVE',
      liveSyncMessage: null,
      liveApiReports: [],
    });
  },

  importNasaData: (rawJsonOrCsv, sourceName) => {
    const dataset = parseNasaDataset(rawJsonOrCsv, sourceName);
    set({
      solsData: dataset.sols,
      currentSolIndex: 0,
      dataSourceLabel: CURATED_DATA_SOURCE_LABEL,
      dataSourceMode: 'VERIFIED_ARCHIVE',
      liveSyncMessage: null,
      liveApiReports: [],
    });
  },

  syncLiveNasaApis: async (apiKey = 'DEMO_KEY') => {
    if (get().isLiveSyncing) return;
    set({ isLiveSyncing: true, liveSyncMessage: 'Contacting DONKI, APOD, and OSDR in parallel…' });
    try {
      const result = await syncLiveNasaOpenApis(apiKey);
      set((state) => ({
        solsData: result.hasLiveConnection
          ? state.solsData.map((sol, index) => index === state.currentSolIndex ? { ...sol, ...result.liveUpdates } : sol)
          : state.solsData,
        dataSourceMode: result.hasLiveConnection ? 'LIVE_NASA_API' : 'VERIFIED_ARCHIVE',
        dataSourceLabel: result.hasLiveConnection ? LIVE_DATA_SOURCE_LABEL : CURATED_DATA_SOURCE_LABEL,
        isLiveSyncing: false,
        liveSyncMessage: result.message,
        liveApiReports: result.reports,
      }));
    } catch (error) {
      set({
        dataSourceMode: 'VERIFIED_ARCHIVE',
        dataSourceLabel: CURATED_DATA_SOURCE_LABEL,
        isLiveSyncing: false,
        liveSyncMessage: error instanceof Error ? error.message : 'Live NASA APIs could not be reached; archive mode remains active.',
        liveApiReports: [],
      });
    }
  },

  shuffleMissionSols: () => {
    set((state) => {
      const missionSeed = state.missionSeed + 1;
      return {
        ...INITIAL_SESSION_STATE,
        tasksCompleted: { ...INITIAL_SOL_TASKS },
        missionSeed,
        solsData: randomizeMissionSols(state.solsData, missionSeed),
        playerRespawnId: state.playerRespawnId + 1,
        gameStatus: 'PLAYING',
        onboardingPhase: 'COMPLETE',
        onboardingStage: 6,
      };
    });
  },

  allocatePower: (system, delta) => {
    if (!Number.isFinite(delta)) {
      return;
    }

    const readPower = (): number => system === 'thruster'
      ? get().thrusterPower
      : system === 'thermal'
        ? get().thermalPower
        : get().shieldSensorPower;
    const previousPower = readPower();
    set((state) => {
      const power: Record<PowerSystem, number> = {
        thruster: state.thrusterPower,
        thermal: state.thermalPower,
        shieldSensor: state.shieldSensorPower,
      };
      const targetPower = clamp(power[system] + delta, 10, 80);

      if (targetPower === power[system]) {
        return {};
      }

      const [firstOther, secondOther] = OTHER_SYSTEMS[system];
      const remainingPower = 100 - targetPower;
      const otherTotal = power[firstOther] + power[secondOther];
      const proportionalFirst =
        otherTotal > 0 ? remainingPower * (power[firstOther] / otherTotal) : remainingPower / 2;
      const firstMinimum = Math.max(10, remainingPower - 80);
      const firstMaximum = Math.min(80, remainingPower - 10);
      const firstPower = clamp(proportionalFirst, firstMinimum, firstMaximum);

      power[system] = targetPower;
      power[firstOther] = firstPower;
      power[secondOther] = remainingPower - firstPower;

      return {
        thrusterPower: power.thruster,
        thermalPower: power.thermal,
        shieldSensorPower: power.shieldSensor,
      };
    });
    if (readPower() !== previousPower) playPowerShift(system);
  },

  tickSimulation: (dt) => {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }

    const state = get();

    if (state.gameStatus !== 'PLAYING') {
      return;
    }

    const activeSol = state.solsData[state.currentSolIndex];

    if (!activeSol) {
      return;
    }

    const availablePowerRatio = getAvailablePowerWatts(state.dustLevel) / 110;
    const requirements = getPowerRequirements(activeSol);
    const thermalDeficit = requirements.requiredThermal - state.thermalPower * availablePowerRatio;
    const shieldDeficit = requirements.requiredShield - state.shieldSensorPower * availablePowerRatio;
    const suitOxygenAndHeat = clamp(
      state.suitOxygenAndHeat + (thermalDeficit > 0 ? -thermalDeficit * 0.08 : 2) * dt,
      0,
      100,
    );
    const cropHealth = clamp(
      state.cropHealth + (thermalDeficit > 0 ? -thermalDeficit * 0.07 : 0.8) * dt,
      0,
      100,
    );
    const outpostIntegrity = clamp(
      state.outpostIntegrity + (shieldDeficit > 0 ? -shieldDeficit * 0.06 : 1.5) * dt,
      0,
      100,
    );

    const weatherDust = activeSol.dustOpticalDepthTau > 0.8
      ? activeSol.dustOpticalDepthTau * 2 * dt
      : 0;
    const sensorDust = shieldDeficit > 0 ? shieldDeficit * 0.035 * dt : 0;
    const dustLevel = clamp(state.dustLevel + weatherDust + sensorDust, 0, 100);

    const completedCount = getCompletedTaskCount(state.tasksCompleted);
    const missionProgress = clamp((completedCount / 3) * 100, 0, 100);

    const hasFailed = suitOxygenAndHeat <= 0 || outpostIntegrity <= 0;
    const hasCompletedSol = !hasFailed && completedCount >= 3;
    if (hasFailed) playSafetyAlert();

    set({
      suitOxygenAndHeat,
      outpostIntegrity,
      cropHealth,
      dustLevel,
      missionProgress,
      gameStatus: hasFailed ? 'GAME_OVER' : hasCompletedSol ? 'SOL_COMPLETE' : 'PLAYING',
      activeStation: hasFailed || hasCompletedSol ? 'NONE' : state.activeStation,
    });
  },

  interactStation: (station) => {
    set((state) => {
      if (state.gameStatus !== 'PLAYING') {
        return {};
      }

      const tasks = { ...state.tasksCompleted };
      let suitOxygenAndHeat = state.suitOxygenAndHeat;
      let outpostIntegrity = state.outpostIntegrity;
      let cropHealth = state.cropHealth;
      let dustLevel = state.dustLevel;
      let carriedSamples = state.carriedSamples;
      let changed = false;

      switch (station) {
        case 'SOLAR_ARRAY':
          if (dustLevel > 0) {
            dustLevel = 0;
            tasks.panelsCleaned = true;
            changed = true;
          }
          break;
        case 'HYDROPONICS':
          if (!tasks.cropsHarvested) {
            const oxygenBaseline = state.solsData[state.currentSolIndex]?.o2ConsumptionKgDay ?? 0.84;
            tasks.cropsHarvested = true;
            suitOxygenAndHeat = clamp(suitOxygenAndHeat + 35 * (oxygenBaseline / 0.84), 0, 100);
            cropHealth = clamp(cropHealth + 30, 0, 100);
            changed = true;
          }
          break;
        case 'RADAR_TOWER':
          if (!tasks.dishAligned) {
            tasks.dishAligned = true;
            outpostIntegrity = clamp(outpostIntegrity + 35, 0, 100);
            changed = true;
          }
          break;
        case 'ROVER':
          if (carriedSamples > 0) {
            carriedSamples -= 1;
            tasks.samplesAnalyzed += 1;
            changed = true;
          }
          break;
      }

      if (changed) {
        if (station === 'ROVER') playSamplePickup();
        else playStationComplete();
      }

      if (!changed) {
        return {};
      }

      const completedCount = getCompletedTaskCount(tasks);
      const missionProgress = clamp((completedCount / 3) * 100, 0, 100);
      const hasCompletedSol = completedCount >= 3;

      return {
        tasksCompleted: tasks,
        suitOxygenAndHeat,
        outpostIntegrity,
        cropHealth,
        dustLevel,
        carriedSamples,
        missionProgress,
        gameStatus: hasCompletedSol ? 'SOL_COMPLETE' : state.gameStatus,
        activeStation: hasCompletedSol ? 'NONE' : state.activeStation,
      };
    });
  },

  resumeFromSafetyPause: (recommendedThruster, recommendedThermal, recommendedShield) => {
    if (
      !Number.isFinite(recommendedThruster) ||
      !Number.isFinite(recommendedThermal) ||
      !Number.isFinite(recommendedShield)
    ) {
      return;
    }
    const total = recommendedThruster + recommendedThermal + recommendedShield;
    if (total <= 0) return;
    const thrusterPower = clamp((recommendedThruster / total) * 100, 10, 80);
    const thermalPower = clamp((recommendedThermal / total) * 100, 10, 80);
    const shieldSensorPower = 100 - thrusterPower - thermalPower;
    if (shieldSensorPower < 10 || shieldSensorPower > 80) return;

    set((state) => state.gameStatus === 'GAME_OVER' ? {
      thrusterPower,
      thermalPower,
      shieldSensorPower,
      suitOxygenAndHeat: 75,
      outpostIntegrity: 75,
      cropHealth: 75,
      gameStatus: 'PLAYING',
      activeStation: 'NONE',
    } : {});
  },

  restartSolFromOutpost: () => {
    set((state) => ({
      thrusterPower: INITIAL_SESSION_STATE.thrusterPower,
      thermalPower: INITIAL_SESSION_STATE.thermalPower,
      shieldSensorPower: INITIAL_SESSION_STATE.shieldSensorPower,
      suitOxygenAndHeat: 100,
      outpostIntegrity: 100,
      missionProgress: 0,
      activeStation: 'NONE',
      tasksCompleted: { ...INITIAL_SOL_TASKS },
      dustLevel: 60,
      carriedSamples: 0,
      playerRespawnId: state.playerRespawnId + 1,
      gameStatus: 'PLAYING',
      onboardingPhase: 'COMPLETE',
    }));
  },

  advanceSol: () => {
    const state = get();
    if (state.currentSolIndex >= state.solsData.length - 1) {
      state.startEarthReturnJourney();
      return;
    }

    set({
      currentSolIndex: state.currentSolIndex + 1,
      gameStatus: 'PLAYING',
      missionProgress: 0,
      activeStation: 'NONE',
      tasksCompleted: { ...INITIAL_SOL_TASKS },
      cropHealth: 100,
      dustLevel: 60,
      carriedSamples: 0,
    });
  },

  startGame: () => {
    stopDialogue();
    stopRocketLaunchSound();
    stopVictoryFanfare();
    set((state) => {
      const missionSeed = state.missionSeed + 1;
      return {
        ...INITIAL_SESSION_STATE,
        tasksCompleted: { ...INITIAL_SOL_TASKS },
        missionSeed,
        playerRespawnId: state.playerRespawnId + 1,
        solsData: randomizeMissionSols(state.solsData, missionSeed),
        gameStatus: 'PLAYING',
        onboardingPhase: 'COMPLETE',
        onboardingStage: 6,
        victoryPhase: 'MARS_BOARDING_ASCENT',
      };
    });
  },

  resetGame: () => {
    stopDialogue();
    stopRocketLaunchSound();
    stopVictoryFanfare();
    set((state) => ({
      ...INITIAL_SESSION_STATE,
      tasksCompleted: { ...INITIAL_SOL_TASKS },
      playerRespawnId: state.playerRespawnId + 1,
      gameStatus: 'MENU',
      onboardingPhase: 'TITLE_SCREEN',
      onboardingStage: 1,
      victoryPhase: 'MARS_BOARDING_ASCENT',
    }));
  },

  startVictory: () => {
    get().startEarthReturnJourney();
  },

  startEarthReturnJourney: () => {
    const state = get();
    const isFinalSol = state.solsData.length > 0 && state.currentSolIndex >= state.solsData.length - 1;
    const hasCompletedFinalSol = state.missionProgress >= 100 || state.gameStatus === 'SOL_COMPLETE';
    if (!isFinalSol || !hasCompletedFinalSol) return;
    stopDialogue();
    stopRocketLaunchSound();
    stopVictoryFanfare();
    set((currentState) => ({
      gameStatus: 'VICTORY',
      victoryPhase: 'MARS_BOARDING_ASCENT',
      victoryRunId: currentState.victoryRunId + 1,
      activeStation: 'NONE',
    }));
  },

  setVictoryPhase: (victoryPhase) => {
    if (get().gameStatus === 'VICTORY') set({ victoryPhase });
  },

  returnToLaunchComplex: () => {
    get().resetGame();
  },

  advanceOnboardingPhase: () => {
    const state = get();
    if (state.gameStatus !== 'MENU') return;
    playUiClick();
    if (state.onboardingPhase === 'TITLE_SCREEN') {
      set({ onboardingPhase: 'PRE_FLIGHT_DIALOGUE', onboardingStage: 1 });
    } else if (state.onboardingPhase === 'PRE_FLIGHT_DIALOGUE') {
      stopDialogue();
      set({ onboardingPhase: 'BOARDING_LAUNCH', onboardingStage: 2 });
    } else if (state.onboardingPhase === 'BOARDING_LAUNCH') {
      set({ onboardingPhase: 'MARS_LANDING', onboardingStage: 6 });
    } else if (state.onboardingPhase === 'MARS_LANDING') {
      state.startGame();
    }
  },

  skipOnboardingToMars: () => {
    if (get().gameStatus === 'MENU') get().startGame();
  },

  setOnboardingStage: (onboardingStage) => {
    if (get().gameStatus === 'MENU') set({ onboardingStage });
  },

  setOnboardingPhase: (onboardingPhase) => {
    if (get().gameStatus === 'MENU') set({ onboardingPhase });
  },

  toggleCameraPov: () => {
    set((state) => ({
      cameraPov: state.cameraPov === 'THIRD_PERSON' ? 'FIRST_PERSON' : 'THIRD_PERSON',
    }));
  },

  toggleAudioMuted: () => {
    set((state) => {
      const audioMuted = !state.audioMuted;
      setSoundMuted(audioMuted);
      if (!audioMuted) playUiClick();
      return { audioMuted };
    });
  },

  setActiveStation: (activeStation) => {
    set({ activeStation });
  },

  setMissionProgress: (progress) => {
    if (!Number.isFinite(progress)) {
      return;
    }

    set((state) => {
      const missionProgress = clamp(progress, 0, 100);

      return {
        missionProgress,
        gameStatus:
          state.gameStatus === 'PLAYING' && missionProgress >= 100
            ? 'SOL_COMPLETE'
            : state.gameStatus,
      };
    });
  },

  collectSampleTube: (tubeId) => {
    if (!Number.isInteger(tubeId) || tubeId < 0 || tubeId >= SAMPLE_FACTS.length) {
      return;
    }

    set((state) => {
      if (state.collectedSampleTubeIds.includes(tubeId)) {
        return {};
      }

      const collectedSampleTubeIds = [...state.collectedSampleTubeIds, tubeId];
      playSamplePickup();
      return {
        collectedSampleTubeIds,
        sampleTubesCollected: collectedSampleTubeIds.length,
        carriedSamples: state.carriedSamples + 1,
        sampleNoticeId: state.sampleNoticeId + 1,
        lastSampleFact: SAMPLE_FACTS[tubeId]!,
        lastSampleTubeId: tubeId,
      };
    });
  },
}));
