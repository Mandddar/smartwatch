/**
 * Google Health Connect integration — STUB.
 * The actual react-native-health-connect package is only installed for
 * production builds with compileSdkVersion 35. For demo/preview builds,
 * this module provides no-op stubs that gracefully degrade.
 *
 * When the package IS installed, replace this with the full implementation.
 */

let lastSourceDisplayName = 'Simulator';

export async function initHealthConnect(): Promise<boolean> {
  return false;
}

export function isHealthConnectAvailable(): boolean {
  return false;
}

export async function requestPermissions(): Promise<boolean> {
  return false;
}

export async function pollLatestData(): Promise<{ count: number }> {
  return { count: 0 };
}

export function startPolling(_intervalMs?: number): void {}

export function stopPolling(): void {}

export function isPolling(): boolean {
  return false;
}

export function getSourcePackage(): string | null {
  return null;
}

export function getSourceName(): string {
  return lastSourceDisplayName;
}
