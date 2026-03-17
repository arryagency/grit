require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/chat — SSE streaming response
app.post('/api/chat', async (req, res) => {
  const { messages, workoutHistory } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Inject workout history into system prompt if provided
  let systemPrompt = SYSTEM_PROMPT;
  if (workoutHistory && Array.isArray(workoutHistory) && workoutHistory.length > 0) {
    const historyText = workoutHistory.slice(0, 10).map((session) => {
      const date = new Date(session.date).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      });
      const exercises = session.exercises.map((ex) => {
        const sets = ex.sets
          .filter((s) => s.completed)
          .map((s) => `${s.weight}kg x${s.reps}`)
          .join(', ');
        return `  - ${ex.name}: ${sets}`;
      }).join('\n');
      const duration = session.duration ? ` (${session.duration} min)` : '';
      return `${date}${duration}:\n${exercises}`;
    }).join('\n\n');

    systemPrompt += `\n\n---\n\n## USER'S RECENT TRAINING HISTORY (last ${Math.min(workoutHistory.length, 10)} sessions)\n\nUse this data to give personalised, specific advice. Reference actual weights and reps in your responses.\n\n${historyText}`;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });

    await stream.finalMessage();

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/parse-log — Claude fallback for natural-language set parsing
app.post('/api/parse-log', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You parse workout log text into structured JSON. Return ONLY a valid JSON array, no explanation, no markdown.

Extract exercise name, weight in kg, reps, and sets. Use these exact exercise names:
Bench Press, Barbell Back Squat, Conventional Deadlift, Romanian Deadlift, Overhead Press,
Barbell Row, Pull-Up, Chin-Up, Incline Bench Press, Decline Bench Press, Push Press, Dips,
Hip Thrust, Bulgarian Split Squat, Leg Press, Hack Squat, Bicep Curl, Hammer Curl,
Preacher Curl, Tricep Pushdown, Skull Crusher, Lateral Raise, Lat Pulldown, Seated Cable Row,
Face Pull, Leg Curl, Leg Extension, Calf Raise, Shrug, Arnold Press, Sumo Deadlift

Output format: [{"exerciseName":"...","weight":0,"reps":0,"sets":1}]
If text contains multiple sets (e.g. "then"), return multiple objects.
If you cannot determine weight or reps, return [].`,
      messages: [{ role: 'user', content: text }],
    });

    const raw = response.content[0].text.trim();
    const parsed = JSON.parse(raw);
    res.json({ results: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    console.error('parse-log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'GRIT' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GRIT backend running on http://localhost:${PORT}`);
});
