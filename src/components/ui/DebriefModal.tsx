import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getRecommendedPowerSplit, useGameStore } from '../../store/useGameStore';
import type { OnboardingStage, PowerSystem } from '../../store/useGameStore';
import { playUiClick, playVictoryFanfare, speakDialogue, stopDialogue } from '../../utils/soundEngine';

const MENU_DIALOGUE = [
  {
    audioKey: 'commander_welcome',
    speaker: 'Commander Sunita',
    isCommander: true,
    text: "Welcome to Kennedy Space Center, Cadet! On Mars, our base battery only makes 110 Watts, so you'll switch power between your Jetpack, Heater, and Shield.",
  },
  {
    audioKey: 'cadet_ready',
    speaker: 'Junior Cadet',
    isCommander: false,
    text: "I'm ready, Commander! I'll watch the Mars weather and collect rock samples for Perseverance!",
  },
  {
    audioKey: 'commander_white_room',
    speaker: 'Commander Sunita',
    isCommander: true,
    text: "That's the spirit! Walk to the launch tower elevator and head up to the White Room. I'll stay on comms with you on Mars!",
  },
] as const;

const VICTORY_DIALOGUE = [
  {
    speaker: 'Commander Sunita',
    isCommander: true,
    voice: 'COMMANDER',
    text: 'Welcome back to Earth, Junior Astronaut! You survived all 5 Martian Sols, balanced our 110-Watt battery, and brought real Mars samples home!',
  },
  {
    speaker: 'NASA Astronaut Corps',
    isCommander: false,
    voice: 'COMMANDER',
    text: 'Every astronaut at Kennedy Space Center is proud of you! Your rock samples and greenhouse data will help humanity live on Mars.',
  },
  {
    speaker: 'Junior Cadet',
    isCommander: false,
    voice: 'CADET',
    text: "Thank you, Commander! That was the best expedition ever—I'm ready to fly to Mars again!",
  },
] as const;

const CUTSCENE_CAPTIONS: Record<OnboardingStage, string> = {
  1: 'Commander Sunita waves as you get ready for launch...',
  2: 'Walking to the launch tower elevator...',
  3: 'Riding the high-speed elevator up the launch tower...',
  4: 'Crossing the Crew Access Arm into the sterile White Room...',
  5: 'Main engines ignited! Liftoff to Mars!',
  6: 'Landing retro-rockets firing at Jezero Crater, Mars!',
  7: 'Descending the lander stairs onto the surface of Jezero Crater, Mars!',
};

const VICTORY_CAPTIONS = {
  MARS_BOARDING_ASCENT: 'Boarding the Mars Ascent Vehicle... Liftoff from Jezero Crater toward Earth!',
  DEEP_SPACE_TRANSIT: 'Trans-Earth Injection burn complete — cruising home to Planet Earth!',
  EARTH_PARACHUTE_LANDING: 'Main parachutes deployed! Touchdown at Kennedy Space Center, Earth!',
} as const;

const RPG_ACTION_CLASS =
  'cursor-pointer rounded-lg border border-white/40 bg-slate-900/90 px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-white hover:text-slate-950 md:text-base';

const CutsceneCaption = ({ children }: { children: string }) => (
  <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 w-[92vw] max-w-2xl -translate-x-1/2 text-center">
    <div role="status" aria-live="polite" className="rounded-xl border border-white/25 bg-slate-950/75 px-6 py-2.5 text-base font-semibold text-white backdrop-blur-md">
      {children}
    </div>
  </div>
);

const requestGameplayPointerLock = (): void => {
  playUiClick();
  const canvas = document.querySelector('canvas');
  if (!canvas || document.pointerLockElement === canvas) return;
  try {
    const request = canvas.requestPointerLock();
    if (request) void request.catch(() => {});
  } catch {}
};

