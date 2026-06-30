// js/editor.js
// Browser-based CMS editor for TEI Studio.
// Access: Ctrl+Shift+E — opens login (no visible button, site stays clean for visitors)
// Backend: see store.js — Supabase when configured, browser-only otherwise.

import * as db from './store.js';

const META_KEY  = 'tei_meta';
const TEXT_KEY  = 'tei_text';
const CARDS_KEY = 'tei_cards';

const PAGE = (() => {
  const p = location.pathname;
  if (p.includes('portfolio'))    return 'portfolio';
  if (p.includes('about'))        return 'about';
  if (p.includes('services'))     return 'services';
  if (p.includes('testimonials')) return 'testimonials';
  if (p.includes('contact'))      return 'contact';
  return 'home';
})();

// ─── Files ───────────────────────────────────────────────────
const saveFile   = (id, blob) => db.uploadMedia(id, blob);
const loadFile   = (id)       => db.loadMedia(id);
const deleteFile = (id)       => db.removeMedia(id);

// ─── Metadata ────────────────────────────────────────────────
function loadMeta()           { return db.getContent(META_KEY, {}); }
function saveMeta(m)          { db.setContent(META_KEY, m); }
function getPageEntries(p)    { return loadMeta()[p] || []; }
function savePageEntry(p, e)  {
  const m = loadMeta();
  if (!m[p]) m[p] = [];
  const i = m[p].findIndex(x => x.id === e.id);
  if (i >= 0) m[p][i] = e; else m[p].unshift(e);
  saveMeta(m);
}
function deletePageEntry(p, id) {
  const m = loadMeta();
  if (m[p]) m[p] = m[p].filter(e => e.id !== id);
  saveMeta(m);
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ─── Inline text ─────────────────────────────────────────────
function loadTextStore()  { return db.getContent(TEXT_KEY, {}); }
function saveTextStore(s) { db.setContent(TEXT_KEY, s); }

function initInlineText() {
  const store = loadTextStore();
  const apply = (el, key) => {
    if (!el) return;
    el.dataset.editKey = key;
    el.classList.add('editable-text');
    const k = PAGE + ':' + key;
    if (store[k] !== undefined) el.innerHTML = store[k];
  };

  if (PAGE === 'home') {
    apply(document.querySelector('.site-hero__eyebrow'), 'hero-eyebrow');
    apply(document.querySelector('.site-hero__title'),   'hero-title');
    apply(document.querySelector('.site-hero__sub'),     'hero-sub');
  }

  if (PAGE !== 'home') {
    apply(document.querySelector('.page-hero__title'), 'hero-title');
    apply(document.querySelector('.page-hero__sub'),   'hero-sub');
  }

  if (PAGE === 'services') {
    document.querySelectorAll('.service-card:not([data-dynamic])').forEach((card, i) => {
      apply(card.querySelector('.service-card__title'), `service-${i}-title`);
      apply(card.querySelector('.service-card__desc'),  `service-${i}-desc`);
    });
  }

  // Apply any elements with data-edit-key already set in the HTML
  document.querySelectorAll('[data-edit-key]:not(.editable-text)').forEach(el => {
    el.classList.add('editable-text');
    const k = PAGE + ':' + el.dataset.editKey;
    if (store[k] !== undefined) el.innerHTML = store[k];
  });
}

function enableInlineEditing() {
  document.querySelectorAll('.editable-text').forEach(el => {
    el.contentEditable = 'true';
    if (!el._inlineWired) {
      el.addEventListener('blur', () => {
        const store = loadTextStore();
        store[PAGE + ':' + el.dataset.editKey] = el.innerHTML;
        saveTextStore(store);
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
      });
      el._inlineWired = true;
    }
  });
}

function disableInlineEditing() {
  document.querySelectorAll('.editable-text').forEach(el => { el.contentEditable = 'false'; });
}

// ─── Static card overrides (portfolio) ───────────────────────
function loadCards()                       { return db.getContent(CARDS_KEY, {}); }
function saveCards(c)                      { db.setContent(CARDS_KEY, c); }
function getCardOverride(page, key)        { const c = loadCards(); return (c[page] && c[page][key]) || {}; }
function setCardOverride(page, key, patch) {
  const c = loadCards();
  if (!c[page]) c[page] = {};
  c[page][key] = { ...(c[page][key] || {}), ...patch };
  saveCards(c);
}
const staticFileId = key => `static-portfolio-${key}`;

async function applyCardMedia(card, key, blob = null) {
  const thumb = card.querySelector('.project-card__thumb');
  if (!thumb) return;
  if (!blob) blob = await loadFile(staticFileId(key));
  if (!blob) return;
  thumb.querySelectorAll('img.thumb-media').forEach(n => n.remove());
  card.classList.add('has-media');
  const img = document.createElement('img');
  img.className = 'thumb-media';
  img.src = URL.createObjectURL(blob);
  img.alt = card.querySelector('.project-card__title')?.textContent || '';
  thumb.appendChild(img);
}

function clearCardMedia(card) {
  card.querySelector('.project-card__thumb')?.querySelectorAll('img.thumb-media').forEach(n => n.remove());
  card.classList.remove('has-media');
}

function setupStaticCardControls(card, key) {
  if (!card.querySelector('.card-editor-controls')) {
    const ctrls = document.createElement('div');
    ctrls.className = 'card-editor-controls';
    ctrls.innerHTML = `<button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete card">×</button>`;
    ctrls.querySelector('.card-ctrl-btn--delete').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this card? Cannot be undone.')) return;
      await deleteFile(staticFileId(key)).catch(() => {});
      setCardOverride('portfolio', key, { deleted: true });
      card.remove();
    });
    card.appendChild(ctrls);
  }

  const thumb = card.querySelector('.project-card__thumb');
  if (thumb && !thumb.querySelector('.thumb-upload')) {
    const overlay = document.createElement('div');
    overlay.className = 'thumb-upload';
    overlay.innerHTML = `
      <span class="thumb-upload__pick">⬆ Upload image</span>
      <button type="button" class="thumb-upload__remove">Remove</button>
      <input type="file" accept=".png,.jpg,.jpeg,.webp" hidden>`;
    const input  = overlay.querySelector('input');
    const remove = overlay.querySelector('.thumb-upload__remove');

    overlay.addEventListener('click', e => {
      if (!document.body.classList.contains('editor-active')) return;
      if (e.target === remove) return;
      e.stopPropagation();
      input.click();
    });
    input.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      await saveFile(staticFileId(key), file);
      setCardOverride('portfolio', key, { hasMedia: true });
      await applyCardMedia(card, key, file);
    });
    remove.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteFile(staticFileId(key)).catch(() => {});
      setCardOverride('portfolio', key, { hasMedia: false });
      clearCardMedia(card);
    });
    thumb.appendChild(overlay);
  }
}

