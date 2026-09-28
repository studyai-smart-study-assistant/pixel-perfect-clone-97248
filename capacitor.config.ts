import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.familycare.app',
  appName: 'Family Care',
  webDir: '.output/public',
  bundledWebRuntime: false,
  plugins: {
    MLKitBarcodeScanning: {
      presentGooglePlayServicesAvailability: true,
      googleBarcodeScannerModuleInstallRequest: true,
    },
  },
};

export default config;
