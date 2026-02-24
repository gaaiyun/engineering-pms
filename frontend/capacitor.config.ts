import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.engineering.pms',
  appName: 'EngineeringPMS',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    // url: 'http://192.168.x.x:5173' // Unleash this for Live Reload
  }
};

export default config;