async function enhanceStaticCards() {
  if (PAGE !== 'portfolio') return;
  const cards = [...document.querySelectorAll('.project-card:not([data-dynamic])')];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const key  = String(i);
    card.dataset.cardKey = key;
    const ov = getCardOverride('portfolio', key);
    if (ov.deleted) { card.remove(); continue; }
    if (ov.tags)    renderCardTags(card, ov.tags);
    if (ov.hasMedia) await applyCardMedia(card, key);
    setupStaticCardControls(card, key);
  }
}

// ─── Editable tags ────────────────────────────────────────────
function renderCardTags(card, tags) {
  const wrap = card.querySelector('.project-card__tags');
  if (!wrap) return;
  wrap.innerHTML = (tags || []).map(t => `<span class="tag">${t}</span>`).join('');
}

function persistCardTags(card) {
  const tags = [...card.querySelectorAll('.project-card__tags .tag:not(.tag-add)')]
    .map(t => t.textContent.trim()).filter(Boolean);
  if (card.dataset.entryId) {
    const entry = getPageEntries('portfolio').find(e => e.id === card.dataset.entryId);
    if (entry) { entry.tags = tags; savePageEntry('portfolio', entry); }
  } else if (card.dataset.cardKey !== undefined) {
    setCardOverride('portfolio', card.dataset.cardKey, { tags });
  }
}

function wireEditableTag(tag, card) {
  if (tag.classList.contains('tag-add') || tag._tagWired) return;
  tag.contentEditable = 'true';
  tag.addEventListener('click', e => e.stopPropagation());
  tag.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tag.blur(); } });
  tag.addEventListener('blur', () => {
    if (!tag.textContent.trim()) tag.remove();
    persistCardTags(card);
  });
  tag._tagWired = true;
}

function enableTagEditing() {
  if (PAGE !== 'portfolio') return;
  document.querySelectorAll('.project-card').forEach(card => {
    const wrap = card.querySelector('.project-card__tags');
    if (!wrap) return;
    wrap.querySelectorAll('.tag').forEach(tag => wireEditableTag(tag, card));
    if (!wrap.querySelector('.tag-add')) {
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'tag tag-add'; add.textContent = '+'; add.title = 'Add tag';
      add.addEventListener('click', e => {
        e.stopPropagation();
        const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'tag';
        wrap.insertBefore(t, add); wireEditableTag(t, card); t.focus();
        const r = document.createRange(); r.selectNodeContents(t);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      wrap.appendChild(add);
    }
  });
}

function disableTagEditing() {
  document.querySelectorAll('.tag-add').forEach(b => b.remove());
  document.querySelectorAll('.project-card__tags .tag').forEach(t => { t.contentEditable = 'false'; });
}

// ─── Auth ─────────────────────────────────────────────────────
function isEditorActive() { return db.isLoggedIn(); }
function activateEditor()   { document.body.classList.add('editor-active'); }
function deactivateEditor() { document.body.classList.remove('editor-active'); }

// ─── Modal factory ────────────────────────────────────────────
function buildModal(id, titleText, wide = false) {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'editor-modal';
  modal.innerHTML = `
    <div class="editor-modal__card ${wide ? 'editor-modal__card--wide' : ''}">
      <div class="editor-modal__header">
        <span class="editor-modal__title">${titleText}</span>
        <button class="editor-modal__close" aria-label="Close">×</button>
      </div>
      <div class="editor-modal__body"></div>
    </div>`;
  modal.querySelector('.editor-modal__close').addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
  document.body.appendChild(modal);
  return modal;
}
function openModal(modal)  { modal.classList.add('is-open'); const f = modal.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 50); }
function closeModal(modal) { modal.classList.remove('is-open'); }

// ─── Login modal ──────────────────────────────────────────────
function buildLoginModal() {
  const modal = buildModal('editor-login-modal', 'Studio Access');
  const body = modal.querySelector('.editor-modal__body');
  body.innerHTML = `
    <form class="editor-form" id="editor-login-form" novalidate>
      <div class="editor-field">
        <label for="ed-pass">Password</label>
        <input id="ed-pass" type="password" autocomplete="current-password">
      </div>
      <p class="editor-error" id="editor-login-error">Incorrect password.</p>
      <div class="editor-btn-row">
        <button type="submit" class="editor-btn editor-btn--primary">Enter Studio</button>
      </div>
    </form>`;
  body.querySelector('#editor-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const passEl = document.getElementById('ed-pass');
    const submit = modal.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'Checking…';
    const { ok } = await db.signIn(passEl.value);
    submit.disabled = false; submit.textContent = 'Enter Studio';
    if (ok) {
      closeModal(modal); passEl.value = '';
      document.getElementById('editor-login-error').classList.remove('is-visible');
      activateEditorFull();
    } else {
      const card = modal.querySelector('.editor-modal__card');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      document.getElementById('editor-login-error').classList.add('is-visible');
    }
  });
  return modal;
}

