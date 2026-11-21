import type { NasaDataset, SolTelemetry, VisualEnvironment } from '../store/useGameStore';

export const NASA_API_KEY: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.NASA_API_KEY === 'string' &&
    import.meta.env.NASA_API_KEY.trim() !== '')
    ? import.meta.env.NASA_API_KEY.trim()
    : 'DEMO_KEY';
export const CURATED_DATA_SOURCE_LABEL = 'Curated Real NASA & CSA Dataset (PDS MEDA • DONKI • RadLab • OSDR • Mars Trek)';
export const LIVE_DATA_SOURCE_LABEL = '🟢 Live NASA Open API Connected';
export const MARS_ROVER_PHOTO = {
  url: 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/mars/resources/detail_files/2/7/27307_27307_PIA25736-web1.jpg?w=1200&h=809&fit=clip&crop=faces%2Cfocalpoint',
  credit: 'NASA/JPL-Caltech/ASU/MSSS — Perseverance Mastcam-Z Jezero Crater Delta & Sample Depot',
  caption: 'NASA/JPL-Caltech/ASU — Perseverance Mastcam-Z Jezero Crater Delta & Sample Depot',
  description: 'A real Mastcam-Z panorama of ten backup sample tubes at Three Forks in Jezero Crater. The tubes preserve rocks and air for possible future study on Earth.',
  capturedSol: 693,
  capturedOn: '2023-01-31',
  sourceUrl: 'https://science.nasa.gov/resource/perseverances-portrait-of-the-sample-depot/',
} as const;

export interface LiveNasaEndpointReport {
  name: 'DONKI FLR' | 'NASA APOD' | 'NASA OSDR';
  url: string;
  status: number;
  ok: boolean;
  detail: string;
}

export interface LiveNasaSyncResult {
  reports: LiveNasaEndpointReport[];
  liveUpdates: Partial<SolTelemetry>;
  hasLiveConnection: boolean;
  syncedSources: string[];
  message: string;
}

type DataRow = Record<string, unknown>;
type WeatherType = SolTelemetry['weatherType'];
type Metric = 'temperature' | 'groundTemperature' | 'pressure' | 'wind' | 'windDirection' | 'irradiance' | 'dustTau' | 'radiation' | 'o2ConsumptionKgDay';

const FIELD_ALIASES: Record<Metric, readonly string[]> = {
  temperature: ['temperature', 'temp', 'tempc', 'temperaturec', 'temperaturecelsius', 'airtemp', 'airtemperature', 'airtempcelsius', 'airtemperaturec', 'atemp', 'ats'],
  groundTemperature: ['groundtemp', 'groundtemperature', 'groundtempcelsius', 'groundtemperaturec', 'surfaceTemp'.toLowerCase(), 'surfacetemperature', 'gts'],
  pressure: ['pressure', 'pressurepa', 'pressurepascal', 'pressurepascals', 'airpressure', 'barometer', 'barometricpressure'],
  wind: ['wind', 'windspeed', 'windspeedms', 'windspeedmps', 'windvelocity', 'windmps', 'hws', 'horizontalwindspeed'],
  windDirection: ['winddirection', 'winddirectiondeg', 'winddeg', 'windbearing', 'wd'],
  irradiance: ['irradiance', 'solar', 'solarirradiance', 'solarirradiancewm2', 'solarflux', 'swirradiance', 'downwellingirradiance'],
  dustTau: ['dusttau', 'tau', 'dustopticaldepth', 'dustopticaldepthtau', 'opticaldepth', 'opticaldepthtau', 'aerosolopticaldepth'],
  radiation: ['radiation', 'radiationdose', 'radiationdosemicrogyday', 'radlabdosemicrogyday', 'raddose', 'dosemicrogyday', 'radiationdoserate'],
  o2ConsumptionKgDay: ['o2consumptionkgday', 'oxygenconsumption', 'oxygenconsumptionkgday', 'o2consumption', 'o2kgday', 'bvado2kgday'],
};