const RpgDialogueBox = ({ speaker, isCommander = true, children, actions }: {
  speaker: string;
  isCommander?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <div role="dialog" aria-modal="true" aria-label={speaker} className="fixed bottom-6 left-1/2 z-30 w-[92vw] max-w-2xl -translate-x-1/2">
    <div className={`flex ${isCommander ? 'justify-start' : 'justify-end'}`}>
      <div className={`inline-block rounded-t-xl border-t-2 border-x-2 border-white/30 bg-slate-950/85 px-4 py-1.5 text-base font-bold ${isCommander ? 'text-amber-300' : 'text-sky-300'}`}>{speaker}</div>
    </div>
    <div className={`max-h-[82dvh] overflow-y-auto rounded-b-2xl border-2 border-white/30 bg-slate-950/80 p-5 text-white backdrop-blur-md ${isCommander ? 'rounded-tr-2xl rounded-tl-none' : 'rounded-tl-2xl rounded-tr-none'}`}>
      <div className="text-lg font-semibold leading-snug md:text-xl">{children}</div>
      {actions && <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>}
    </div>
  </div>
);

const CompactPowerAdjuster = () => {
  const thrusterPower = useGameStore((state) => state.thrusterPower);
  const thermalPower = useGameStore((state) => state.thermalPower);
  const shieldSensorPower = useGameStore((state) => state.shieldSensorPower);
  const allocatePower = useGameStore((state) => state.allocatePower);
  const systems: { system: PowerSystem; label: string; icon: string; value: number }[] = [
    { system: 'thruster', label: 'Speed', icon: '🚀', value: thrusterPower },
    { system: 'thermal', label: 'Heater', icon: '🔥', value: thermalPower },
    { system: 'shieldSensor', label: 'Shield', icon: '🛡️', value: shieldSensorPower },
  ];

  return (
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Shared power controls">
      {systems.map(({ system, label, icon, value }) => (
        <div key={system} className="flex items-center gap-1.5 rounded-lg border border-white/25 bg-slate-900/70 px-2 py-1 text-sm">
          <span className="font-bold"><span aria-hidden="true">{icon}</span> {label}</span>
          <button type="button" aria-label={`Decrease ${label} power`} onClick={() => allocatePower(system, -5)} className="h-6 w-6 cursor-pointer rounded-md border border-white/25 bg-white/5 font-bold hover:bg-white hover:text-slate-950">−</button>
          <span className="w-9 text-center font-mono text-xs font-bold">{Math.round(value)}%</span>
          <button type="button" aria-label={`Increase ${label} power`} onClick={() => allocatePower(system, 5)} className="h-6 w-6 cursor-pointer rounded-md border border-white/25 bg-white/5 font-bold hover:bg-white hover:text-slate-950">+</button>
        </div>
      ))}
    </div>
  );
};

export const DebriefModal = () => {
  const gameStatus = useGameStore((state) => state.gameStatus);
  const audioMuted = useGameStore((state) => state.audioMuted);
  const activeSol = useGameStore((state) => state.solsData[state.currentSolIndex]!);
  const currentSolIndex = useGameStore((state) => state.currentSolIndex);
  const solCount = useGameStore((state) => state.solsData.length);
  const suitOxygenAndHeat = useGameStore((state) => state.suitOxygenAndHeat);
  const dustLevel = useGameStore((state) => state.dustLevel);
  const onboardingPhase = useGameStore((state) => state.onboardingPhase);
  const onboardingStage = useGameStore((state) => state.onboardingStage);
  const victoryPhase = useGameStore((state) => state.victoryPhase);
  const victoryRunId = useGameStore((state) => state.victoryRunId);
  const advanceOnboardingPhase = useGameStore((state) => state.advanceOnboardingPhase);
  const setOnboardingPhase = useGameStore((state) => state.setOnboardingPhase);
  const advanceSol = useGameStore((state) => state.advanceSol);
  const startEarthReturnJourney = useGameStore((state) => state.startEarthReturnJourney);
  const resumeFromSafetyPause = useGameStore((state) => state.resumeFromSafetyPause);
  const restartSolFromOutpost = useGameStore((state) => state.restartSolFromOutpost);
  const returnToLaunchComplex = useGameStore((state) => state.returnToLaunchComplex);
  const [dialogueLine, setDialogueLine] = useState(0);
  const [victoryDialogueLine, setVictoryDialogueLine] = useState(0);
  const [jettisonCaptionRunId, setJettisonCaptionRunId] = useState<number | null>(null);
  const serviceModuleJettisoned = jettisonCaptionRunId === victoryRunId;
  const isMenu = gameStatus === 'MENU';
  const isFinalSol = currentSolIndex >= solCount - 1;
  const suitFailed = suitOxygenAndHeat <= 0;
  const safetyText = suitFailed
    ? `Hold up, Cadet! Mars cooled to ${Math.round(activeSol.airTempCelsius)}°C and your Suit Heater needed more power. Let's turn up the Heater and keep going!`
    : 'Hold up, Cadet! This storm needs a stronger Shield. Let’s boost Shield power and get back to exploring!';
  const solCompleteText = isFinalSol
    ? "Incredible work, Junior Astronaut! You survived all 5 Martian Sols and collected the science samples NASA needed. The Mars Ascent Vehicle is fueled and ready—let's fly home to Earth!"
    : 'Great work, Cadet! You kept our base safe. Let’s get ready for another Martian day!';

  useEffect(() => {
    if (gameStatus !== 'PLAYING' && document.pointerLockElement) {
      void document.exitPointerLock();
    }
  }, [gameStatus]);

  useEffect(() => {
    if (isMenu && onboardingPhase === 'PRE_FLIGHT_DIALOGUE') {
      const line = MENU_DIALOGUE[dialogueLine]!;
      speakDialogue(line.text, line.isCommander ? 'COMMANDER' : 'CADET');
    } else if (gameStatus === 'VICTORY' && victoryPhase === 'EARTH_WELCOME_CEREMONY') {
      const line = VICTORY_DIALOGUE[victoryDialogueLine]!;
      speakDialogue(line.text, line.voice);
    } else if (gameStatus === 'GAME_OVER') {
      speakDialogue(safetyText, 'COMMANDER');
    } else if (gameStatus === 'SOL_COMPLETE') {
      speakDialogue(solCompleteText, 'COMMANDER');
    } else {
      stopDialogue();
    }
    return () => stopDialogue();
  }, [gameStatus, isMenu, onboardingPhase, victoryPhase, dialogueLine, victoryDialogueLine, audioMuted, activeSol.sol, safetyText, solCompleteText]);

  useEffect(() => {
    if (gameStatus === 'VICTORY' && victoryPhase === 'EARTH_WELCOME_CEREMONY') {
      playVictoryFanfare();
    }
  }, [gameStatus, victoryPhase]);

  useEffect(() => {
    if (gameStatus !== 'VICTORY' || victoryPhase !== 'DEEP_SPACE_TRANSIT') return;
    const timer = window.setTimeout(() => setJettisonCaptionRunId(victoryRunId), 3700);
    return () => window.clearTimeout(timer);
  }, [gameStatus, victoryPhase, victoryRunId]);

  if (gameStatus === 'PLAYING') return null;

  if (isMenu && onboardingPhase === 'TITLE_SCREEN') {
    return (
      <section aria-labelledby="game-title" className="pointer-events-none fixed inset-y-0 left-0 z-20 flex max-w-xl select-none flex-col justify-center pl-8 md:pl-16 lg:pl-24">
        <h1 id="game-title" className="mt-1 leading-none tracking-tight">
          <span className="game-title-3d relative block text-5xl md:text-6xl lg:text-7xl">
            <span aria-hidden="true">JEZERO</span>
            <span className="game-title-face" style={{ backgroundImage: 'linear-gradient(180deg, #bae6fd 0%, #38bdf8 50%, #0284c7 100%)' }}>JEZERO</span>
          </span>
          <span className="game-title-3d relative mt-1 block text-5xl md:text-6xl lg:text-7xl">
            <span aria-hidden="true">CRATER</span>
            <span className="game-title-face" style={{ backgroundImage: 'linear-gradient(180deg, #fef08a 0%, #fb923c 50%, #ea580c 100%)' }}>CRATER</span>
          </span>
          <span className="game-title-3d game-title-small relative mt-1 block text-4xl md:text-5xl lg:text-6xl">
            <span aria-hidden="true">EXPEDITION</span>
            <span className="game-title-face" style={{ backgroundImage: 'linear-gradient(180deg, #bae6fd 0%, #38bdf8 50%, #0284c7 100%)' }}>EXPEDITION</span>
          </span>
        </h1>
        <div className="mb-7 mt-4 w-fit whitespace-nowrap rounded-full border border-white/15 bg-slate-950/55 px-4 py-1.5 text-sm font-bold text-white/95 backdrop-blur-md md:text-base">
          👩‍🚀 Survive 5 Real Martian Sols • Powered by Official NASA &amp; CSA Data
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => {
            playUiClick();
            setDialogueLine(0);
            setOnboardingPhase('PRE_FLIGHT_DIALOGUE');
          }}
          className="group relative inline-flex w-fit max-w-[calc(100vw-3rem)] cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-white/35 bg-gradient-to-b from-[#ff5136] to-[#e02f12] px-8 py-4 text-lg font-extrabold tracking-wide text-white shadow-[0_6px_0_#8f1d09,0_12px_20px_rgba(0,0,0,0.35)] transition-all duration-100 hover:from-[#ff634b] hover:to-[#fc3d21] active:translate-y-[4px] active:shadow-[0_2px_0_#8f1d09] pointer-events-auto"
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-[2px] rounded-[13px] border-t border-white/25" />
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/30 bg-white/15">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4c2.5-2.5 6-2 6-2s.5 3.5-2 6l-5 5-4-4z" />
              <path d="m9 9-4 .5-3 3 6 1M13 13l-.5 4-3 3-1-6" />
              <circle cx="16" cy="6" r="1.4" fill="currentColor" stroke="none" />
              <path d="M7 16c-2 1-3 4-3 4s3-1 4-3" stroke="#fef08a" />
            </svg>
          </span>
          <span className="relative">Board Spacecraft &amp; Launch to Mars</span>
          <span aria-hidden="true" className="relative text-2xl transition-transform group-hover:translate-x-1">▸</span>
        </button>
      </section>
    );
  }

  if (isMenu && onboardingPhase === 'PRE_FLIGHT_DIALOGUE') {
    const line = MENU_DIALOGUE[dialogueLine]!;
    const isLastLine = dialogueLine === MENU_DIALOGUE.length - 1;
    return (
      <RpgDialogueBox speaker={line.speaker} isCommander={line.isCommander} actions={
        <button type="button" autoFocus onClick={() => {
          if (isLastLine) advanceOnboardingPhase();
          else {
            playUiClick();
            setDialogueLine(dialogueLine + 1);
          }
        }} className={RPG_ACTION_CLASS}>
          {isLastLine ? '[Board Rocket! ▸]' : '[Next ▸]'}
        </button>
      }>
        {line.text}
      </RpgDialogueBox>
    );
  }

  if (isMenu && (onboardingPhase === 'BOARDING_LAUNCH' || onboardingPhase === 'MARS_LANDING')) {
    return <CutsceneCaption>{CUTSCENE_CAPTIONS[onboardingStage]}</CutsceneCaption>;
  }

  if (gameStatus === 'VICTORY') {
    if (victoryPhase !== 'EARTH_WELCOME_CEREMONY') {
      const caption = victoryPhase === 'DEEP_SPACE_TRANSIT' && serviceModuleJettisoned
        ? 'Approaching Earth — Service Module jettisoned! Heatshield enduring 2,700°C atmospheric entry!'
        : VICTORY_CAPTIONS[victoryPhase];
      return <CutsceneCaption>{caption}</CutsceneCaption>;
    }
    const line = VICTORY_DIALOGUE[victoryDialogueLine]!;
    const isLastLine = victoryDialogueLine === VICTORY_DIALOGUE.length - 1;
    return (
      <RpgDialogueBox speaker={line.speaker} isCommander={line.isCommander} actions={
        isLastLine ? (
          <button
            type="button"
            autoFocus
            onClick={() => {
              stopDialogue();
              setVictoryDialogueLine(0);
              returnToLaunchComplex();
            }}
            className="group inline-flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-white/35 bg-gradient-to-b from-[#ff5136] to-[#e02f12] px-6 py-3 text-base font-extrabold tracking-wide text-white shadow-[0_5px_0_#8f1d09,0_10px_18px_rgba(0,0,0,0.3)] transition-all duration-100 hover:from-[#ff634b] hover:to-[#fc3d21] active:translate-y-[3px] active:shadow-[0_2px_0_#8f1d09] md:text-lg"
          >
            <span>🚀 Return to Launch Complex</span>
            <span aria-hidden="true" className="text-xl transition-transform group-hover:translate-x-1">▸</span>
          </button>
        ) : (
          <button type="button" autoFocus onClick={() => {
            playUiClick();
            setVictoryDialogueLine(victoryDialogueLine + 1);
          }} className={RPG_ACTION_CLASS}>[Next ▸]</button>
        )
      }>
        {line.text}
      </RpgDialogueBox>
    );
  }

  if (isMenu) return null;

  if (gameStatus === 'GAME_OVER') {
    const recommendation = getRecommendedPowerSplit(activeSol, dustLevel, suitFailed ? 'SUIT' : 'SHIELD');
    return (
      <RpgDialogueBox speaker="Commander Sunita • Safety Mentor" actions={
        <>
          <button type="button" onClick={() => {
            stopDialogue();
            restartSolFromOutpost();
            requestGameplayPointerLock();
          }} className={RPG_ACTION_CLASS}>[Restart Sol]</button>
          <button type="button" autoFocus onClick={() => {
            stopDialogue();
            resumeFromSafetyPause(recommendation.thruster, recommendation.thermal, recommendation.shield);
            requestGameplayPointerLock();
          }} className={RPG_ACTION_CLASS}>[⚡ Fix Power & Continue ▸]</button>
        </>
      }>
        {safetyText}
        <CompactPowerAdjuster />
      </RpgDialogueBox>
    );
  }

  if (gameStatus === 'SOL_COMPLETE') {
    return (
      <RpgDialogueBox speaker={isFinalSol ? 'Commander Sunita • Mission Accomplished (Sol 5/5)' : 'Commander Sunita • Mission Complete!'} actions={
        <button type="button" autoFocus onClick={() => {
          stopDialogue();
          if (isFinalSol) {
            playUiClick();
            if (document.pointerLockElement) void document.exitPointerLock();
            startEarthReturnJourney();
          } else {
            advanceSol();
            requestGameplayPointerLock();
          }
        }} className={isFinalSol
          ? 'cursor-pointer rounded-xl border border-white/40 bg-gradient-to-b from-[#ff5136] to-[#e02f12] px-6 py-2.5 font-extrabold text-white shadow-[0_4px_0_#8f1d09] transition-all hover:from-[#ff634b] hover:to-[#fc3d21] active:translate-y-0.5'
          : RPG_ACTION_CLASS}>
          {isFinalSol ? '🚀 Return to Earth ▸' : '[Next Sol ▸]'}
        </button>
      }>
        {solCompleteText}
        <CompactPowerAdjuster />
      </RpgDialogueBox>
    );
  }

  return null;
};