// ─── Nav controls ─────────────────────────────────────────────
function injectNavControls() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  if (!nav.querySelector('.editor-badge')) {
    const badge = document.createElement('span');
    badge.className = 'editor-badge'; badge.textContent = 'Editing';
    nav.appendChild(badge);
  }
  if (!nav.querySelector('.editor-logout')) {
    const logout = document.createElement('button');
    logout.className = 'editor-logout'; logout.textContent = 'Exit Editor';
    nav.appendChild(logout);
  }
}

// ─── Add content button ───────────────────────────────────────
function injectAddContentBtn() {
  if (PAGE === 'portfolio') {
    const filterBar = document.querySelector('.filter-bar');
    if (!filterBar || filterBar.nextElementSibling?.classList.contains('add-content-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'add-content-btn'; btn.innerHTML = '+ Add Project';
    btn.addEventListener('click', () => openProjectModal());
    filterBar.after(btn);
  }
  if (PAGE === 'testimonials') {
    const grid = document.querySelector('.testimonials-grid');
    if (!grid || grid.previousElementSibling?.classList.contains('add-content-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'add-content-btn'; btn.innerHTML = '+ Add Testimonial';
    btn.addEventListener('click', () => openTestimonialModal());
    grid.before(btn);
  }
  if (PAGE === 'services') {
    const grid = document.querySelector('.services-grid');
    if (!grid || grid.nextElementSibling?.classList.contains('add-content-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'add-content-btn'; btn.innerHTML = '+ Add Service';
    btn.addEventListener('click', () => openServiceModal());
    grid.after(btn);
  }
}

// ─── Hero image upload/remove (home page) ────────────────────
function wireHeroUpload() {
  if (PAGE !== 'home') return;
  const heroBg    = document.getElementById('hero-bg');
  const uploadBtn = document.getElementById('hero-upload-btn');
  const removeBtn = document.getElementById('hero-remove-btn');
  const input     = document.getElementById('hero-file-input');
  if (!input) return;

  // Use public URL directly when Supabase is configured (instant, browser-cacheable)
  const publicUrl = db.getPublicUrl('home-hero');
  if (publicUrl && heroBg) {
    heroBg.style.backgroundImage = `url(${publicUrl})`;
  } else {
    // Fallback: load blob from IndexedDB (local mode)
    loadFile('home-hero').then(blob => {
      if (blob && heroBg) heroBg.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
    });
  }

  if (uploadBtn) uploadBtn.addEventListener('click', () => input.click());
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      await deleteFile('home-hero').catch(() => {});
      if (heroBg) heroBg.style.backgroundImage = '';
    });
  }
  input.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    await saveFile('home-hero', file);
    const url = db.getPublicUrl('home-hero');
    if (heroBg) heroBg.style.backgroundImage = url ? `url(${url})` : `url(${URL.createObjectURL(file)})`;
  });
}

// ─── Home about photo upload ──────────────────────────────────
function wireHomeAboutPhoto() {
  if (PAGE !== 'home') return;
  const block = document.getElementById('home-about-photo-block');
  const input = document.getElementById('home-about-file-input');
  if (!block || !input) return;

  loadFile('about-photo').then(blob => {
    if (!blob) return;
    const img = document.getElementById('home-about-photo-img');
    if (img) { img.src = URL.createObjectURL(blob); img.style.display = 'block'; }
    const ph = document.getElementById('home-about-placeholder');
    if (ph) ph.style.display = 'none';
  });

  block.addEventListener('click', () => { if (isEditorActive()) input.click(); });
  input.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    await saveFile('about-photo', file);
    const img = document.getElementById('home-about-photo-img');
    if (img) { img.src = URL.createObjectURL(file); img.style.display = 'block'; }
    const ph = document.getElementById('home-about-placeholder');
    if (ph) ph.style.display = 'none';
  });
}

// ─── WhatsApp number ──────────────────────────────────────────
function loadWhatsAppNumber() {
  const store = loadTextStore();
  const phone = store['global:whatsapp-phone'] || '';
  if (!phone) return;
  document.querySelectorAll('[data-whatsapp-btn]').forEach(el => {
    el.href = `https://wa.me/${phone.replace(/\D/g, '')}`;
  });
}

function wireWhatsAppEdit() {
  document.querySelectorAll('[data-whatsapp-btn]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (!document.body.classList.contains('editor-active')) return;
      e.preventDefault();
      const current = (loadTextStore()['global:whatsapp-phone'] || '').replace(/\D/g, '');
      const newNum = prompt('Enter WhatsApp number with country code\n(e.g. 60123456789 for Malaysia):', current);
      if (newNum === null) return;
      const store = loadTextStore();
      store['global:whatsapp-phone'] = newNum.replace(/\D/g, '');
      saveTextStore(store);
      loadWhatsAppNumber();
    });
  });
}

// ─── Portfolio detail modal ───────────────────────────────────
function buildDetailModal() {
  const modal = document.createElement('div');
  modal.id = 'project-detail-modal';
  modal.className = 'editor-modal detail-modal';
  modal.innerHTML = `
    <div class="editor-modal__card editor-modal__card--wide detail-modal__card">
      <div class="detail-modal__preview" id="detail-preview"></div>
      <div class="detail-modal__body">
        <div class="detail-modal__header">
          <div>
            <p class="detail-modal__meta" id="detail-meta"></p>
            <h2 class="detail-modal__title" id="detail-title"></h2>
          </div>
          <button class="editor-modal__close" aria-label="Close">×</button>
        </div>
        <p class="detail-modal__desc" id="detail-desc"></p>
        <div class="detail-modal__tags" id="detail-tags"></div>
      </div>
    </div>`;
  modal.querySelector('.editor-modal__close').addEventListener('click', () => closeDetailModal());
  modal.addEventListener('click', e => { if (e.target === modal) closeDetailModal(); });
  document.body.appendChild(modal);
  return modal;
}

