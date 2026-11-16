import { Analytics } from '@vercel/analytics/react';
import { Experience } from './components/canvas/Experience';
import { DebriefModal } from './components/ui/DebriefModal';
import { HUD } from './components/ui/HUD';
import { TelemetryBox } from './components/ui/TelemetryBox';
import { LoadingScreen } from './components/ui/LoadingScreen';

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans text-white">
      <div className="absolute inset-0">
        <Experience />
      </div>
      <HUD />
      <TelemetryBox />
      <DebriefModal />
      <LoadingScreen />
      <Analytics />
    </div>
  );
}
