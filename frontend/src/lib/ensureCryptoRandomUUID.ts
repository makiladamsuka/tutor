/**
 * LiveKit `sendText` needs `crypto.randomUUID()`; polyfill when missing.
 */
export function ensureCryptoRandomUUID(): void {
  if (typeof globalThis === "undefined") return;

  const existing = globalThis.crypto;
  if (existing && typeof existing.randomUUID === "function") return;

  const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;

  if (existing && typeof existing === "object") {
    try {
      Object.defineProperty(existing, "randomUUID", {
        value: randomUUID,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        randomUUID,
        getRandomValues<T extends ArrayBufferView>(arr: T): T {
          const view = new Uint8Array(
            arr.buffer,
            arr.byteOffset,
            arr.byteLength,
          );
          for (let i = 0; i < view.length; i++) {
            view[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
      } as Crypto,
      configurable: true,
    });
  } catch {
    /* ignore */
  }
}