function closeDetailModal() {
  const modal = document.getElementById('project-detail-modal');
  if (!modal) return;
  closeModal(modal);
  setTimeout(() => { const p = document.getElementById('detail-preview'); if (p) p.innerHTML = ''; }, 300);
}

async function openDetailModal(card) {
  let modal = document.getElementById('project-detail-modal');
  if (!modal) modal = buildDetailModal();

  const title   = card.querySelector('.project-card__title')?.textContent || '';
  const desc    = card.querySelector('.project-card__desc')?.textContent  || '';
  const meta    = card.querySelector('.project-card__meta')?.textContent  || '';
  const tags    = [...card.querySelectorAll('.tag:not(.tag-add)')].map(t => t.textContent);

  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-meta').textContent  = meta;
  document.getElementById('detail-desc').textContent  = desc;
  document.getElementById('detail-tags').innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');

  const preview = document.getElementById('detail-preview');
  preview.innerHTML = '';

  const entryId = card.dataset.entryId;
  if (entryId) {
    const entry = getPageEntries('portfolio').find(e => e.id === entryId);
    if (entry) {
      const fileIds = entry.fileIds || (entry.fileId ? [entry.fileId] : []);
      const blobs = await Promise.all(fileIds.map(id => loadFile(id)));
      const validBlobs = blobs.filter(Boolean);
      if (validBlobs.length > 0) {
        let detailCur = 0;
        const track = document.createElement('div');
        track.className = 'card-carousel__track';
        track.style.cssText = 'display:flex;width:100%;height:100%;transition:transform 0.32s ease;';
        validBlobs.forEach(blob => {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(blob); img.className = 'detail-modal__img'; img.alt = title;
          img.style.flexShrink = '0';
          track.appendChild(img);
        });
        preview.appendChild(track);
        if (validBlobs.length > 1) {
          const arrowBase = 'position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;border:none;font-size:1.5rem;line-height:1;cursor:pointer;z-index:20;display:flex;align-items:center;justify-content:center;';
          const prevD = document.createElement('button');
          prevD.type = 'button'; prevD.textContent = '‹';
          prevD.style.cssText = arrowBase + 'left:1rem;';
          const nextD = document.createElement('button');
          nextD.type = 'button'; nextD.textContent = '›';
          nextD.style.cssText = arrowBase + 'right:1rem;';
          prevD.addEventListener('click', () => { detailCur = Math.max(0, detailCur - 1); track.style.transform = `translateX(-${detailCur * 100}%)`; });
          nextD.addEventListener('click', () => { detailCur = Math.min(validBlobs.length - 1, detailCur + 1); track.style.transform = `translateX(-${detailCur * 100}%)`; });
          preview.appendChild(prevD); preview.appendChild(nextD);
        }
      }
    }
  } else {
    const key = card.dataset.cardKey;
    const ov  = key !== undefined ? getCardOverride('portfolio', key) : {};
    if (ov.hasMedia) {
      const blob = await loadFile(staticFileId(key));
      if (blob) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob); img.className = 'detail-modal__img'; img.alt = title;
        preview.appendChild(img);
      }
    }
  }

  openModal(modal);
}

function wirePortfolioClicks() {
  if (PAGE !== 'portfolio') return;
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  grid.addEventListener('click', e => {
    if (e.target.closest('.card-editor-controls')) return;
    if (document.body.classList.contains('editor-active') && e.target.closest('.editable-text')) return;
    const card = e.target.closest('.project-card');
    if (card) openDetailModal(card);
  });
}

