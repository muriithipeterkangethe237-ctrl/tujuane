import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './serviceWorkerRegistration';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { initTelemetryAndCrashReporting } from './services/telemetryService';

initTelemetryAndCrashReporting();

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

registerServiceWorker();
