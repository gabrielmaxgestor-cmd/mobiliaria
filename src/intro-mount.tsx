import { createRoot } from 'react-dom/client';
import { IntroOverlay } from '@/components/IntroOverlay';

function init3dIntro() {
  const mountPoint = document.getElementById('3d-intro-root');
  if (mountPoint) {
    const root = createRoot(mountPoint);
    root.render(<IntroOverlay />);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init3dIntro);
} else {
  init3dIntro();
}
