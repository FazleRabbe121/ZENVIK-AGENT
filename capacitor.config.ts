import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ccd.abetteryou',
  appName: 'ZENVIK-AGENT',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
