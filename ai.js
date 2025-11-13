// ai.js - Modular AI client for Kisah Sukses Pro
// Features:
// - askAI(prompt, opts) => uses /api/ai proxy by default
// - streaming support via onChunk callback (simulated if server doesn't stream)
// - local fallback (rule-based) when proxy is unavailable
// - session memory + simple cache (localStorage when in browser)
// - helpers: summarizeText, analyzeCode, suggestMotivation
(function(global){
  const isBrowser = typeof window !== 'undefined' && typeof window.fetch === 'function';

  // Simple in-memory cache (and localStorage-backed in browser)
  const cache = new Map();
  function cacheSet(key, value, ttl = 300000) { // default 5min
    const item = { value, expire: Date.now() + ttl };
    cache.set(key, item);
    if (isBrowser && window.localStorage) {
      try { localStorage.setItem('ai_cache_' + key, JSON.stringify(item)); } catch(e){}
    }
  }
  function cacheGet(key) {
    const got = cache.get(key);
    if (got && got.expire > Date.now()) return got.value;
    if (isBrowser && window.localStorage) {
      try {
        const raw = localStorage.getItem('ai_cache_' + key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.expire > Date.now()) {
            cache.set(key, parsed);
            return parsed.value;
          } else {
            localStorage.removeItem('ai_cache_' + key);
          }
        }
      } catch(e){}
    }
    return null;
  }

  // Simple session memory store (not persistent beyond page reload unless browser localStorage)
  const sessions = new Map();
  function getSession(id = 'default') {
    if (!sessions.has(id)) sessions.set(id, { history: [] });
    return sessions.get(id);
  }
  function pushSession(id, role, text) {
    const s = getSession(id);
    s.history.push({ role, text, ts: Date.now() });
    // keep last 20 messages
    if (s.history.length > 20) s.history = s.history.slice(-20);
  }

  // Local lightweight rule-based fallback (useful offline or during API outage)
  function localRuleEngine(prompt) {
    const p = (prompt || '').toLowerCase().trim();
    if (!p) return "Maaf, saya tidak menerima input. Bisa ketik pertanyaanmu?";
    if (p.includes('halo') || p.includes('hai') || p.includes('hello')) {
      return "Halo! Saya Kisah Sukses Pro — bagaimana saya bisa bantu hari ini?";
    }
    if (p.includes('bantu') || p.includes('tolong')) {
      return "Tentu — jelaskan masalah atau pertanyaanmu secara singkat, lalu saya akan bantu.";
    }
    if (p.startsWith('ringkas:') || p.startsWith('summarize:') || p.includes('ringkasan')) {
      const t = prompt.split(':').slice(1).join(':').trim();
      if (!t) return "Berikan teks setelah kata 'ringkas:' untuk saya ringkas.";
      // Very simple summarizer: return first 2 sentences
      const sentences = t.match(/[^\.!\?]+[\.!\?]+/g) || [t];
      return sentences.slice(0,2).join(' ').trim();
    }
    if (p.includes('motivasi') || p.includes('inspirasi') || p.includes('kisah sukses')) {
      return "Setiap langkah kecil adalah bagian dari perjalanan besar. Fokuslah pada konsistensi — bukan hanya pada hasil instan.";
    }
    if (p.includes('kode') || p.includes('bug') || p.includes('debug')) {
      return "Berikan potongan kode atau deskripsikan error yang muncul, saya akan bantu analisis dan usulkan perbaikan.";
    }
    // Default fallback: echo with friendly suggestion
    return "Maaf, saya belum bisa menjawab itu secara offline. Coba jelaskan dengan kata-kata yang lebih spesifik atau nyalakan koneksi internet untuk jawaban lebih lengkap.";
  }

  // askAI: primary entry point
  async function askAI(prompt, opts = {}) {
    const sessionId = opts.sessionId || 'default';
    const cacheKey = 'ai:' + (opts.prefix || '') + '|' + prompt + '|' + (opts.max_tokens || 400);
    const cached = cacheGet(cacheKey);
    if (cached && !opts.force) return cached;

    // Try server proxy first
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          max_tokens: opts.max_tokens || 400,
          temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.6,
          sessionId
        })
      });
      if (res.ok) {
        const j = await res.json();
        const text = j.text || (j.choices && j.choices[0] && (j.choices[0].text || j.choices[0].message && j.choices[0].message.content)) || JSON.stringify(j);
        cacheSet(cacheKey, text, opts.ttl || 300000);
        pushSession(sessionId, 'assistant', text);
        return text;
      } else {
        // If server returns error, try fallback
        console.warn('AI proxy error', res.status, await res.text());
      }
    } catch (err) {
      console.warn('AI proxy unreachable, using local fallback:', err && err.message);
    }

    // Local fallback
    const local = localRuleEngine(prompt);
    cacheSet(cacheKey, local, 60000);
    pushSession(sessionId, 'assistant', local);
    return local;
  }

  // Streaming helper: calls /api/ai/stream if available, else simulates by chunking
  async function askAIStream(prompt, onChunk, opts = {}) {
    const sessionId = opts.sessionId || 'default';
    // Try SSE endpoint
    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max_tokens: opts.max_tokens || 400, temperature: opts.temperature || 0.6, sessionId })
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false, acc = '';
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            acc += chunk;
            onChunk(chunk);
          }
        }
        // store final
        pushSession(sessionId, 'assistant', acc);
        return acc;
      }
    } catch (e) {
      console.warn('Streaming not available, will simulate streaming.', e && e.message);
    }
    // Simulate streaming from full answer
    const full = await askAI(prompt, opts);
    const parts = full.match(/.{1,80}/g) || [full];
    for (const p of parts) {
      onChunk(p);
      // small pause to mimic streaming
      await new Promise(r => setTimeout(r, 40));
    }
    return full;
  }

  // Helpers
  async function summarizeText(text, opts = {}) {
    const prompt = `Ringkas teks berikut menjadi 3-4 kalimat jelas dan langsung:\n\n${text}`;
    return askAI(prompt, { ...opts, prefix: 'summarize' });
  }

  async function analyzeCode(code, opts = {}) {
    const prompt = `Analisa potongan kode berikut. Sebutkan masalah potensial, bug, dan rekomendasi perbaikan secara singkat:\n\n${code}`;
    return askAI(prompt, { ...opts, prefix: 'analyze' });
  }

  async function suggestMotivation(context, opts = {}) {
    const prompt = `Buat pesan motivasi singkat (2-3 kalimat) yang relevan dengan konteks berikut:\n\n${context}`;
    return askAI(prompt, { ...opts, prefix: 'motivate' });
  }

  // Expose API
  global.KSPai = {
    askAI,
    askAIStream,
    summarizeText,
    analyzeCode,
    suggestMotivation,
    getSession,
    pushSession
  };

})(typeof window !== 'undefined' ? window : global);