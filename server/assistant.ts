import { layerIds, validateActions } from '../src/atlas.ts';
import { list, object } from '../src/parsers.ts';
import { download, UpstreamError } from './upstream.ts';

const instruction = `Tu interprètes des commandes cartographiques de TerraScope. Réponds exclusivement en JSON :
{"message":"phrase courte en français","actions":[]}. Pour une demande non cartographique ou ambiguë, renvoie actions vide.
De 0 à 8 actions autorisées (les formes séparées par | sont des choix, pas des valeurs littérales) :
- {"type":"layer","id": une des chaînes ${JSON.stringify(layerIds.filter(id => id !== 'cables'))},"enabled": booléen}
- {"type":"style","value": "satellite"|"night"|"relief"}, {"type":"countryMode","value": "borders"|"population"|"gdp"|"hex"}
- {"type":"body","value": "earth"|"moon"}, {"type":"focus","place": "nom du lieu"}, {"type":"reset"}
- {"type":"magnitude","value": nombre de 0 à 10}, {"type":"period","value": 1|7|30}, {"type":"grid","value": booléen}
- {"type":"populationMode","value": "heat"|"columns"}, {"type":"volcanoMode","value": "points"|"heat"}
- {"type":"region","value": "europe"|"atlantic"|"japan"|"west"} (trafic aérien seulement).
Ne prétends jamais avoir appliqué les actions ou que centrer la caméra filtre géographiquement les données. Ne promets aucune donnée non disponible. N’ajoute pas de champs.`;

const defaultModel = 'gemini-3.1-flash-lite';
// Gemini constrains the output format; validateActions still checks the semantics of every action.
const responseJsonSchema = {
  type: 'object', required: ['message', 'actions'], additionalProperties: false,
  properties: {
    message: { type: 'string' },
    actions: { type: 'array', maxItems: 8, items: {
      type: 'object', required: ['type'], additionalProperties: false,
      properties: {
        type: { type: 'string' }, id: { type: 'string' }, enabled: { type: 'boolean' }, place: { type: 'string' },
        value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
      },
    } },
  },
};
const invalid = { status: 502, body: { error: 'Proposition Gemini invalide, aucun changement appliqué.' } };

export function assistant(env: Record<string, string>, request: typeof fetch, now: () => number) {
  const key = env.GEMINI_API_KEY?.trim(), model = (env.GEMINI_MODEL?.trim() || defaultModel).replace(/^models\//, '');
  const enabled = Boolean(key);
  let times: number[] = [], blockedUntil = 0, busy = false;
  async function ask(message: string) {
    if (!key) return { status: 503, body: { error: 'Gemini non configuré.' } };
    const time = now();
    times = times.filter(t => time - t < 86_400_000);
    if (busy || time < blockedUntil || times.length >= 30 || times.filter(t => time - t < 60_000).length >= 6) {
      return { status: 429, body: { error: 'Limite de requêtes de l’assistant atteinte.' } };
    }
    times.push(time); busy = true;
    try {
      if (!/^[a-z\d][a-z\d.-]{0,99}$/i.test(model)) return { status: 502, body: { error: 'Modèle Gemini mal configuré.' } };
      const json = object(JSON.parse(await download(request, `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, signal: AbortSignal.timeout(14_000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema, maxOutputTokens: 1536 } }),
      }, 64_000)));
      const candidate = object(list(json.candidates)[0]);
      const finish = typeof candidate.finishReason === 'string' ? candidate.finishReason : '';
      if (object(json.promptFeedback).blockReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finish)) {
        return { status: 200, body: { message: 'Gemini n’a pas pu traiter cette demande. Essaie de la reformuler en commande cartographique.', actions: [] } };
      }
      if (finish !== 'STOP') return invalid;
      const output = list(object(candidate.content).parts).map(object)
        .map(part => part.thought !== true && typeof part.text === 'string' ? part.text : '').join('');
      let answer: Record<string, unknown>;
      try { answer = object(JSON.parse(output)); } catch { return invalid; }
      const actions = validateActions(answer.actions);
      if (Object.keys(answer).length !== 2 || !actions || typeof answer.message !== 'string' || !answer.message.trim() || answer.message.length > 320) return invalid;
      return { status: 200, body: { message: answer.message.trim(), actions } };
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 429) {
        blockedUntil = now() + Math.max(60_000, error.retryAfter ?? 0);
        return { status: 429, body: { error: 'Le quota Gemini est atteint. Réessaie plus tard.' } };
      }
      if (error instanceof UpstreamError && [400, 401, 403, 404].includes(error.status)) {
        return { status: 502, body: { error: 'Gemini a rejeté la requête. Vérifie la clé, les accès au projet et le modèle configuré.' } };
      }
      return { status: 502, body: { error: 'Gemini est indisponible pour le moment.' } };
    } finally { busy = false; }
  }
  return { enabled, ask };
}
