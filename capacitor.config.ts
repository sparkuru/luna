import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'majo.im.luna',
  appName: 'Luna',
  webDir: 'dist-web',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