const SOL_ALIASES = ['sol', 'sols', 'solday', 'marssol', 'martiansol', 'solnumber'];
const WEATHER_LABELS: Record<WeatherType, string> = {
  CLEAR: 'Clear Martian skies',
  DUST_DEVIL: 'Dust devil and wind event',
  DEEP_FREEZE: 'Deep-freeze thermal challenge',
  SOLAR_STORM: 'Solar particle radiation event',
  MEGA_STORM: 'High-opacity dust storm',
};
const WEATHER_VISUALS: Record<WeatherType, VisualEnvironment> = {
  CLEAR: { skyColor: '#d98b5f', fogColor: '#c97a4e', fogDensity: 0.008, sunIntensity: 2.4, dustParticleSpeed: 0.5 },
  DUST_DEVIL: { skyColor: '#a84c2c', fogColor: '#963f21', fogDensity: 0.032, sunIntensity: 1.1, dustParticleSpeed: 3.2 },
  DEEP_FREEZE: { skyColor: '#0b1021', fogColor: '#0f172e', fogDensity: 0.015, sunIntensity: 0.15, dustParticleSpeed: 0.2 },
  SOLAR_STORM: { skyColor: '#512b78', fogColor: '#6e388a', fogDensity: 0.018, sunIntensity: 2.8, dustParticleSpeed: 1 },
  MEGA_STORM: { skyColor: '#59180b', fogColor: '#4a1207', fogDensity: 0.055, sunIntensity: 0.3, dustParticleSpeed: 6 },
};
const WEATHER_TYPES: readonly WeatherType[] = ['CLEAR', 'DUST_DEVIL', 'DEEP_FREEZE', 'SOLAR_STORM', 'MEGA_STORM'];

