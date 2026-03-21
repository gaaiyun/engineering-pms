import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.engineering.pms',
  appName: 'EngineeringPMS',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    // url: 'http://192.168.x.x:5173' // Unleash this for Live Reload
  },
  plugins: {
    LocalNotifications: {
      // 不指定 sound，Android 使用系统默认通知音
      iconColor: '#2563EB',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
