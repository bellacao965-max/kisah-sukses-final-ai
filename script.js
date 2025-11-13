/* script.js - Advanced features:
 - Optional Firebase sync (place firebase-config.js with `const FIREBASE_CONFIG = {...}` to enable)
 - Edit / Delete / Export / Import
 - Image attachment (dataURL, size limited)
 - Simple Markdown rendering (safe)
 - Pagination, tags, per-page control
 - Service worker registration already in index.html
*/

/* Utilities */
function uid(prefix='i'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function now(){ return Date.now(); }
function safeParse(json){ try{return JSON.parse(json);}catch(e){return null;} }
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* Tiny markdown (very small): **bold**, *italic*, [text](url) */
function renderMarkdown(md){
  if(!md) return '';
  // escape first
  let s = escapeHtml(md);
  // simple replacements
  s = s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g,'<em>$1</em>');
  s = s.replace(/\[(.*?)\]\((https?:\/\/[^\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // paragraphs
  s = s.replace(/\n\n+/g,'</p><p>');
  return '<p>'+s.replace(/\n/g,'<br>')+'</p>';
}

/* Storage layer with optional Firebase (if FIREBASE_CONFIG is present) */
const Storage = (function(){
  const KEY = 'kisah_sukses_v2';
  function loadLocal(){ return safeParse(localStorage.getItem(KEY)) || []; }
  function saveLocal(items){ try{ localStorage.setItem(KEY, JSON.stringify(items)); return true;}catch(e){console.warn(e); return false;} }

  // Firebase sync stubs (will be active if firebase-config.js defines FIREBASE_CONFIG)
  let useFirebase = false;
  try {
    if (typeof FIREBASE_CONFIG !== 'undefined') useFirebase = true;
  } catch(e){ useFirebase = false; }

  async function syncToRemote(items){ 
    if(!useFirebase) return false;
    // Placeholder: actual sync code requires firebase SDK (user should include it)
    return true;
  }

  return { loadLocal, saveLocal, syncToRemote, useFirebase };
})();

/* App logic */
const App = (function(){
  const dom = {
    form: document.getElementById('story-form'),
    title: document.getElementById('title'),
    author: document.getElementById('author'),
    content: document.getElementById('content'),
    tags: document.getElementById('tags'),
    image: document.getElementById('image'),
    editingId: document.getElementById('editing-id'),
    feedback: document.getElementById('form-feedback'),
    stories: document.getElementById('stories'),
    mediaUrl: document.getElementById('media-url'),
    ytQuery: document.getElementById('yt-query'),
    ytSearchBtn: document.getElementById('yt-search-btn'),
    ytResults: document.getElementById('yt-results'),
    ytNote: document.getElementById('yt-note'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    favoritesOnly: document.getElementById('favoritesOnly'),
    clearBtn: document.getElementById('clear-btn'),
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    perPage: document.getElementById('perPage'),
    pagination: document.getElementById('pagination'),
    signinBtn: document.getElementById('signin-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn')
  };

  let items = Storage.loadLocal();
  let page = 1;

  function showFeedback(msg, isError=false){
    dom.feedback.textContent = msg;
    dom.feedback.style.color = isError ? 'crimson' : '';
    setTimeout(()=>{ if(dom.feedback.textContent === msg) dom.feedback.textContent = ''; }, 4000);
  }

  function bytesToHuman(bytes){
    if(bytes < 1024) return bytes+' B';
    if(bytes < 1024*1024) return (bytes/1024).toFixed(1)+' KB';
    return (bytes/(1024*1024)).toFixed(1)+' MB';
  }

  function readImageFile(file, maxBytes=150*1024){
    return new Promise((res, rej)=>{
      if(!file) return res(null);
      if(file.size > maxBytes) return rej(new Error('File terlalu besar (maks '+bytesToHuman(maxBytes)+')'));
      const reader = new FileReader();
      reader.onload = ()=> res(reader.result);
      reader.onerror = ()=> rej(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
  }

  function saveItems(){
    Storage.saveLocal(items);
    if(Storage.useFirebase) Storage.syncToRemote(items);
  }

  function addOrUpdate(data){
    if(data.id){
      const idx = items.findIndex(i=> i.id === data.id);
      if(idx !== -1){ items[idx] = Object.assign({}, items[idx], data); }
    } else {
      data.id = uid('s_'); data.createdAt = now(); data.favorite = false;
      items.push(data);
    }
    saveItems();
    showFeedback('Kisah tersimpan.');
    dom.form.reset();
    dom.editingId.value = '';
    dom.cancelEditBtn.style.display = 'none';
    render();
  }

  function deleteItem(id){
    if(!confirm('Hapus kisah ini?')) return;
    items = items.filter(i=> i.id !== id);
    saveItems(); render();
  }

  function editItem(id){
    const it = items.find(i=> i.id === id); if(!it) return;
    dom.title.value = it.title; dom.author.value = it.author || ''; dom.content.value = it.content || '';
    dom.tags.value = (it.tags || []).join(', ');
    if(dom.mediaUrl) dom.mediaUrl.value = it.mediaUrl || '';
    dom.editingId.value = it.id; dom.cancelEditBtn.style.display = 'inline-block';
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function toggleFavorite(id){
    const it = items.find(i=> i.id === id); if(!it) return;
    it.favorite = !it.favorite; saveItems(); render();
  }

  function importJson(file){
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(Array.isArray(data)){
          // merge by id
          for(const d of data){
            if(!d.id) d.id = uid('imp_');
            if(!items.some(i=> i.id === d.id)) items.push(d);
          }
          saveItems(); render(); showFeedback('Impor selesai.');
        } else showFeedback('File tidak valid.', true);
      }catch(e){ showFeedback('Gagal membaca file: '+e.message, true); }
    };
    reader.readAsText(file);
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(items, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'kisah-sukses-export.json'; a.click();
    URL.revokeObjectURL(url);
  }


  // --- Media rendering helpers ---
  function extractYouTubeId(url){
    if(!url) return null;
    try{
      const u = new URL(url);
      if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
      if(u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    }catch(e){ return null; }
    return null;
  }

  function renderMediaForItem(item){
    if(!item) return '';
    // images are stored in item.image (dataURL)
    let html = '';
    if(item.image) html += '<img loading="lazy" src="'+item.image+'" class="thumb" alt="Gambar kisah">';
    if(item.mediaUrl){
      const yid = extractYouTubeId(item.mediaUrl);
      if(yid){
        // show thumbnail and a play button; embed iframe when clicked
        const thumb = 'https://img.youtube.com/vi/'+yid+'/hqdefault.jpg';
        html += '<div class="yt-embed" data-ytid="'+yid+'">';
        html += '<img loading="lazy" src="'+thumb+'" alt="YouTube thumbnail" style="width:100%;border-radius:8px;">';
        html += '<button class="btn-icon play-yt" data-ytid="'+yid+'" aria-label="Putar video">▶</button>';
        html += '</div>';
      } else {
        // generic link
        html += '<div class="media-link"><a href="'+escapeHtml(item.mediaUrl)+'" target="_blank" rel="noopener noreferrer">Lihat media</a></div>';
      }
    }
    return html;
  }

  // YouTube search (requires YOUTUBE_API_KEY in youtube-config.js)
  async function searchYouTube(query){
    if(!query) return [];
    let apiKey = null;
    try{ apiKey = (typeof YOUTUBE_API_KEY !== 'undefined') ? YOUTUBE_API_KEY : null; }catch(e){ apiKey = null; }
    if(!apiKey){ dom.ytNote.textContent = 'YouTube API belum diaktifkan. Masukkan URL video di form untuk menambahkan.'; return []; }
    const q = encodeURIComponent(query);
    const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q='+q+'&key='+apiKey;
    try{
      const res = await fetch(url);
      if(!res.ok) throw new Error('Gagal memanggil YouTube API');
      const data = await res.json();
      return data.items || [];
    }catch(e){
      dom.ytNote.textContent = 'Terjadi kesalahan saat mencari YouTube: '+e.message;
      return [];
    }
  }

  function render(){
    const q = dom.search.value.trim().toLowerCase();
    const sortBy = dom.sort.value;
    const favOnly = dom.favoritesOnly.checked;
    const perPage = parseInt(dom.perPage.value,10) || 10;

    let list = items.slice();
    if(q) list = list.filter(i => (i.title+' '+(i.tags||[]).join(' ')+' '+i.content+' '+(i.author||'')).toLowerCase().includes(q));
    if(favOnly) list = list.filter(i => i.favorite);

    if(sortBy === 'newest') list.sort((a,b)=> b.createdAt - a.createdAt);
    else if(sortBy === 'oldest') list.sort((a,b)=> a.createdAt - b.createdAt);
    else if(sortBy === 'title') list.sort((a,b)=> a.title.localeCompare(b.title));

    // pagination
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    if(page > pages) page = pages;
    const start = (page-1)*perPage;
    const pageItems = list.slice(start, start+perPage);

    dom.stories.innerHTML = '';
    if(pageItems.length === 0){
      dom.stories.innerHTML = '<div class="empty">Tidak ada kisah ditemukan.</div>';
    } else {
      for(const item of pageItems){
        const el = document.createElement('article'); el.className = 'story'; el.tabIndex = 0;
        const tagsHtml = (item.tags||[]).map(t=>'<span class="tag">#'+escapeHtml(t.trim())+'</span>').join(' ');
        const mediaHtml = renderMediaForItem(item);
        const date = new Date(item.createdAt).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'});
        const thumb = '';
        const md = renderMarkdown(item.content);
        el.innerHTML = `
          ${thumb}
          <h3>${escapeHtml(item.title)}</h3>
          <div class="meta"><div>oleh ${escapeHtml(item.author||'Anonim')} • ${date}</div>
            <div>
              <button class="btn-icon fav" data-id="${item.id}" aria-label="${item.favorite? 'Hapus favorit':'Tambahkan favorit'}">${item.favorite? '★':'☆'}</button>
              <button class="btn-icon edit" data-id="${item.id}" aria-label="Edit">✎</button>
              <button class="btn-icon del" data-id="${item.id}" aria-label="Hapus">🗑</button>
            </div>
          </div>
          <div class="media-container">${mediaHtml}</div>
          <div class="content">${md}</div>
          <div class="tags">${tagsHtml}</div>
        `;
        dom.stories.appendChild(el);
      }
    }

    // pagination UI
    if(pages > 1){
      dom.pagination.style.display = 'flex'; dom.pagination.innerHTML = '';
      for(let p=1;p<=pages;p++){
        const b = document.createElement('button'); b.className = 'page-btn'; b.textContent = p; if(p===page) b.disabled = true;
        b.addEventListener('click', ()=>{ page = p; render(); });
        dom.pagination.appendChild(b);
      }
    } else dom.pagination.style.display = 'none';

    // add listeners
    dom.stories.querySelectorAll('.fav').forEach(btn=> btn.addEventListener('click', e=> toggleFavorite(e.currentTarget.dataset.id) ));
    dom.stories.querySelectorAll('.del').forEach(btn=> btn.addEventListener('click', e=> deleteItem(e.currentTarget.dataset.id) ));
    dom.stories.querySelectorAll('.edit').forEach(btn=> btn.addEventListener('click', e=> editItem(e.currentTarget.dataset.id) ));
  }

  // events
  dom.form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const title = dom.title.value.trim(); const content = dom.content.value.trim();
    if(!title || !content){ showFeedback('Judul dan isi wajib diisi.', true); return; }
    const tags = dom.tags.value.split(',').map(t=>t.trim()).filter(Boolean);
    let imageData = null;
    if(dom.image.files && dom.image.files[0]){
      try{ imageData = await readImageFile(dom.image.files[0]); } catch(err){ showFeedback(err.message, true); return; }
    }
    const data = { title, author: dom.author.value.trim(), content, tags, image: imageData, mediaUrl: dom.mediaUrl ? dom.mediaUrl.value.trim() : '' };
    const editingId = dom.editingId.value;
    if(editingId) data.id = editingId;
    addOrUpdate(data);
  });

  dom.cancelEditBtn.addEventListener('click', ()=>{ dom.form.reset(); dom.editingId.value=''; dom.cancelEditBtn.style.display='none'; });

  dom.search.addEventListener('input', ()=>{ page=1; render(); });
  dom.sort.addEventListener('change', ()=>{ render(); });
  dom.favoritesOnly.addEventListener('change', ()=>{ render(); });
  dom.clearBtn.addEventListener('click', ()=>{ if(confirm('Hapus semua kisah?')){ items=[]; saveItems(); render(); } });
  dom.exportBtn.addEventListener('click', exportJson);
  dom.importBtn.addEventListener('click', ()=> dom.importFile.click() );
  dom.importFile.addEventListener('change', (e)=>{ if(e.target.files[0]) importJson(e.target.files[0]); e.target.value=''; });
  dom.perPage.addEventListener('change', ()=>{ page=1; render(); });

  // simple sign-in stub (for future firebase integration)
  dom.signinBtn.addEventListener('click', ()=>{
    if(!Storage.useFirebase){ alert('Integrasi Firebase belum diaktifkan. Untuk sinkronisasi, tambahkan file firebase-config.js sesuai instruksi.'); return; }
    // real sign in flow would go here
    alert('Menjalankan flow sign-in (placeholder).');
  });

  // initial render
  render();

  return { render, getItems: ()=> items };
})();

// Expose for debugging/testing
window.App = App;


// --- AI chat UI hookup (added) ---
document.addEventListener('DOMContentLoaded', function() {
  const chatArea = document.getElementById('ai-chat-area');
  const aiForm = document.getElementById('ai-form');
  const aiInput = document.getElementById('ai-input');
  if (chatArea && aiForm && aiInput && window.ai && window.ai.askAI) {
    aiForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const prompt = aiInput.value.trim();
      if (!prompt) return;
      window.ai.appendChatMessage(chatArea, 'user', prompt);
      aiInput.value = '';
      try {
        const reply = await window.ai.askAI(prompt);
        window.ai.appendChatMessage(chatArea, 'ai', reply);
      } catch (err) {
        window.ai.appendChatMessage(chatArea, 'ai', 'Error: ' + err.message);
      }
    });
  }
});
