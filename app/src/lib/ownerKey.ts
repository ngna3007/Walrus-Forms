/**
 * Resolves the "owner key" used to scope local + remote (Supabase) reads/writes.
 *
 * History: this was a random UUID stored in localStorage. That meant clearing
 * browser storage wiped the user's view of their own forms (the UUID changed,
 * so the Supabase `owner_key=eq.<UUID>` filter returned nothing).
 *
 * Now: the owner key is the connected wallet address. Multi-device, deterministic,
 * stable across cache wipes. The last-known address is cached so offline reads
 * keep working briefly when the wallet is not yet connected on this page load.
 */

const LAST_ADDRESS_KEY = "walrus.forms.owner.address.v1";
const LISTENERS = new Set<(address: string | null) => void>();

let currentAddress: string | null = null;

export function setCurrentOwner(address: string | null): void {
  currentAddress = address;
  if (typeof window !== "undefined") {
    if (address) window.localStorage.setItem(LAST_ADDRESS_KEY, address);
  }
  for (const listener of LISTENERS) listener(address);
}

export function getCurrentOwnerKey(): string {
  if (currentAddress) return currentAddress;
  if (typeof window !== "undefined") {
    const cached = window.localStorage.getItem(LAST_ADDRESS_KEY);
    if (cached) return cached;
  }
  return "anonymous";
}

export function subscribeToOwner(listener: (address: string | null) => void): () => void {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}
