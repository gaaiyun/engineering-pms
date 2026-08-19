import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.engineering.pms',
  appName: 'EngineeringPMS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'app.local',
    cleartext: false,
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
