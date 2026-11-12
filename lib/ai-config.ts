// Public AI configuration, loaded at runtime from public/ai-config.json.
//
// SECURITY: everything in this file is served to every visitor of the static
// site. Never put an API key here. Keys live in .dev.vars (local server) or in
// the Cloudflare Worker secrets (app/api/nacre/route.ts); for the GitHub Pages
// build, `aiEndpoint` points at that Worker, which holds the keys server-side.
//
// Example of a Pages build that uses a deployed Worker:
//   { "aiEndpoint": "https://nacre-ai.<compte>.workers.dev/api/ai" }
// Leave it empty to keep the static site in "no AI" mode.

export type AiConfig = {
  aiEndpoint: string;
  model: string;
  models: string[];
};

const DEFAULT_CONFIG: AiConfig = {
  aiEndpoint: '',
  model: 'nvidia/nemotron-3.5-super-vl:free',
  models: ['nvidia/nemotron-3.5-super-vl:free', 'dots-studio/dots-3-note-preview:free'],
};

let configPromise: Promise<AiConfig> | null = null;

function sanitize(raw: unknown): AiConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const models = Array.isArray(value.models)
    ? value.models.filter((m): m is string => typeof m === 'string' && /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(m)).slice(0, 5)
    : [];
  const model = typeof value.model === 'string' && models.includes(value.model) ? value.model : models[0] || DEFAULT_CONFIG.model;
  // Only an absolute https URL is accepted: it is the address of our own Worker.
  const endpoint = typeof value.aiEndpoint === 'string' && /^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(value.aiEndpoint) ? value.aiEndpoint : '';
  return { aiEndpoint: endpoint, model, models: models.length ? models : [model] };
}

/** Loads ai-config.json once. A missing or broken file falls back to defaults. */
export function loadAiConfig(): Promise<AiConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch('./ai-config.json', { cache: 'no-store' });
        if (!res.ok) return DEFAULT_CONFIG;
        return sanitize(await res.json());
      } catch {
        return DEFAULT_CONFIG;
      }
    })();
  }
  return configPromise;
}

export function aiAvailable(config: AiConfig | null): boolean {
  return !!config && config.aiEndpoint.length > 0;
}
