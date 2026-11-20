import { registerRootComponent } from 'expo';
import App from './App';

// Ensures the root component registers reliably in standalone Android APK builds
registerRootComponent(App);