// ─── Portfolio card carousel ──────────────────────────────────
async function buildCarousel(thumb, entry) {
  const fileIds = entry.fileIds || (entry.fileId ? [entry.fileId] : []);
  const blobs   = await Promise.all(fileIds.map(id => loadFile(id)));

  const track = document.createElement('div');
  track.className = 'card-carousel__track';
  thumb.appendChild(track);

  const imgs = [];
  blobs.forEach((blob, idx) => {
    if (!blob) return;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob); img.alt = '';
    track.appendChild(img);
    imgs.push({ img, fileId: fileIds[idx] });
  });

  let cur = 0;
  const dots = [];

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'card-carousel__dots';
  thumb.appendChild(dotsWrap);

  const arrowBase = 'position:absolute;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.48);color:#fff;border:none;font-size:1.1rem;line-height:1;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center;transition:background 0.15s;';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.style.cssText = arrowBase + 'left:0.4rem;'; prevBtn.textContent = '‹';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.style.cssText = arrowBase + 'right:0.4rem;'; nextBtn.textContent = '›';
  thumb.appendChild(prevBtn); thumb.appendChild(nextBtn);

  function refreshDots() {
    dotsWrap.innerHTML = ''; dots.length = 0;
    imgs.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'card-carousel__dot' + (i === cur ? ' is-active' : '');
      dotsWrap.appendChild(d); dots.push(d);
    });
    const show = imgs.length > 1;
    prevBtn.style.display = show ? 'flex' : 'none';
    nextBtn.style.display = show ? 'flex' : 'none';
    dotsWrap.style.display = show ? 'flex' : 'none';
  }

  function goTo(i) {
    cur = Math.max(0, Math.min(i, imgs.length - 1));
    track.style.transform = `translateX(-${cur * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('is-active', j === cur));
  }

  prevBtn.addEventListener('click', e => { e.stopPropagation(); goTo(cur - 1); });
  nextBtn.addEventListener('click', e => { e.stopPropagation(); goTo(cur + 1); });
  refreshDots();

  // Editor overlay
  const overlay = document.createElement('div');
  overlay.className = 'thumb-upload';
  const addSpan = document.createElement('span');
  addSpan.className = 'thumb-upload__pick'; addSpan.textContent = '⬆ Add Image';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button'; removeBtn.className = 'thumb-upload__remove'; removeBtn.textContent = '× Remove This';
  const addInput = document.createElement('input');
  addInput.type = 'file'; addInput.accept = '.png,.jpg,.jpeg,.webp'; addInput.hidden = true;
  overlay.appendChild(addSpan); overlay.appendChild(removeBtn); overlay.appendChild(addInput);
  thumb.appendChild(overlay);

  if (imgs.length > 0) thumb.classList.add('has-media');

  overlay.addEventListener('click', e => {
    if (!document.body.classList.contains('editor-active')) return;
    if (e.target === removeBtn) return;
    e.stopPropagation(); addInput.click();
  });

  addInput.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const newId = genId();
    await saveFile(newId, file);
    if (!entry.fileIds) entry.fileIds = fileIds.slice();
    entry.fileIds.push(newId);
    savePageEntry('portfolio', entry);
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file); img.alt = '';
    track.appendChild(img);
    imgs.push({ img, fileId: newId });
    thumb.classList.add('has-media');
    refreshDots(); goTo(imgs.length - 1);
  });

  removeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (imgs.length === 0) return;
    if (!confirm('Remove this image from the card?')) return;
    const { fileId } = imgs[cur];
    await deleteFile(fileId).catch(() => {});
    if (!entry.fileIds) entry.fileIds = fileIds.slice();
    entry.fileIds = entry.fileIds.filter(id => id !== fileId);
    savePageEntry('portfolio', entry);
    track.removeChild(imgs[cur].img);
    imgs.splice(cur, 1);
    if (imgs.length === 0) thumb.classList.remove('has-media');
    refreshDots(); goTo(Math.min(cur, imgs.length - 1));
  });
}

// ─── Dynamic portfolio cards ──────────────────────────────────
async function buildProjectCard(entry) {
  if (!entry.fileIds) entry.fileIds = entry.fileId ? [entry.fileId] : [];

  const card = document.createElement('article');
  card.className = 'project-card';
  card.dataset.category = entry.category || 'other';
  card.dataset.dynamic  = '1';
  card.dataset.entryId  = entry.id;

  const tags = (entry.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  const cat  = entry.category ? entry.category.charAt(0).toUpperCase() + entry.category.slice(1) : 'Interior';

  card.innerHTML = `
    <div class="project-card__thumb"></div>
    <div class="project-card__body">
      <p class="project-card__meta">${cat} — ${entry.year || new Date().getFullYear()}</p>
      <h2 class="project-card__title">${entry.title}</h2>
      <div class="project-card__desc-wrap"><p class="project-card__desc">${entry.description || ''}</p></div>
      <div class="project-card__tags">${tags}</div>
    </div>
    <div class="card-editor-controls">
      <button class="card-ctrl-btn card-ctrl-btn--edit" title="Edit">✎</button>
      <button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete">×</button>
    </div>`;

  await buildCarousel(card.querySelector('.project-card__thumb'), entry);

  card.querySelector('.card-ctrl-btn--edit').addEventListener('click', e => {
    e.stopPropagation(); openProjectModal(entry);
  });
  card.querySelector('.card-ctrl-btn--delete').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${entry.title}"?`)) return;
    await Promise.all((entry.fileIds || []).map(id => deleteFile(id).catch(() => {})));
    deletePageEntry('portfolio', entry.id);
    card.remove();
  });

  return card;
}

async function renderStoredProjects() {
  const grid = document.getElementById('project-grid');
  if (!grid) return;
  for (const entry of getPageEntries('portfolio')) {
    grid.prepend(await buildProjectCard(entry));
  }
  refreshFilter();
}

function refreshFilter() {
  const activeBtn = document.querySelector('.filter-btn.is-active');
  if (!activeBtn) return;
  const filter = activeBtn.dataset.filter;
  document.querySelectorAll('.project-card').forEach(card => {
    card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.category !== filter);
  });
}

