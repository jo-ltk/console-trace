import { create } from 'zustand';
import { ScanResult, ScanConfiguration } from '../types/scan';

interface AppState {
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (val: boolean) => void;

  recentScans: ScanResult[];
  addRecentScan: (scan: ScanResult) => void;
  setRecentScans: (scans: ScanResult[]) => void;
  clearHistory: () => void;

  currentConfig: ScanConfiguration;
  updateConfig: (updater: (prev: ScanConfiguration) => ScanConfiguration) => void;

  activeScanId: string | null;
  setActiveScanId: (id: string | null) => void;
}

const DEFAULT_CONFIG: ScanConfiguration = {
  url: '',
  options: {
    consoleOutput: true,
    jsErrors: true,
    networkFailures: true,
    brokenAssets: true,
    performance: true,
    accessibility: true,
  },
  advanced: {
    maxPages: 5,
    interactionDepth: 'standard',
    device: 'mobile',
  },
};

export const useAppStore = create<AppState>((set) => ({
  hasCompletedOnboarding: false,
  setHasCompletedOnboarding: (val) => set({ hasCompletedOnboarding: val }),

  recentScans: [],
  addRecentScan: (scan) =>
    set((state) => ({
      recentScans: [scan, ...state.recentScans.filter((s) => s.id !== scan.id)],
    })),
  setRecentScans: (scans) => set({ recentScans: scans }),
  clearHistory: () => set({ recentScans: [] }),

  currentConfig: DEFAULT_CONFIG,
  updateConfig: (updater) =>
    set((state) => ({ currentConfig: updater(state.currentConfig) })),

  activeScanId: null,
  setActiveScanId: (id) => set({ activeScanId: id }),
}));
