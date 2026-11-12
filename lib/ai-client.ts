// Recipe generation through the Nacre AI Worker (OpenRouter).
//
// The static site never holds an API key: it calls the Worker named in
// public/ai-config.json, and the Worker calls OpenRouter with its own secret.
// The Worker is app/api/nacre/route.ts, run with `wrangler dev` / deployed as
// a Cloudflare Worker. See README §5.
//
// The Worker answers { recipe, provider, model } on success and
// { error, reason, detail? } on failure, where reason is one of:
//   not_configured | quota | timeout | provider | rate_limited | incomplete

import { recipeSchema, type RecipeData } from './recipe.ts';

export type AiFailure = {
  message: string;
  reason: string;
  status: number;
};

export type AiResult = { recipe: RecipeData; provider: string; model: string };

const MESSAGES: Record<string, string> = {
  not_configured: 'L’assistant IA n’est pas encore connecté sur ce site. Vous pouvez écrire votre recette vous-même en attendant.',
  quota: 'Vos 20 créations du jour sont utilisées. Retrouvez vos recettes dans le livre général ou écrivez-en une vous-même.',
  timeout: 'L’assistant a mis trop de temps à répondre. Réessayez dans un instant.',
  rate_limited: 'L’assistant est très sollicité en ce moment. Réessayez dans une minute.',
  incomplete: 'La recette reçue était incomplète, elle n’a pas été publiée. Réessayez avec une demande plus simple.',
  provider: 'L’assistant IA est momentanément indisponible. Aucun brouillon n’a été publié.',
  network: 'Impossible de joindre l’assistant IA. Vérifiez votre connexion puis réessayez.',
};

export function aiFailure(reason: string, detail = '', status = 502): AiFailure {
  return { message: MESSAGES[reason] || MESSAGES.provider, reason, status };
}

/**
 * Calls the AI Worker and returns a validated recipe, or throws an AiFailure.
 * `endpoint` comes from ai-config.json; an empty endpoint means "no AI here".
 */
export async function generateRecipeWithAi(endpoint: string, prompt: string, timeoutMs = 150_000): Promise<AiResult> {
  if (!endpoint) throw aiFailure('not_configured', '', 503);
  // Un vrai AbortError (délai dépassé) doit être distinguable d'une coupure réseau :
  // sans ce drapeau, `controller.abort()` produit aussi une AbortError et le
  // navigateur affichait « Vérifiez votre connexion » pour un simple délai.
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let res: Response;
  const bare = endpoint.replace(/^https:\/\//, '').split('/')[0];
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate', prompt }),
      signal: controller.signal,
    });
  } catch (e: any) {
    // No-CORS on purpose: a bare "Failed to fetch" tells the user nothing, while
    // the browser's error names the host ("nacre-ai.example.workers.dev"), which
    // is what someone following the README needs in order to fix the endpoint.
    const reason = timedOut || e?.name === 'TimeoutError' ? 'timeout' : 'network';
    const host = /https?:\/\/[\w.-]+/.exec(String(e?.message || ''))?.[0]?.replace(/^https?:\/\//, '');
    throw aiFailure(reason, host && host !== bare ? 'hôte ' + host : 'aucune réponse de ' + bare);
  } finally {
    clearTimeout(timer);
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw aiFailure('provider', 'Réponse non JSON du Worker.');
  }
  if (!res.ok) {
    const reason = typeof payload?.reason === 'string' ? payload.reason : res.status === 429 ? 'rate_limited' : 'provider';
    throw aiFailure(reason, typeof payload?.error === 'string' ? payload.error : '', res.status === 429 ? 429 : 502);
  }

  const parsed = recipeSchema.safeParse(payload?.recipe);
  if (!parsed.success) throw aiFailure('incomplete', parsed.error.issues.map(i => i.path.join('.')).join(', '));
  return {
    recipe: parsed.data,
    provider: typeof payload?.provider === 'string' ? payload.provider : 'openrouter',
    model: typeof payload?.model === 'string' ? payload.model : '',
  };
}