// ─── Project modal (add / edit) ───────────────────────────────
function openProjectModal(prefill = null) {
  const old = document.getElementById('editor-project-modal');
  if (old) old.remove();

  const modal = buildModal('editor-project-modal', prefill ? 'Edit Project' : 'Add Project', true);
  const body  = modal.querySelector('.editor-modal__body');
  const p     = prefill || {};

  body.innerHTML = `
    <form class="editor-form" id="project-form" novalidate>
      <div class="upload-dropzone" id="upload-dropzone">
        <span class="upload-dropzone__icon">⬆</span>
        <span class="upload-dropzone__label">${prefill ? 'Drop images to add more (optional)' : 'Drop images here or click to browse'}</span>
        <span class="upload-dropzone__sub">Accepts .png · .jpg · .jpeg · .webp · Multiple allowed</span>
        <span class="upload-dropzone__filename" id="upload-filename"></span>
        <input type="file" id="upload-file-input" accept=".png,.jpg,.jpeg,.webp" multiple style="display:none">
      </div>
      <div class="editor-field__row">
        <div class="editor-field">
          <label for="up-title">Project Title</label>
          <input id="up-title" type="text" value="${p.title || ''}" required>
        </div>
        <div class="editor-field">
          <label for="up-year">Year</label>
          <input id="up-year" type="text" value="${p.year || new Date().getFullYear()}" maxlength="4">
        </div>
      </div>
      <div class="editor-field">
        <label for="up-desc">Description</label>
        <textarea id="up-desc">${p.description || ''}</textarea>
      </div>
      <div class="editor-field__row">
        <div class="editor-field">
          <label for="up-category">Category</label>
          <select id="up-category">
            ${['residential','commercial','hospitality','renovation','other'].map(c =>
              `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="editor-field">
          <label for="up-tags">Tags (comma-separated)</label>
          <input id="up-tags" type="text" value="${(p.tags || []).join(', ')}">
        </div>
      </div>
      <div class="editor-btn-row">
        <button type="button" class="editor-btn editor-btn--ghost" id="project-cancel">Cancel</button>
        <button type="submit" class="editor-btn editor-btn--primary">${prefill ? 'Save Changes' : 'Add to Portfolio'}</button>
      </div>
    </form>`;

  let pickedFiles = [];
  const dropzone  = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');
  const fileLabel = document.getElementById('upload-filename');

  function handleFiles(files) {
    pickedFiles = [...pickedFiles, ...files];
    fileLabel.textContent = pickedFiles.length === 1 ? pickedFiles[0].name : `${pickedFiles.length} images selected`;
    dropzone.classList.add('has-file');
  }
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFiles(e.target.files); });
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  document.getElementById('project-cancel').addEventListener('click', () => closeModal(modal));
  document.getElementById('project-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = document.getElementById('up-title').value.trim();
    if (!title) return;

    const fileIds = p.fileIds ? [...p.fileIds] : (p.fileId ? [p.fileId] : []);
    for (const file of pickedFiles) {
      const newId = genId();
      await saveFile(newId, file);
      fileIds.push(newId);
    }
    if (!prefill && fileIds.length === 0) { alert('Please pick at least one image.'); return; }

    const entry = {
      id:          p.id || genId(),
      title,
      description: document.getElementById('up-desc').value.trim(),
      category:    document.getElementById('up-category').value,
      year:        document.getElementById('up-year').value.trim(),
      tags:        document.getElementById('up-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      fileIds,
    };

    savePageEntry('portfolio', entry);
    closeModal(modal);

    document.querySelector(`.project-card[data-entry-id="${entry.id}"]`)?.remove();
    const grid = document.getElementById('project-grid');
    if (grid) { grid.prepend(await buildProjectCard(entry)); refreshFilter(); }
  });

  openModal(modal);
}

// ─── Testimonials ─────────────────────────────────────────────
function buildTestimonialCard(entry) {
  const card = document.createElement('div');
  card.className = 'testimonial-card';
  card.dataset.dynamic = '1';
  card.dataset.entryId = entry.id;

  card.innerHTML = `
    <blockquote class="testimonial-card__quote">"${entry.quote}"</blockquote>
    <div class="testimonial-card__author">
      <p class="testimonial-card__name">${entry.name}</p>
      ${entry.role ? `<p class="testimonial-card__role">${entry.role}</p>` : ''}
    </div>
    <div class="testimonial-editor-controls">
      <button class="card-ctrl-btn card-ctrl-btn--edit" title="Edit">✎</button>
      <button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete">×</button>
    </div>`;

  card.querySelector('.card-ctrl-btn--edit').addEventListener('click', e => {
    e.stopPropagation(); openTestimonialModal(entry);
  });
  card.querySelector('.card-ctrl-btn--delete').addEventListener('click', e => {
    e.stopPropagation();
    if (!confirm(`Delete ${entry.name}'s testimonial?`)) return;
    deletePageEntry('testimonials', entry.id);
    card.remove();
  });
  return card;
}

function renderStoredTestimonials() {
  const grid = document.querySelector('.testimonials-grid');
  if (!grid) return;
  getPageEntries('testimonials').forEach(entry => grid.prepend(buildTestimonialCard(entry)));
}

function openTestimonialModal(prefill = null) {
  const old = document.getElementById('editor-testimonial-modal');
  if (old) old.remove();
  const modal = buildModal('editor-testimonial-modal', prefill ? 'Edit Testimonial' : 'Add Testimonial', true);
  const body  = modal.querySelector('.editor-modal__body');
  const p     = prefill || {};

  body.innerHTML = `
    <form class="editor-form" id="testimonial-form" novalidate>
      <div class="editor-field">
        <label for="t-name">Client Name</label>
        <input id="t-name" type="text" value="${p.name || ''}" required>
      </div>
      <div class="editor-field">
        <label for="t-quote">Testimonial</label>
        <textarea id="t-quote" style="min-height:120px">${p.quote || ''}</textarea>
      </div>
      <div class="editor-field">
        <label for="t-role">Role / Location (optional)</label>
        <input id="t-role" type="text" value="${p.role || ''}">
      </div>
      <div class="editor-btn-row">
        <button type="button" class="editor-btn editor-btn--ghost" id="t-cancel">Cancel</button>
        <button type="submit" class="editor-btn editor-btn--primary">${prefill ? 'Save Changes' : 'Add Testimonial'}</button>
      </div>
    </form>`;

  document.getElementById('t-cancel').addEventListener('click', () => closeModal(modal));
  document.getElementById('testimonial-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('t-name').value.trim(); if (!name) return;
    const entry = {
      id:    p.id || genId(),
      name,
      quote: document.getElementById('t-quote').value.trim(),
      role:  document.getElementById('t-role').value.trim(),
    };
    savePageEntry('testimonials', entry);
    closeModal(modal);
    document.querySelector(`.testimonial-card[data-entry-id="${entry.id}"]`)?.remove();
    document.querySelector('.testimonials-grid')?.prepend(buildTestimonialCard(entry));
  });

  openModal(modal);
}

