import { Capacitor } from '@capacitor/core';
import { EscPosPrinter, PrinterConnectionType } from '@fedejm/capacitor-esc-pos-printer';

const STORAGE_KEY = 'noble_media_thermal_printer';
let activeHashKey = null;

export function getSavedThermalPrinter() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...saved, connected: false } : null;
  } catch {
    return null;
  }
}

export async function listThermalPrinters() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Printer Bluetooth hanya tersedia pada aplikasi Android.');
  }
  const enabled = await EscPosPrinter.requestBluetoothEnable();
  if (enabled?.value === false) throw new Error('Aktifkan Bluetooth pada perangkat Android.');
  const result = await EscPosPrinter.getBluetoothPrinterDevices();
  return (result.devices || []).map(device => ({
    name: device.alias || device.name || 'Bluetooth Printer',
    address: device.address,
    bondState: device.bondState
  })).filter(device => device.address);
}

export async function connectThermalPrinter(device) {
  if (!Capacitor.isNativePlatform()) throw new Error('Fitur printer hanya tersedia di Android.');
  if (!device?.address) throw new Error('Alamat printer Bluetooth tidak valid.');
  if (activeHashKey) {
    try { await EscPosPrinter.disconnectPrinter({ hashKey: activeHashKey }); } catch {}
    try { await EscPosPrinter.disposePrinter({ hashKey: activeHashKey }); } catch {}
    activeHashKey = null;
  }
  const created = await EscPosPrinter.createPrinter({
    connectionType: PrinterConnectionType.Bluetooth,
    address: device.address
  });
  const hashKey = created.value;
  if (!hashKey) throw new Error('Gagal membuat koneksi printer.');
  await EscPosPrinter.connectPrinter({ hashKey });
  activeHashKey = hashKey;
  const saved = { name: device.name, address: device.address, hashKey, connected: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export async function disconnectThermalPrinter() {
  const saved = getSavedThermalPrinter();
  const hashKey = activeHashKey || saved?.hashKey;
  if (hashKey) {
    try { await EscPosPrinter.disconnectPrinter({ hashKey }); } finally {
      await EscPosPrinter.disposePrinter({ hashKey });
    }
  }
  activeHashKey = null;
  localStorage.removeItem(STORAGE_KEY);
}

export async function printThermalText(value) {
  const saved = getSavedThermalPrinter();
  const hashKey = activeHashKey || saved?.hashKey;
  if (!hashKey) throw new Error('Printer belum terhubung. Hubungkan printer dari beranda.');
  activeHashKey = hashKey;
  const bytes = [0x1b, 0x40, ...Array.from(new TextEncoder().encode(String(value))), 0x0a, 0x0a, 0x0a];
  await EscPosPrinter.sendToPrinter({ data: bytes, waitingTime: 1200 });
}
