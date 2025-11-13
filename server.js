/*
Enhanced secure AI proxy server (updated for local fallback)
- POST /api/ai        -> JSON response { text: "..." }
- POST /api/ai/stream -> SSE stream (if OpenAI streaming available) or proxied stream
Security: supports API_KEY (x-api-key) or BASIC_AUTH_USER/PASS
*/
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const basicAuth = require('basic-auth');

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const API_KEY = process.env.API_KEY || '';
const BASIC_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_PASS = process.env.BASIC_AUTH_PASS || '';

const limiter = rateLimit({ windowMs: 60*1000, max: 60 });
app.use(limiter);

// Simple auth middleware
function checkAuth(req, res, next) {
  // check x-api-key
  const xkey = req.header('x-api-key');
  if (API_KEY && xkey && xkey === API_KEY) return next();
  // basic auth
  if (BASIC_USER && BASIC_PASS) {
    const user = basicAuth(req);
    if (user && user.name === BASIC_USER && user.pass === BASIC_PASS) return next();
  }
  // if no auth configured, allow local
  if (!API_KEY && !BASIC_USER) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use(checkAuth);

// very small local rule-based fallback (same ideas as client localRuleEngine)
function localRuleEngine(prompt) {
  const p = (prompt || '').toLowerCase().trim();
  if (!p) return "Maaf, saya tidak menerima input. Bisa ketik pertanyaanmu?";
  if (p.includes('halo') || p.includes('hai') || p.includes('hello')) {
    return "Halo! Saya Kisah Sukses Pro — bagaimana saya bisa bantu hari ini?";
  }
  if (p.includes('ringkas:') || p.includes('ringkasan') || p.includes('summarize')) {
    const t = prompt.split(':').slice(1).join(':').trim();
    const sentences = t.match(/[^\.!\?]+[\.!\?]+/g) || [t];
    return sentences.slice(0,2).join(' ').trim();
  }
  if (p.includes('motivasi') || p.includes('inspirasi') || p.includes('kisah sukses')) {
    return "Setiap langkah kecil adalah bagian dari perjalanan besar. Fokuslah pada konsistensi — bukan hanya pada hasil instan.";
  }
  return null;
}

// POST /api/ai
app.post('/api/ai', async (req, res) => {
  const { prompt, max_tokens = 400, temperature = 0.6, sessionId } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  // If OPENAI_API_KEY available, proxy to OpenAI ChatCompletions (chat format)
  if (OPENAI_API_KEY) {
    try {
      const body = {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens,
        temperature
      };
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const txt = await r.text();
        console.error('OpenAI error', r.status, txt);
        return res.status(502).json({ error: 'OpenAI error', detail: txt });
      }
      const j = await r.json();
      const text = j.choices && j.choices[0] && (j.choices[0].message && j.choices[0].message.content) || j.choices && j.choices[0] && j.choices[0].text || JSON.stringify(j);
      return res.json({ text, raw: j });
    } catch (err) {
      console.error('Proxy to OpenAI failed', err);
      return res.status(500).json({ error: 'Proxy failed', detail: err.message });
    }
  }

  // Fallback local rule engine
  const local = localRuleEngine(prompt);
  if (local) return res.json({ text: local, local: true });

  // If no openai key and no local answer, give default guidance
  return res.json({ text: "AI offline: tidak ada API key terkonfigurasi. Hubungkan OPENAI_API_KEY pada environment untuk jawaban lebih komprehensif." });
});

// POST /api/ai/stream -> try to create streaming connection to OpenAI, else fallback to SSE simulated
app.post('/api/ai/stream', async (req, res) => {
  const { prompt, max_tokens = 400, temperature = 0.6 } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  if (OPENAI_API_KEY) {
    // Proxy streaming using OpenAI streaming API (if model supports)
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens,
          temperature,
          stream: true
        })
      });

      if (!openaiRes.ok) {
        const txt = await openaiRes.text();
        console.error('OpenAI stream error', openaiRes.status, txt);
        return res.status(502).json({ error: 'OpenAI stream error' });
      }

      // Pipe streaming response through as text/event-stream (SSE)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = openaiRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // OpenAI sends chunks with "data: ..." lines; forward them
        res.write(chunk);
      }
      res.write('\n\n');
      return res.end();
    } catch (err) {
      console.error('Streaming proxy failed', err);
      return res.status(500).json({ error: 'streaming proxy failed' });
    }
  }

  // Fallback: simple SSE simulation from local engine
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const local = localRuleEngine(prompt) || "AI offline: tidak ada API key terkonfigurasi.";
  // split into chunks
  const parts = local.match(/.{1,60}/g) || [local];
  for (const p of parts) {
    res.write(`data: ${p}\n\n`);
    await new Promise(r => setTimeout(r, 60));
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('/health', (req, res) => res.json({ ok: true, openai: !!OPENAI_API_KEY }));

app.listen(PORT, () => console.log(`✅ AI proxy server running at http://localhost:${PORT}`));