// ─── Static testimonial controls ─────────────────────────────
function wireStaticTestimonials() {
  if (PAGE !== 'testimonials') return;
  const m = loadMeta();
  const saved = m.testimonials_static || {};

  document.querySelectorAll('.testimonial-card:not([data-dynamic])').forEach((card, i) => {
    const key = String(i);
    if (saved[key]) {
      if (saved[key].deleted) { card.remove(); return; }
      if (saved[key].quote !== undefined) {
        const q = card.querySelector('.testimonial-card__quote');
        if (q) q.textContent = `"${saved[key].quote}"`;
      }
      if (saved[key].name !== undefined) {
        const n = card.querySelector('.testimonial-card__name');
        if (n) n.textContent = saved[key].name;
      }
      if (saved[key].role !== undefined) {
        const r = card.querySelector('.testimonial-card__role');
        if (r) r.textContent = saved[key].role;
      }
    }
    if (card.querySelector('.testimonial-editor-controls')) return;

    const ctrls = document.createElement('div');
    ctrls.className = 'testimonial-editor-controls';
    ctrls.innerHTML = `
      <button class="card-ctrl-btn card-ctrl-btn--edit" title="Edit">✎</button>
      <button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete">×</button>`;

    ctrls.querySelector('.card-ctrl-btn--delete').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Delete this testimonial?')) return;
      const meta = loadMeta();
      if (!meta.testimonials_static) meta.testimonials_static = {};
      meta.testimonials_static[key] = { deleted: true };
      saveMeta(meta);
      card.remove();
    });

    ctrls.querySelector('.card-ctrl-btn--edit').addEventListener('click', e => {
      e.stopPropagation();
      const quote = card.querySelector('.testimonial-card__quote')?.textContent?.replace(/^"|"$/g, '') || '';
      const name  = card.querySelector('.testimonial-card__name')?.textContent  || '';
      const role  = card.querySelector('.testimonial-card__role')?.textContent  || '';

      const old = document.getElementById('editor-testimonial-modal');
      if (old) old.remove();
      const modal = buildModal('editor-testimonial-modal', 'Edit Testimonial', true);
      const body  = modal.querySelector('.editor-modal__body');
      body.innerHTML = `
        <form class="editor-form" id="testimonial-form" novalidate>
          <div class="editor-field"><label for="t-name">Client Name</label><input id="t-name" type="text" value="${name}" required></div>
          <div class="editor-field"><label for="t-quote">Testimonial</label><textarea id="t-quote" style="min-height:120px">${quote}</textarea></div>
          <div class="editor-field"><label for="t-role">Role / Location (optional)</label><input id="t-role" type="text" value="${role}"></div>
          <div class="editor-btn-row">
            <button type="button" class="editor-btn editor-btn--ghost" id="t-cancel">Cancel</button>
            <button type="submit" class="editor-btn editor-btn--primary">Save Changes</button>
          </div>
        </form>`;
      document.getElementById('t-cancel').addEventListener('click', () => closeModal(modal));
      document.getElementById('testimonial-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const newName  = document.getElementById('t-name').value.trim();
        const newQuote = document.getElementById('t-quote').value.trim();
        const newRole  = document.getElementById('t-role').value.trim();
        const q = card.querySelector('.testimonial-card__quote');
        const n = card.querySelector('.testimonial-card__name');
        const r = card.querySelector('.testimonial-card__role');
        if (q) q.textContent = `"${newQuote}"`;
        if (n) n.textContent = newName;
        if (r) r.textContent = newRole;
        const meta = loadMeta();
        if (!meta.testimonials_static) meta.testimonials_static = {};
        meta.testimonials_static[key] = { name: newName, quote: newQuote, role: newRole };
        saveMeta(meta);
        closeModal(modal);
      });
      openModal(modal);
    });

    card.appendChild(ctrls);
  });
}

// ─── Services ─────────────────────────────────────────────────
function renumberServices() {
  [...document.querySelectorAll('.services-grid .service-card')].forEach((card, i) => {
    const n = card.querySelector('.service-card__number');
    if (n) n.textContent = String(i + 1).padStart(2, '0');
  });
}

function buildDynamicServiceCard(entry) {
  const card = document.createElement('div');
  card.className = 'service-card';
  card.dataset.dynamic = '1';
  card.dataset.entryId = entry.id;
  card.innerHTML = `
    <span class="service-card__number"></span>
    <h2 class="service-card__title">${entry.title}</h2>
    <p class="service-card__desc">${entry.description || ''}</p>
    <div class="card-editor-controls">
      <button class="card-ctrl-btn card-ctrl-btn--edit" title="Edit">✎</button>
      <button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete">×</button>
    </div>`;
  card.querySelector('.card-ctrl-btn--edit').addEventListener('click', e => {
    e.stopPropagation(); openServiceModal(entry);
  });
  card.querySelector('.card-ctrl-btn--delete').addEventListener('click', e => {
    e.stopPropagation();
    if (!confirm(`Delete "${entry.title}"?`)) return;
    deletePageEntry('services', entry.id);
    card.remove();
    renumberServices();
  });
  return card;
}

function renderStoredServices() {
  if (PAGE !== 'services') return;
  const grid = document.querySelector('.services-grid');
  if (!grid) return;
  getPageEntries('services').forEach(entry => grid.append(buildDynamicServiceCard(entry)));
  renumberServices();
}

