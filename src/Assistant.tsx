import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Check, CornerUpLeft, Sparkles, X } from 'lucide-react';
import { parseCommand, validateActions, type Action } from './atlas';
import { checkAvailability, getLayer } from './catalog';
import { isPages } from './edition';

const examples = ['Affiche les séismes de magnitude 5 au Japon', 'Masque les villes', 'Passe en mode nuit'];
const descriptions: Record<string, string> = { satellite: 'satellite', night: 'nuit', relief: 'relief', borders: 'frontières', population: 'population', gdp: 'PIB', hex: 'maillage hexagonal', moon: 'Lune', earth: 'Terre', heat: 'carte de chaleur', columns: 'colonnes', points: 'points', europe: 'Europe occidentale', atlantic: 'Manche orientale', japan: 'Japon', west: 'Côte est américaine' };
function describe(action: Action) {
  switch (action.type) {
    case 'layer': return `${action.enabled ? 'Afficher' : 'Masquer'} : ${getLayer(action.id).title}`;
    case 'focus': return `Centrer sur ${action.place}`;
    case 'grid': return `${action.value ? 'Afficher' : 'Masquer'} la grille`;
    case 'magnitude': return `Magnitude minimale : ${action.value.toLocaleString('fr-FR')}`;
    case 'period': return `Période : ${action.value} j`;
    case 'reset': return 'Rétablir les réglages initiaux';
    default: return `Sélectionner : ${descriptions[action.value] ?? action.value}`;
  }
}

type Message = { role: 'user' | 'assistant'; text: string; actions?: Action[]; applied?: boolean };
export function Assistant({ onClose, onApply, onUndo, canUndo }: { onClose: () => void; onApply: (actions: Action[]) => string | null; onUndo: () => void; canUndo: boolean }) {
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false), [allowAI, setAllowAI] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const log = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null), request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    field.current?.focus();
    if (!isPages) fetch('/api/config', { signal: controller.signal }).then(r => r.json()).then(config => setEnabled(config.assistant === true)).catch(() => {});
    return () => { controller.abort(); request.current?.abort(); };
  }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [busy, messages]);
  const send = async (value: string) => {
    const text = value.trim(); if (!text || busy) return;
    setInput(''); setMessages(old => [...old, { role: 'user', text }]);
    let actions = parseCommand(text, !getLayer('moon-landings').restriction);
    let reply = actions.length ? 'Voici les changements à appliquer.' : 'Je ne reconnais pas cette commande. Essaie « Affiche les nuages » ou « Centre sur Paris ».';
    if (!isPages && !actions.length && enabled && allowAI) {
      setBusy(true); request.current = new AbortController();
      try {
        const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }), signal: AbortSignal.any([request.current.signal, AbortSignal.timeout(18_000)]) });
        const result = await res.json();
        if (res.ok) {
          actions = validateActions(result.actions) ?? [];
          if (typeof result.message === 'string') reply = result.message;
        } else {
          reply = `${typeof result.error === 'string' ? result.error : 'Gemini est indisponible.'} Les commandes locales restent disponibles.`;
        }
      } catch { if (request.current.signal.aborted) return; reply = 'Gemini n’a pas répondu. Les commandes locales restent disponibles.'; }
      finally { if (!request.current.signal.aborted) setBusy(false); }
    }
    const restriction = checkAvailability(actions);
    if (restriction) { reply = `${restriction} Aucun changement proposé.`; actions = []; }
    setMessages(old => [...old, { role: 'assistant', text: reply, actions }]);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  return <section className="assistant pop-card" aria-labelledby="assistant-title">
    <header><span><Sparkles size={17} /> <strong id="assistant-title">Assistant de l’atlas</strong></span><button className="icon-button" aria-label="Fermer l’assistant" onClick={onClose}><X size={18} /></button></header>
    <div className="assistant-log" ref={log} role="log" aria-label="Messages de l’assistant" aria-live="polite">
      {!messages.length && <div className="assistant-intro"><small>COMMANDES DE LA CARTE</small><h2>Que veux-tu explorer ?</h2><p>Décris les couches ou le lieu à afficher. Tu choisis ensuite si tu veux appliquer les changements.</p><div>{examples.map(example => <button key={example} onClick={() => void send(example)}>{example}</button>)}</div></div>}
      {messages.map((message, i) => <div className={`message ${message.role}`} key={i}><p>{message.text}</p>
        {Boolean(message.actions?.length) && <><ul>{message.actions!.map((a, index) => <li key={index}>{describe(a)}</li>)}</ul><button className="apply" onClick={() => {
          const error = onApply(message.actions!);
          setMessages(old => error ? [...old, { role: 'assistant', text: error }] : old.map((entry, index) => i === index ? { ...entry, applied: true } : entry));
        }} disabled={message.applied}><Check size={15} />{message.applied ? 'Appliqué' : 'Appliquer sur le globe'}</button></>}
      </div>)}
      {busy && <p role="status">Interprétation en cours…</p>}
    </div>
    <div className="assistant-footer">
      {canUndo && <button className="undo" onClick={onUndo}><CornerUpLeft size={14} /> Annuler la dernière commande</button>}
      {enabled && <label className="opt-ai"><input type="checkbox" checked={allowAI} onChange={e => setAllowAI(e.target.checked)} /> Envoyer à Gemini si la commande n’est pas reconnue</label>}
      {isPages && <small className="opt-ai">Commandes locales uniquement · Gemini nécessite l’édition locale.</small>}
      <form onSubmit={submit} className="assistant-form"><input ref={field} maxLength={600} aria-label="Message à l’assistant" value={input} onChange={e => setInput(e.target.value)} placeholder="Ex. Affiche les nuages…" /><button type="submit" disabled={!input.trim() || busy} aria-label="Envoyer à l’assistant"><ArrowUp size={19} /></button></form>
    </div>
  </section>;
}
