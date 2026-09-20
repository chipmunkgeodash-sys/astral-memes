// The requested second wave of Astral features. These are deliberately small,
// useful surfaces rather than placeholder marketing cards.
export const ASTRAL_FEATURES = [
  ['Astral Guide chat', 'assistant'], ['Daily briefing', 'briefing'], ['Saved memories', 'memory'],
  ['Mood check-in', 'mood'], ['Idea generator', 'ideas'], ['Focus checklist', 'checklist'],
  ['Prompt packs', 'prompts'], ['Chat export', 'export'], ['Keyboard commands', 'commands'],
  ['Local privacy mode', 'privacy'], ['Quick links', 'links'], ['Activity digest', 'digest'],
  ['Post starters', 'starters'], ['Ride tips', 'ride-tips'], ['Studio shortcuts', 'studio-links'],
  ['Theme suggestions', 'themes'], ['Weekly goals', 'goals'], ['Crew icebreakers', 'icebreakers'],
  ['Decision helper', 'decision'], ['Notification quiet hours', 'quiet-hours'],
];

export const assistantReply = (input, { mood = 'curious' } = {}) => {
  const q = input.trim().toLowerCase();
  if (!q) return 'Tell me what you want to make, ride, plan, or find in Astral.';
  if (q === '/idea') return 'Idea spark: make a “before and after” post from a Hush Moto build, then turn the palette into a Studio banner.';
  if (q === '/ride') return 'Ride drill: three gentle S-turns, throttle steady, look through each corner, and use the rear brake only to settle the chassis.';
  if (/^(hi|hey|hello|yo)\b/.test(q)) return `Hey! I’m Astral Guide. I’m feeling ${mood} today. Ask for a ride tip, a Studio tool, or a quick plan.`;
  if (q.includes('hush') || q.includes('moto') || q.includes('turn') || q.includes('ride')) return 'For a smoother Hush Moto turn: ease off the throttle, countersteer briefly, then hold a light lean. Try Tag in Game modes for a focused practice lap.';
  if (q.includes('studio') || q.includes('meme') || q.includes('image')) return 'Open Studio for 50 browser-local tools. Meme maker, collage, crop, palette, Markdown preview, planners, patterns, and the beat sequencer are good starting points.';
  if (q.includes('post') || q.includes('caption')) return 'Post starter: “Tonight’s small win: ____.” Add one photo, one detail, and a question for the crew.';
  if (q.includes('plan') || q.includes('goal')) return 'Try a three-step plan: choose one outcome, block 25 minutes, then write the smallest next action. Save it in Studio → Private notebook.';
  if (q.includes('feature') || q.includes('what can')) return 'I can help with 20 new Astral shortcuts: briefings, memories, moods, ideas, checklists, prompts, exports, ride tips, goals, and more.';
  if (q.includes('privacy') || q.includes('private') || q.includes('data')) return 'Assistant chats and memories stay in this browser. Nothing is sent to an AI service by this local guide.';
  if (q.includes('help') || q.includes('command')) return 'Try /briefing, /idea, /ride, /studio, /plan, or /clear. You can also use the suggestion buttons below.';
  return `Here’s a useful next step: turn “${input.trim().slice(0, 70)}” into one small action, a time limit, and a way to tell when it’s done.`;
};
