import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Capture Chrome/Android install prompt early before React mounts
declare global {
  interface Window {
    __kashfDeferredInstallPrompt?: Event | null;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__kashfDeferredInstallPrompt = e;
});

registerSW({immediate: true});

createRoot(document.getElementById('root')!).render(<App />);
