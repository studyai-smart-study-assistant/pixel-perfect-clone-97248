import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.familycare.app',
  appName: 'Family Care',
  webDir: 'dist/client',
  bundledWebRuntime: false,
  plugins: {
    MLKitBarcodeScanning: {
      presentGooglePlayServicesAvailability: true,
      googleBarcodeScannerModuleInstallRequest: true,
    },
  },
};

export default config;