function wireStaticServices() {
  if (PAGE !== 'services') return;
  const cardsData = loadCards();
  const overrides = (cardsData.services) || {};

  document.querySelectorAll('.service-card:not([data-dynamic])').forEach((card, i) => {
    const key = String(i);
    if (overrides[key]?.deleted) { card.remove(); return; }
    if (card.querySelector('.card-editor-controls')) return;

    const ctrls = document.createElement('div');
    ctrls.className = 'card-editor-controls';
    ctrls.innerHTML = `
      <button class="card-ctrl-btn card-ctrl-btn--edit" title="Edit">✎</button>
      <button class="card-ctrl-btn card-ctrl-btn--delete" title="Delete">×</button>`;

    ctrls.querySelector('.card-ctrl-btn--delete').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Delete this service?')) return;
      setCardOverride('services', key, { deleted: true });
      card.remove();
      renumberServices();
    });

    ctrls.querySelector('.card-ctrl-btn--edit').addEventListener('click', e => {
      e.stopPropagation();
      const title = card.querySelector('.service-card__title')?.textContent || '';
      const desc  = card.querySelector('.service-card__desc')?.textContent  || '';
      openServiceModal({ _staticKey: key, _card: card, title, description: desc });
    });

    card.appendChild(ctrls);
  });
  renumberServices();
}

function openServiceModal(prefill = null) {
  const old = document.getElementById('editor-service-modal');
  if (old) old.remove();
  const p      = prefill || {};
  const isNew  = !prefill;
  const modal  = buildModal('editor-service-modal', isNew ? 'Add Service' : 'Edit Service', true);
  const body   = modal.querySelector('.editor-modal__body');

  body.innerHTML = `
    <form class="editor-form" id="service-form" novalidate>
      <div class="editor-field">
        <label for="svc-title">Service Title</label>
        <input id="svc-title" type="text" value="${p.title || ''}" required>
      </div>
      <div class="editor-field">
        <label for="svc-desc">Description</label>
        <textarea id="svc-desc" style="min-height:120px">${p.description || ''}</textarea>
      </div>
      <div class="editor-btn-row">
        <button type="button" class="editor-btn editor-btn--ghost" id="svc-cancel">Cancel</button>
        <button type="submit" class="editor-btn editor-btn--primary">${isNew ? 'Add Service' : 'Save Changes'}</button>
      </div>
    </form>`;

  document.getElementById('svc-cancel').addEventListener('click', () => closeModal(modal));
  document.getElementById('service-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const title = document.getElementById('svc-title').value.trim();
    const desc  = document.getElementById('svc-desc').value.trim();
    if (!title) return;

    if (p._staticKey !== undefined) {
      // Static card — update DOM + persist via text store
      const card = p._card;
      if (card) {
        const t = card.querySelector('.service-card__title');
        const d = card.querySelector('.service-card__desc');
        if (t) t.textContent = title;
        if (d) d.textContent = desc;
      }
      const ts = loadTextStore();
      ts[`services:service-${p._staticKey}-title`] = title;
      ts[`services:service-${p._staticKey}-desc`]  = desc;
      saveTextStore(ts);
      closeModal(modal);
      return;
    }

    // Dynamic card — save to meta
    const entry = { id: p.id || genId(), title, description: desc };
    savePageEntry('services', entry);
    closeModal(modal);
    const existing = document.querySelector(`.service-card[data-entry-id="${entry.id}"]`);
    if (existing) {
      const t = existing.querySelector('.service-card__title');
      const d = existing.querySelector('.service-card__desc');
      if (t) t.textContent = title;
      if (d) d.textContent = desc;
    } else {
      const grid = document.querySelector('.services-grid');
      if (grid) grid.append(buildDynamicServiceCard(entry));
    }
    renumberServices();
  });

  openModal(modal);
}

// ─── About photo ──────────────────────────────────────────────
function wireAboutPhoto() {
  if (PAGE !== 'about') return;
  const block = document.getElementById('about-photo-block');
  const input = document.getElementById('about-photo-input');
  if (!block || !input) return;

  loadFile('about-photo').then(blob => {
    if (!blob) return;
    const img = document.getElementById('about-photo-img');
    if (img) { img.src = URL.createObjectURL(blob); img.style.display = 'block'; }
    block.querySelector('.about-photo__placeholder')?.style.setProperty('display', 'none');
  });

  block.addEventListener('click', () => { if (isEditorActive()) input.click(); });
  input.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    await saveFile('about-photo', file);
    const img = document.getElementById('about-photo-img');
    if (img) { img.src = URL.createObjectURL(file); img.style.display = 'block'; }
    block.querySelector('.about-photo__placeholder')?.style.setProperty('display', 'none');
  });
}

// ─── Activate / deactivate ────────────────────────────────────
function activateEditorFull() {
  activateEditor();
  enableInlineEditing();
  enableTagEditing();
}
function deactivateEditorFull() {
  deactivateEditor();
  disableInlineEditing();
  disableTagEditing();
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  await db.initStore();

  const loginModal = buildLoginModal();

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      if (isEditorActive()) { db.signOut(); deactivateEditorFull(); }
      else openModal(loginModal);
    }
  });

  injectNavControls();
  document.querySelectorAll('.editor-logout').forEach(btn => {
    btn.addEventListener('click', () => { db.signOut(); deactivateEditorFull(); });
  });
  db.onAuthChange(active => { if (!active) deactivateEditorFull(); });

  wireHeroUpload();
  wireHomeAboutPhoto();
  wireAboutPhoto();
  loadWhatsAppNumber();
  wireWhatsAppEdit();

  if (PAGE === 'portfolio') {
    injectAddContentBtn();
    await renderStoredProjects();
    await enhanceStaticCards();
    wirePortfolioClicks();
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        setTimeout(refreshFilter, 0);
      });
    });
  }

  if (PAGE === 'testimonials') {
    injectAddContentBtn();
    renderStoredTestimonials();
    wireStaticTestimonials();
  }

  if (PAGE === 'services') {
    renderStoredServices();
    wireStaticServices();
    injectAddContentBtn();
  }

  initInlineText();
  if (isEditorActive()) activateEditorFull();
}

init();