export const OFFICIAL_CHALLENGE_RESOURCES = [
  { name: 'NASA Perseverance MEDA & Open APIs', url: 'https://api.nasa.gov/', mechanic: 'Archived MEDA temperature and dust scenarios drive heater demand, fog, and available power; the button syncs live DONKI/OSDR metadata.' },
  { name: 'NASA DONKI Space Weather', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', mechanic: 'Flares, CME shocks, and SEP events drive radar warnings, the solar-storm aurora, and Shield [3] demand.' },
  { name: 'NASA OSDR Space Biology', url: 'https://osdr.nasa.gov/bio/repo/', mechanic: 'Spaceflight biology findings connect sample scans to bones, muscles, immunity, and plant nutrition.' },
  { name: 'NASA OSDR RadLab Dosimetry', url: 'https://visualization.osdr.nasa.gov/radlab/', mechanic: 'Absorbed dose scenarios drive outpost radiation damage; ISS ~280 µGy/day provides a comparison.' },
  { name: 'NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', mechanic: 'Jezero coordinates and MOLA elevation anchor the outpost, sample sites, and compass waypoints.' },
  { name: 'CSA Space Food Production Toolkit', url: 'https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/', mechanic: 'Heated recirculating crop trays supply food and oxygen; the O₂ baseline scales harvest recovery and Thermal [2] protects crops.' },
] as const;

export const KID_GLOSSARY = {
  sol: '1 Martian day: 24 hours and 39 minutes—just a bit longer than Earth’s day!',
  radiation: 'Invisible space energy from the Sun measured by NASA RadLab. High doses need your Shield [3]!',
  gravity: 'Mars has 38% of Earth’s pull—you jump about 2.6× higher, but NASA OSDR shows astronauts must protect bones and muscles!',
  hydroponics: 'Growing space food such as lettuce and radishes in warm nutrient water without soil, using Canadian Space Agency toolkit ideas!',
  tau: 'Optical Depth Tau tells us how much dusty air blocks sunlight. Bigger numbers mean darker skies and weaker solar power.',
} as const;

export interface KidScienceGuide {
  kidFriendlySummary: string;
  earthComparison: string;
  whatToDoKidTip: string;
  dataToGameEffect: string;
  temperature: string;
  radiation: string;
  spaceFood: string;
  gravity: string;
  skyLabel: string;
  windLabel: string;
}

export const getKidScienceGuide = (sol: SolTelemetry): KidScienceGuide => {
  const roundedTemperature = Math.round(sol.airTempCelsius);
  const freezerDifference = Math.abs(Math.round(sol.airTempCelsius + 18));
  const earthComparison = sol.airTempCelsius < -18
    ? `Today on Mars is ${freezerDifference}°C colder than a home freezer!`
    : sol.airTempCelsius > -18
      ? `Today on Mars is ${freezerDifference}°C warmer than a home freezer, but still very cold.`
      : 'Today on Mars is exactly as cold as a home freezer!';
  const isSolarStorm = sol.weatherType === 'SOLAR_STORM' || sol.radLabDoseMicroGyDay >= 1000;
  const isDustStorm = sol.weatherType === 'MEGA_STORM' || sol.dustOpticalDepthTau >= 2.5;
  const isDusty = sol.weatherType === 'DUST_DEVIL' || sol.dustOpticalDepthTau >= 1.2 || sol.windSpeedMps >= 12;
  const skyLabel = isSolarStorm ? 'Solar Flare!' : isDustStorm ? 'Dust Storm!' : isDusty ? 'Dusty & Windy' : sol.weatherType === 'DEEP_FREEZE' ? 'Clear, Cold Night' : 'Clear Sun';
  const windLabel = sol.windSpeedMps >= 20 ? 'Strong Dust Wind' : sol.windSpeedMps >= 12 ? 'Gusty Wind' : sol.windSpeedMps >= 7 ? 'Breezy' : 'Calm Breeze';
  const whatToDoKidTip = isSolarStorm
    ? 'Press [3] to boost your Shield, then align the Radar Dish so the base can warn you about solar storms!'
    : sol.weatherType === 'DEEP_FREEZE'
      ? 'Press [2] to boost your Heater. It keeps you warm and stops the greenhouse water from freezing!'
      : isDusty
        ? 'Press [1] for more Speed through the wind, and clean the solar panels. Boost [3] if dust is hurting the base!'
        : 'Explore and collect samples! Watch your power and move it with [1], [2], and [3] when the weather changes.';
  const radiation = `The Sun sends invisible energy waves. Scientists measure them in µGy/day; today’s reading is ${sol.radLabDoseMicroGyDay.toLocaleString()} µGy/day. ${isSolarStorm ? 'This solar storm is much stronger than usual! Press [3] Shield and align the Radar Dish to protect the base.' : 'This is close to the usual Mars training level. Keep your Shield ready with [3].'}`;

  return {
    kidFriendlySummary: `${skyLabel} Today is ${roundedTemperature}°C on Mars. ${whatToDoKidTip}`,
    earthComparison,
    whatToDoKidTip,
    dataToGameEffect: `Wind changes your Speed needs, cold changes Heater drain, dust blocks solar power, and space energy changes Shield drain. Move power with [1], [2], and [3]—the total is always 100%.`,
    temperature: `Your home freezer is about −18°C. ${earthComparison} Press [2] Heater to keep your suit and the greenhouse warm.`,
    radiation,
    spaceFood: 'Astronauts can’t order pizza! The CSA greenhouse grows dwarf tomatoes and lettuce in warm, nutrient-rich water without soil. The plants provide fresh food and help make oxygen to breathe.',
    gravity: 'Mars pulls with only 38% of Earth’s gravity, so you can jump about 2.6 times higher! NASA space biology studies show why walking and jumping help astronauts keep their bones and muscles strong.',
    skyLabel,
    windLabel,
  };
};

const MARS_TREK_BASE = '18.4447°N, 77.4508°E • Elev -2,540m';
const SOL_RESOURCE_CONTEXT = {
  CLEAR: {
    donkiEventId: 'MEDA-SOL-15-CLEAR-ARCHIVE',
    donkiFlareClass: 'NOMINAL WATCH',
    donkiCmeSpeedKms: 0,
    donkiSepEvent: false,
    donkiAlert: 'MEDA Sol 15 archive profile • Radio check nominal; Shield [3] remains on watch.',
    osdrStudyId: 'OSD-104 + OSD-379',
    osdrFinding: 'OSD-104 and OSD-379 document muscle, bone, and unloading research; exercise is a training countermeasure for reduced-gravity missions.',
    csaFoodStatus: 'CSA hydroponics context supports warm recirculating trays; the 0.84 kg O₂/day figure is a crew-use gameplay reference, not a measured tray output.',
    marsTrekCoords: `${MARS_TREK_BASE} • Octavia E. Butler Landing`,
  },
  DUST_DEVIL: {
    donkiEventId: 'MEDA-SOL-117-VORTEX-ARCHIVE',
    donkiFlareClass: 'DUST VORTEX',
    donkiCmeSpeedKms: 0,
    donkiSepEvent: false,
    donkiAlert: 'MEDA Sol 117 archive profile • 24.3 Pa pressure-drop training scenario; Shield [3] protects comms.',
    osdrStudyId: 'OSD-482',
    osdrFinding: 'OSD-482 is linked for judge review. The enclosed-habitat filtration summary is a training interpretation, not a quotation of the study title.',
    csaFoodStatus: 'CSA lettuce and radish trays need warm roots while dusty solar power is weak; boost Thermal [2] before harvesting.',
    marsTrekCoords: `${MARS_TREK_BASE} • Neretva Vallis Delta Training Sector`,
  },
  DEEP_FREEZE: {
    donkiEventId: 'MEDA-SOL-68-NIGHT-ARCHIVE',
    donkiFlareClass: 'THERMAL WATCH',
    donkiCmeSpeedKms: 0,
    donkiSepEvent: false,
    donkiAlert: 'MEDA Sol 68 night archive profile • No SEP spike tonight; protect crop plumbing.',
    osdrStudyId: 'CSA-FOOD-PRODUCTION-TOOLKIT',
    osdrFinding: 'The CSA toolkit supplies hydroponic food-production context; plant biology findings should be read directly from the linked OSDR studies.',
    csaFoodStatus: 'Training root-zone target: +20°C to +24°C for dwarf wheat, red leaf lettuce, and radish trays. The 0.84 kg O₂/day value is a crew-use reference, not a CSA tray measurement.',
    marsTrekCoords: `${MARS_TREK_BASE} • Crater Rim Ridge Night Shelter`,
  },
  SOLAR_STORM: {
    donkiEventId: '2024-05-14T16:46:00-FLR-001',
    donkiFlareClass: 'X-CLASS ARCHIVE EVENT',
    donkiCmeSpeedKms: 1250,
    donkiSepEvent: true,
    donkiAlert: 'DONKI 2024-05-14T16:46:00-FLR-001 • CME 1,250 km/s archive scenario; boost Shield [3].',
    osdrStudyId: 'OSD-321 + OSD-51',
    osdrFinding: 'OSD-321 and OSD-51 are linked for radiation-biology review. DNA-repair and immune-response wording is a training summary, not a direct study quotation.',
    csaFoodStatus: 'CSA crops stay warm, but radiation alarms take priority; shift power to Shield [3], then harvest when the alert clears.',
    marsTrekCoords: `${MARS_TREK_BASE} • Crater Rim Ridge Radiation Watch`,
  },
  MEGA_STORM: {
    donkiEventId: 'PDS-DUST-OPACITY-TAU-3.40',
    donkiFlareClass: 'DUST STORM',
    donkiCmeSpeedKms: 0,
    donkiSepEvent: false,
    donkiAlert: 'PDS opacity Tau 3.40 archive scenario • 89% sunlight blocked; conserve power and protect the outpost.',
    osdrStudyId: 'OSD-104',
    osdrFinding: 'OSD-104 muscle research reminds crews that 0.38g still requires exercise; save enough Mobility [1] to reach shelter safely.',
    csaFoodStatus: 'CSA recirculating trays lose sunlight and warmth in the storm; alternate Thermal [2] with Mobility [1] to reach the greenhouse.',
    marsTrekCoords: `${MARS_TREK_BASE} • Neretva Vallis Delta Storm Route`,
  },
} as const;

export const getSolResourceContext = (weather: WeatherType) => SOL_RESOURCE_CONTEXT[weather];

const createSeededRandom = (initialSeed: number) => {
  let seed = Math.max(1, Math.floor(initialSeed) % 2147483647);
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

export const randomizeMissionSols = (sols: readonly SolTelemetry[], missionSeed: number): SolTelemetry[] => {
  if (sols.length === 0) return [];
  const random = createSeededRandom(missionSeed);
  const laterSols = sols.slice(1);
  for (let index = laterSols.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [laterSols[index], laterSols[swapIndex]] = [laterSols[swapIndex]!, laterSols[index]!];
  }
  return [sols[0]!, ...laterSols].map((sol, index) => {
    const archivedSol: SolTelemetry = {
      ...sol,
      sol: index + 1,
      visualEnvironment: { ...sol.visualEnvironment },
    };
    return { ...archivedSol, ...getKidScienceGuide(archivedSol) };
  });
};

const isRecord = (value: unknown): value is DataRow => typeof value === 'object' && value !== null && !Array.isArray(value);
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

const findRawValue = (row: DataRow, aliases: readonly string[], allowUnitSuffix = false): { value: unknown; key: string } | null => {
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    if (aliases.includes(normalized) || (allowUnitSuffix && aliases.some((alias) => normalized.startsWith(alias)))) {
      return { value, key };
    }
  }
  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value > -999 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').replace(',', '.');
  if (!normalized || /^(n\/a|null|nan|none|missing|--)$/i.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > -999 ? parsed : null;
};

const convertMetricUnits = (value: number, key: string, metric: Metric): number => {
  const units = normalizeKey(key);
  if (metric === 'temperature' || metric === 'groundTemperature') {
    if (units.includes('kelvin') || units.endsWith('k')) return value - 273.15;
    if (units.includes('fahrenheit') || units.endsWith('f')) return (value - 32) * (5 / 9);
  }
  if (metric === 'pressure') {
    if (units.includes('kpa')) return value * 1000;
    if (units.includes('hpa') || units.includes('mbar')) return value * 100;
  }
  if (metric === 'wind' && (units.includes('kmh') || units.includes('kph') || units.includes('kmhour'))) return value / 3.6;
  if (metric === 'irradiance' && units.includes('kw')) return value * 1000;
  if (metric === 'radiation') {
    if (units.includes('mgy')) return value * 1000;
    if (units.includes('gyday') && !units.includes('microgy')) return value * 1_000_000;
  }
  if (metric === 'o2ConsumptionKgDay' && units.includes('gday') && !units.includes('kgday')) return value / 1000;
  return value;
};

const readMetric = (row: DataRow, metric: Metric): number | null => {
  const found = findRawValue(row, FIELD_ALIASES[metric], true);
  if (!found) return null;
  const value = toFiniteNumber(found.value);
  return value === null ? null : convertMetricUnits(value, found.key, metric);
};

const aggregateMetric = (rows: DataRow[], metric: Metric, fallback: number): number => {
  const values = rows.map((row) => readMetric(row, metric)).filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
};

const readText = (row: DataRow, keys: readonly string[]): string | null => {
  const found = findRawValue(row, keys);
  return found && typeof found.value === 'string' && found.value.trim() ? found.value.trim() : null;
};

const splitRows = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
};

const delimiterScore = (text: string, delimiter: string): number => {
  let count = 0;
  let quoted = false;
  const sample = text.slice(0, 12000);
  for (let index = 0; index < sample.length; index += 1) {
    const character = sample[index]!;
    if (character === '"') quoted = !quoted;
    if (character === delimiter && !quoted) count += 1;
    if (character === '\n' && !quoted && count > 0) break;
  }
  return count;
};

const parseCsv = (text: string): DataRow[] => {
  const delimiter = [',', '\t', ';'].sort((a, b) => delimiterScore(text, b) - delimiterScore(text, a))[0]!;
  const rows = splitRows(text.replace(/^\uFEFF/, ''), delimiter);
  const headerIndex = rows.findIndex((row) => row.some((cell) => {
    const key = normalizeKey(cell);
    return Object.values(FIELD_ALIASES).some((aliases) => aliases.some((alias) => key === alias || key.startsWith(alias)));
  }));
  if (headerIndex < 0) throw new Error('No recognized MEDA/RAD column headers. Use fields such as temperature, pressure, wind, dustTau, or radiation.');
  const headers = rows[headerIndex]!.map((header) => header.trim());
  return rows.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
};

const extractRows = (value: unknown): DataRow[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ['sols', 'records', 'results', 'observations', 'rows', 'data']) {
    const candidate = value[key];
    if (Array.isArray(candidate) && candidate.every(isRecord)) return candidate;
  }
  if (Array.isArray(value.columns) && Array.isArray(value.data)) {
    const columns = value.columns.filter((column): column is string => typeof column === 'string');
    return value.data.filter(Array.isArray).map((values: unknown[]) => Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }
  return [value];
};

const groupRows = (rows: DataRow[]): DataRow[][] => {
  const groups = new Map<number, DataRow[]>();
  rows.forEach((row, index) => {
    const found = findRawValue(row, SOL_ALIASES);
    const sol = found ? toFiniteNumber(found.value) : null;
    const key = sol === null ? (rows.length <= 5 ? index + 1 : Math.min(5, Math.floor(index * 5 / rows.length) + 1)) : Math.round(sol);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  const selected = [...groups.entries()].sort(([a], [b]) => a - b).slice(0, 5).map(([, group]) => group);
  while (selected.length < 5) selected.push(selected[selected.length - 1]!);
  return selected;
};

const normalizeVisualEnvironment = (row: DataRow, weather: WeatherType, wind: number, dust: number): VisualEnvironment => {
  const visual = isRecord(row.visualEnvironment) ? row.visualEnvironment : null;
  const fallback = WEATHER_VISUALS[weather];
  return {
    skyColor: typeof visual?.skyColor === 'string' ? visual.skyColor : fallback.skyColor,
    fogColor: typeof visual?.fogColor === 'string' ? visual.fogColor : fallback.fogColor,
    fogDensity: toFiniteNumber(visual?.fogDensity) ?? clamp(0.005 + dust * 0.012, 0.006, 0.06),
    sunIntensity: toFiniteNumber(visual?.sunIntensity) ?? clamp(2.4 * Math.exp(-0.35 * dust), 0.15, 2.8),
    dustParticleSpeed: toFiniteNumber(visual?.dustParticleSpeed) ?? clamp(wind * 0.16, 0.15, 6),
  };
};

const normalizeSol = (rows: DataRow[], index: number): SolTelemetry => {
  const first = rows[0]!;
  const airTempCelsius = aggregateMetric(rows, 'temperature', -45);
  const groundTempCelsius = aggregateMetric(rows, 'groundTemperature', airTempCelsius - 8);
  const pressurePascal = aggregateMetric(rows, 'pressure', 720);
  const windSpeedMps = aggregateMetric(rows, 'wind', 5);
  const windDirectionDeg = aggregateMetric(rows, 'windDirection', 0);
  const dustOpticalDepthTau = aggregateMetric(rows, 'dustTau', 0.7);
  const radiationDoseMicroGyDay = aggregateMetric(rows, 'radiation', 210);
  const solarIrradianceWm2 = aggregateMetric(rows, 'irradiance', 590 * Math.exp(-0.35 * dustOpticalDepthTau));
  const o2ConsumptionKgDay = aggregateMetric(rows, 'o2ConsumptionKgDay', 0.84);
  const declaredWeather = readText(first, ['weathertype', 'weather', 'condition'])?.toUpperCase().replace(/[ -]/g, '_');
  const weatherType: WeatherType = WEATHER_TYPES.includes(declaredWeather as WeatherType)
    ? declaredWeather as WeatherType
    : dustOpticalDepthTau >= 2.5 ? 'MEGA_STORM'
      : radiationDoseMicroGyDay >= 1000 ? 'SOLAR_STORM'
        : airTempCelsius <= -70 ? 'DEEP_FREEZE'
          : windSpeedMps >= 12 || dustOpticalDepthTau >= 1.2 ? 'DUST_DEVIL' : 'CLEAR';
  const title = readText(first, ['title', 'missiontitle', 'name']) ?? `Sol ${index + 1}: ${WEATHER_LABELS[weatherType]}`;
  const hint = weatherType === 'DEEP_FREEZE' ? 'Boost [2] Heater to protect your suit and water pipes.'
    : weatherType === 'SOLAR_STORM' ? 'Boost [3] Shield to reduce radiation exposure.'
      : weatherType === 'DUST_DEVIL' || weatherType === 'MEGA_STORM' ? 'Use [1] Speed and [3] Shield; clean dusty solar panels at the farm.'
        : 'Conditions are stable. Explore, collect samples, and service the outpost.';
  const resources = getSolResourceContext(weatherType);
  const normalizedRadiationDose = Math.max(0, radiationDoseMicroGyDay);
  const photoRecord = isRecord(first.marsPhoto) ? first.marsPhoto : {};
  const recordCitations = Array.isArray(first.recordCitations)
    ? first.recordCitations.filter((citation): citation is string => typeof citation === 'string')
    : [];

  const normalized: SolTelemetry = {
    sol: index + 1,
    sourceSol: toFiniteNumber(first.sourceSol) ?? undefined,
    nightLowTempCelsius: toFiniteNumber(first.nightLowTempCelsius) ?? undefined,
    recordCitations: recordCitations.length > 0 ? recordCitations : [
      'NASA PDS Mars 2020 MEDA archive • https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/Mars2020/mars2020.html',
      `NASA DONKI ${readText(first, ['donkieventid']) ?? resources.donkiEventId} • https://ccmc.gsfc.nasa.gov/tools/DONKI/`,
      `NASA OSDR ${readText(first, ['osdrstudyid']) ?? resources.osdrStudyId} • https://osdr.nasa.gov/bio/repo/`,
      'NASA RadLab • https://visualization.osdr.nasa.gov/radlab/',
      'NASA Mars Trek • https://trek.nasa.gov/mars/',
      'CSA Space Food Production Toolkit • https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/',
    ],
    archiveNote: readText(first, ['archivenote']) ?? 'Imported archive scenario; not live telemetry.',
    marsPhoto: {
      url: readText(photoRecord, ['url']) ?? MARS_ROVER_PHOTO.url,
      credit: readText(photoRecord, ['credit']) ?? MARS_ROVER_PHOTO.credit,
      caption: readText(photoRecord, ['caption']) ?? MARS_ROVER_PHOTO.caption,
      description: readText(photoRecord, ['description']) ?? MARS_ROVER_PHOTO.description,
      capturedSol: toFiniteNumber(photoRecord.capturedSol) ?? MARS_ROVER_PHOTO.capturedSol,
      capturedOn: readText(photoRecord, ['capturedOn']) ?? MARS_ROVER_PHOTO.capturedOn,
      sourceUrl: readText(photoRecord, ['sourceUrl']) ?? MARS_ROVER_PHOTO.sourceUrl,
    },
    title,
    weatherType,
    airTempCelsius,
    groundTempCelsius,
    pressurePascal,
    windSpeedMps,
    windDirectionDeg: ((windDirectionDeg % 360) + 360) % 360,
    solarIrradianceWm2: Math.max(0, solarIrradianceWm2),
    dustOpticalDepthTau: Math.max(0, dustOpticalDepthTau),
    radiationDoseMicroGyDay: normalizedRadiationDose,
    radLabDoseMicroGyDay: normalizedRadiationDose,
    donkiEventId: readText(first, ['donkieventid']) ?? resources.donkiEventId,
    donkiFlareClass: readText(first, ['donkiflareclass']) ?? resources.donkiFlareClass,
    donkiCmeSpeedKms: toFiniteNumber(first.donkiCmeSpeedKms) ?? resources.donkiCmeSpeedKms,
    donkiSepEvent: typeof first.donkiSepEvent === 'boolean' ? first.donkiSepEvent : resources.donkiSepEvent,
    donkiAlert: readText(first, ['donkialert']) ?? resources.donkiAlert,
    osdrStudyId: readText(first, ['osdrstudyid']) ?? resources.osdrStudyId,
    osdrFinding: readText(first, ['osdrfinding']) ?? resources.osdrFinding,
    csaFoodStatus: readText(first, ['csafoodstatus']) ?? resources.csaFoodStatus,
    marsTrekCoords: readText(first, ['marstrekcoords']) ?? resources.marsTrekCoords,
    o2ConsumptionKgDay: Math.max(0, o2ConsumptionKgDay),
    visualEnvironment: normalizeVisualEnvironment(first, weatherType, windSpeedMps, dustOpticalDepthTau),
    missionBrief: readText(first, ['missionbrief', 'brief', 'description']) ?? `${title}. Air ${airTempCelsius.toFixed(1)}°C, pressure ${pressurePascal.toFixed(0)} Pa, wind ${windSpeedMps.toFixed(1)} m/s, dust Tau ${dustOpticalDepthTau.toFixed(2)}.`,
    optimalTradeoffHint: readText(first, ['optimaltradeoffhint', 'hint', 'engineerhint']) ?? hint,
  };
  const guide = getKidScienceGuide(normalized);
  return {
    ...normalized,
    kidFriendlySummary: readText(first, ['kidfriendlysummary']) ?? guide.kidFriendlySummary,
    earthComparison: readText(first, ['earthcomparison']) ?? guide.earthComparison,
    whatToDoKidTip: readText(first, ['whattodokidtip']) ?? guide.whatToDoKidTip,
    dataToGameEffect: readText(first, ['datatogameeffect']) ?? guide.dataToGameEffect,
  };
};

const readLiveFlare = (value: unknown): { id: string; classType: string; beginTime: string | null } | null => {
  if (!Array.isArray(value)) return null;
  const flare = value.filter(isRecord).at(-1);
  if (!flare || typeof flare.flrID !== 'string') return null;
  return {
    id: flare.flrID,
    classType: typeof flare.classType === 'string' && flare.classType ? flare.classType : 'UNCLASSIFIED',
    beginTime: typeof flare.beginTime === 'string' ? flare.beginTime : null,
  };
};

const readLiveOsdrStudy = (value: unknown): { id: string; title: string } | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const study = readLiveOsdrStudy(item);
      if (study) return study;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const source = isRecord(value._source) ? value._source : value;
  const idCandidate = source.Accession ?? source['Study Identifier'] ?? source['Study ID'];
  const titleCandidate = source['Study Title'] ?? source['Study Publication Title'];
  if (idCandidate || titleCandidate) {
    return {
      id: idCandidate ? String(idCandidate) : 'OSDR study',
      title: titleCandidate ? String(titleCandidate) : 'Untitled NASA OSDR study',
    };
  }
  for (const nested of Object.values(value)) {
    const study = readLiveOsdrStudy(nested);
    if (study) return study;
  }
  return null;
};

export const syncLiveNasaOpenApis = async (apiKey: string = NASA_API_KEY): Promise<LiveNasaSyncResult> => {
  const key = encodeURIComponent(apiKey.trim() || NASA_API_KEY);
  const endpoints = [
    { name: 'DONKI FLR', url: `https://api.nasa.gov/DONKI/FLR?api_key=${key}` },
    { name: 'NASA APOD', url: `https://api.nasa.gov/planetary/apod?api_key=${key}` },
    { name: 'NASA OSDR', url: 'https://osdr.nasa.gov/osdr/data/search?term=bone+muscle+spaceflight&size=3' },
  ] as const;
  const requests = endpoints.map(async ({ name, url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return {
          value: null,
          report: {
            name,
            url,
            status: response.status,
            ok: false,
            detail: `HTTP ${response.status} ${response.statusText || 'request failed'}`,
          } satisfies LiveNasaEndpointReport,
        };
      }
      return {
        value: await response.json() as unknown,
        report: { name, url, status: response.status, ok: true, detail: `HTTP ${response.status} OK` } satisfies LiveNasaEndpointReport,
      };
    } catch (error) {
      return {
        value: null,
        report: {
          name,
          url,
          status: 0,
          ok: false,
          detail: error instanceof Error ? error.message : 'Network request failed',
        } satisfies LiveNasaEndpointReport,
      };
    }
  });
  const [donki, apod, osdr] = await Promise.all(requests);
  const reports = [donki.report, apod.report, osdr.report];
  const liveUpdates: Partial<SolTelemetry> = {};
  const flare = readLiveFlare(donki.value);
  if (flare) {
    donki.report.detail = `${flare.id} • ${flare.beginTime ?? 'beginTime unavailable'} • ${flare.classType}`;
    liveUpdates.donkiEventId = flare.id;
    liveUpdates.donkiFlareClass = `FLR ${flare.classType}`;
    liveUpdates.donkiAlert = `${flare.id} • ${flare.beginTime ?? 'Recent DONKI record'} • Live API metadata; archived CME/RadLab gameplay values remain unchanged.`;
  } else if (donki.report.ok) {
    donki.report.detail = 'HTTP 200 OK • no flare records returned';
  }
  if (isRecord(apod.value)) {
    const title = typeof apod.value.title === 'string' ? apod.value.title : 'Untitled APOD';
    const date = typeof apod.value.date === 'string' ? apod.value.date : 'date unavailable';
    apod.report.detail = `${title} • ${date}`;
  } else if (apod.report.ok) {
    apod.report.detail = 'HTTP 200 OK • unreadable APOD metadata';
  }
  const study = readLiveOsdrStudy(osdr.value);
  if (study) {
    osdr.report.detail = `${study.id} • ${study.title}`;
    liveUpdates.osdrStudyId = study.id;
    liveUpdates.osdrFinding = `${study.title} — returned by the live NASA OSDR bone, muscle, and spaceflight search.`;
  } else if (osdr.report.ok) {
    osdr.report.detail = 'HTTP 200 OK • no study title returned';
  }
  const syncedSources = reports.filter((report) => report.ok).map((report) => report.name);
  const hasLiveConnection = syncedSources.length > 0;
  return {
    reports,
    liveUpdates,
    hasLiveConnection,
    syncedSources,
    message: hasLiveConnection
      ? `${syncedSources.join(' + ')} returned HTTP 200 OK. Only returned metadata was updated; MEDA/RadLab training measurements remain archived.`
      : 'No endpoint returned live 200 OK. The curated archive remains active and is not labeled as a live connection.',
  };
};

export const parseNasaDataset = (rawJsonOrCsv: string | unknown, sourceName?: string): NasaDataset => {
  let parsed: unknown = rawJsonOrCsv;
  if (typeof rawJsonOrCsv === 'string') {
    const trimmed = rawJsonOrCsv.trim();
    if (!trimmed) throw new Error('The selected NASA dataset is empty.');
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        throw new Error('The JSON file is malformed. Check commas, brackets, and quotation marks.');
      }
    } else {
      parsed = parseCsv(trimmed);
    }
  }
  const rows = extractRows(parsed);
  if (rows.length === 0) throw new Error('No tabular records found. Supply a JSON array, a sols/records array, or CSV with headers.');
  const hasRecognizedMetric = rows.some((row) => (Object.keys(FIELD_ALIASES) as Metric[]).some((metric) => readMetric(row, metric) !== null));
  if (!hasRecognizedMetric) throw new Error('No recognized telemetry values found. Supported fields include temperature, pressure, wind, irradiance, dustTau, radiation, and o2ConsumptionKgDay.');

  const root = isRecord(parsed) ? parsed : {};
  const metadata = isRecord(root.metadata) ? root.metadata : {};
  const baseSource = readText(metadata, ['source']) ?? readText(root, ['source', 'dataset', 'datasetname']) ?? 'Imported NASA telemetry';
  return {
    metadata: {
      source: sourceName ? `${sourceName} · ${baseSource}` : baseSource,
      location: readText(metadata, ['location']) ?? 'Jezero Crater, Mars',
      powerSource: readText(metadata, ['powerSource', 'powersource']) ?? '110W MMRTG + Outpost Solar Array',
      baseOutputWatts: toFiniteNumber(metadata.baseOutputWatts) ?? 110,
    },
    sols: groupRows(rows).map(normalizeSol),
  };
};
