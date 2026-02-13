// web_fetcher.ts
// This module provides a cached web fetching utility.
// Assumes a modern JavaScript environment where 'fetch' is globally available (e.g., Node.js 18+ or browser).

const cache = new Map<string, string>();

/**
 * Fetches content from a given URL, utilizing an in-memory cache.
 * If the URL has been fetched before, its cached content is returned.
 * Otherwise, a new web request is made, and the content is stored in the cache.
 *
 * @param url The URL to fetch.
 * @returns A Promise that resolves to the content of the URL as a string.
 * @throws An error if the fetch operation fails (e.g., network error, non-2xx status).
 */
export async function fetchWithCache(url: string): Promise<string> {
  if (cache.has(url)) {
    console.log(`Cache hit for ${url}`);
    return cache.get(url)!;
  }

  console.log(`Fetching ${url}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText} (Status: ${response.status})`);
    }
    const content = await response.text();
    cache.set(url, content);
    console.log(`Successfully fetched and cached ${url}`);
    return content;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    // Re-throw to allow the caller to handle it
    throw error;
  }
}
