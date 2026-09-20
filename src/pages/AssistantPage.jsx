import { useMemo, useState } from 'react';
import { Bot, Brain, Check, Download, Lightbulb, Lock, MessageCircle, RotateCcw, Sparkles, Bike, WandSparkles } from 'lucide-react';
import { PageHead, Field, SectionHead } from '../components/ui';
import { useLocal } from '../lib/local';
import { useSession } from '../lib/session';
import { ASTRAL_FEATURES, assistantReply } from '../lib/feature-pack';

const KEY = 'astral-guide-chat';
const suggestions = ['Give me a ride tip', 'What can Studio do?', 'Help me plan tonight', 'Write a post starter'];
const stamp = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function AssistantPage({ router }) {
  const { profile, user } = useSession();
  const scope = user?.uid || 'guest';
  const [messages, setMessages] = useLocal(`${KEY}:${scope}`, [{ role: 'assistant', text: 'I’m Astral Guide — a private local assistant for your Astral workspace. What are you making today?', time: stamp() }]);
  const [input, setInput] = useState('');
  const [mood, setMood] = useLocal(`${KEY}-mood:${scope}`, 'curious');
  const [memory, setMemory] = useLocal(`${KEY}-memory:${scope}`, '');
  const [tasks, setTasks] = useLocal(`${KEY}-tasks:${scope}`, []);

  const send = (value = input) => {
    const text = value.trim(); if (!text) return;
    const isCommand = text.startsWith('/');
    const command = text.slice(1).toLowerCase();
    let reply = assistantReply(text, { mood });
    if (command === 'briefing') reply = `Daily briefing: ${new Date().toLocaleDateString()} · mood ${mood} · ${tasks.filter(Boolean).length} saved tasks · Studio and Hush Moto are ready.`;
    if (command === 'idea') reply = 'Idea spark: make a “before and after” post from a Hush Moto build, then turn the palette into a Studio banner.';
    if (command === 'ride') reply = 'Ride drill: three gentle S-turns, throttle steady, look through each corner, and use the rear brake only to settle the chassis.';
    if (command === 'studio') reply = 'Studio shortcuts: /studio opens the 50-tool catalog; use Meme maker, Gradient builder, Private notebook, or Beat sequencer.';
    if (command === 'plan') reply = 'Plan: 1) pick one result, 2) set a 25-minute timer, 3) save the next action in your checklist.';
    if (command === 'clear') { setMessages([]); setInput(''); return; }
    setMessages((old) => [...old, { role: 'user', text, time: stamp() }, { role: 'assistant', text: reply, time: stamp() }].slice(-30));
    setInput('');
  };
  const exportChat = () => {
    const blob = new Blob([messages.map((m) => `${m.role === 'user' ? 'You' : 'Astral Guide'} · ${m.text}`).join('\n\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'astral-guide-chat.txt'; a.click(); URL.revokeObjectURL(a.href);
  };
  const addTask = () => setTasks((old) => [...old, `Next action · ${new Date().toLocaleDateString()}`].slice(-8));
  const featureGroups = useMemo(() => ASTRAL_FEATURES.reduce((m, [name, id]) => { (m[id[0]] ||= []).push(name); return m; }, {}), []);

  return <div className="stack assistant-page">
    <PageHead eyebrow="Astral intelligence, kept local" title="Astral Guide" actions={<span className="chip chip-accent"><Lock size={13} /> Private in this browser</span>} />
    <div className="assistant-grid">
      <section className="card assistant-chat">
        <div className="assistant-head"><span className="assistant-orb"><Bot size={20} /></span><div><strong>AI-style workspace guide</strong><small>Fast answers, no external API required</small></div><button className="btn btn-sm" onClick={() => setMessages([])}><RotateCcw size={13} /> Clear</button></div>
        <div className="assistant-messages" aria-live="polite">{messages.map((m, i) => <div className={`assistant-message ${m.role}`} key={`${i}-${m.time}`}><span>{m.role === 'assistant' ? <Sparkles size={13} /> : <MessageCircle size={13} />}</span><p>{m.text}<small>{m.time}</small></p></div>)}</div>
        <div className="assistant-suggestions">{suggestions.map((s) => <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>)}</div>
        <form className="assistant-compose" onSubmit={(e) => { e.preventDefault(); send(); }}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Astral Guide… try /briefing" aria-label="Message Astral Guide" maxLength={500} /><button className="btn btn-primary"><WandSparkles size={15} /> Send</button></form>
      </section>
      <aside className="stack assistant-side">
        <section className="card"><SectionHead title="Your workspace" /><Field label="Current mood"><select value={mood} onChange={(e) => setMood(e.target.value)}><option>curious</option><option>focused</option><option>energized</option><option>chill</option></select></Field><Field label="One saved memory"><textarea value={memory} onChange={(e) => setMemory(e.target.value)} maxLength={240} rows={3} placeholder="A preference Guide should remember…" /></Field><div className="wrap"><button className="btn btn-sm" onClick={addTask}><Check size={13} /> Add next action</button><button className="btn btn-sm" onClick={exportChat}><Download size={13} /> Export chat</button></div></section>
        <section className="card"><SectionHead title="Quick launch" /><div className="wrap"><button className="btn" onClick={() => router.navigate('/studio')}><Lightbulb size={14} /> Open Studio</button><button className="btn" onClick={() => router.navigate('/hush-moto')}><Bike size={14} /> Ride Hush Moto</button></div>{tasks.length > 0 && <ul className="assistant-tasks">{tasks.map((task, i) => <li key={`${task}-${i}`}>{task}</li>)}</ul>}</section>
      </aside>
    </div>
    <section className="card"><SectionHead title="20 new Astral features" /><p className="muted">Every item below is wired into the Guide or an existing Astral route. Local-first tools keep drafts on this device.</p><div className="assistant-features">{Object.values(featureGroups).flat().map((feature) => <span className="chip" key={feature}><Sparkles size={12} /> {feature}</span>)}</div></section>
  </div>;
}
