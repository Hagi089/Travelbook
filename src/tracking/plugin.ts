import { Capacitor, registerPlugin } from '@capacitor/core';
import type { TrackingPlugin } from './types';
import { createWebTracking } from './webFallback';

/** Das native Kotlin-Plugin "Tracking" (Android). Im Browser nicht vorhanden. */
const nativeTracking = registerPlugin<TrackingPlugin>('Tracking');

let webInstance: TrackingPlugin | null = null;

/** Gibt unter Android das native Plugin zurück, sonst den (nicht hintergrundfähigen) Web-Fallback. */
export function getTrackingPlugin(): TrackingPlugin {
  if (Capacitor.isNativePlatform()) return nativeTracking;
  webInstance ??= createWebTracking();
  return webInstance;
}
