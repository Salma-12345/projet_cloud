import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/500.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/playpen-sans/500.css';
import '@fontsource/playpen-sans/600.css';
import '@fontsource/playpen-sans/700.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('racine')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Application installable (PWA) : on garde l'invitation d'installation pour la page « Mon compte »
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installationPwa = e;
});

// Enregistrement du service worker (cache hors ligne + notifications push)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
