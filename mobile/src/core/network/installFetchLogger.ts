let installed = false;

function requestToLabel(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function installFetchLogger() {
  if (installed || !__DEV__) return;
  installed = true;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = requestToLabel(input);
    try {
      return await originalFetch(input, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Aborted' || url.includes('/api/location')) {
        throw error;
      }
      console.warn(`[network] Fetch failed: ${url} (${message})`);
      throw error;
    }
  };
}
