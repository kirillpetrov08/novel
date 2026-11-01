/* ============================================================
   UI: экраны, рендер, все обработчики.
   Игровая логика — engine.js, деньги — store.js, загрузка — loader.js.
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = c => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())) ? c.trim() : null;
const gradient = (pair, fallback = ['#E9DCC3', '#B49B72']) => {
  const a = safeColor(pair && pair[0]) || fallback[0];
  const b = safeColor(pair && pair[1]) || fallback[1];
  return `linear-gradient(165deg, ${a} 0%, ${b} 100%)`;
};

/* Живые эффекты погоды на canvas поверх фона сцены (снег/дождь).
   Эффект берётся из scene.fx, если задан, иначе угадывается по имени фона
   (snow/rain). Работает только в плеере, отключается в настройках. */
const WeatherFX = {
  canvas: null, ctx: null, raf: 0, mode: null, parts: [], w: 0, h: 0, last: 0,
  guess(sc) {
    if (!sc) return null;
    if (sc.fx) return sc.fx;
    const bg = sc.bg || '';
    if (/snow/i.test(bg)) return 'snow';
    if (/rain/i.test(bg)) return 'rain';
    return null;
  },
  apply(mode) {
    if (mode && Store.data && Store.data.settings && !Store.data.settings.weatherFx) mode = null;
    if (mode === this.mode) { if (mode) this._resize(); return; }
    this.mode = mode;
    this.stop();
    if (!mode) { this._clear(); return; }
    this.canvas = document.querySelector('#weather-fx');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._resize(); this._seed();
    this.last = performance.now();
    const step = t => { if (!this.mode) return; this._frame(t); this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  },
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
  _clear() { if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); },
  _resize() {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  _seed() { const n = this.mode === 'snow' ? 80 : 110; this.parts = []; for (let i = 0; i < n; i++) this.parts.push(this._new(true)); },
  _new(anyY) {
    const W = this.w || 360, H = this.h || 640;
    if (this.mode === 'snow') return { x: Math.random() * W, y: anyY ? Math.random() * H : -4, r: 1 + Math.random() * 2.4, s: 14 + Math.random() * 30, ph: Math.random() * 6.28 };
    return { x: Math.random() * (W + 40) - 20, y: anyY ? Math.random() * H : -16, l: 9 + Math.random() * 10, s: 420 + Math.random() * 260 };
  },
  _frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const c = this.ctx, W = this.w, H = this.h;
    if (!c || !W) return;
    c.clearRect(0, 0, W, H);
    if (this.mode === 'snow') {
      c.fillStyle = 'rgba(255,252,245,.85)';
      for (const p of this.parts) {
        p.y += p.s * dt; p.x += Math.sin(t / 900 + p.ph) * 14 * dt;
        if (p.y > H + 4 || p.x < -6 || p.x > W + 6) Object.assign(p, this._new(false));
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
      }
    } else {
      c.strokeStyle = 'rgba(220,230,240,.5)'; c.lineWidth = 1; c.beginPath();
      for (const p of this.parts) {
        p.y += p.s * dt; p.x += p.s * 0.18 * dt;
        if (p.y > H + 18) Object.assign(p, this._new(false));
        c.moveTo(p.x, p.y); c.lineTo(p.x - p.l * 0.18, p.y + p.l);
      }
      c.stroke();
    }
  },
};

const UI = {
  screen: 'library',
  autoTimer: null,
  detailId: null,
  pendingChoice: null,   // {idx, cost} — выбор, на который не хватило кристаллов
  pendingRewardGrant: null, // колбэк начисления для демо-рекламы в веб-режиме
  endingReward: 0,       // награда текущего финала — база для удвоения ×2
  endingDoubled: false,
  _startingStory: false,
  libFormat: 'short',      // вкладка библиотеки: 'short' | 'long'
  feedSeed: '',            // сид раскладки рекламы в ленте на эту сессию
  feedDismissed: {},       // slotId -> true: слоты, закрытые крестиком до конца сессии
  feedHeights: {},         // slotId -> высота (dp) для резерва DOM-слота
  _feedSyncQueued: false,
  pendingRef: null,
  confirmResolve: null,
  storesLoaded: false,

  /* ---------------- навигация ---------------- */
  go(name) {
    this.screen = name;
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + name));
    $('#tabbar').style.display = (name === 'player' || name === 'detail') ? 'none' : 'flex';
    $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    if (name !== 'library') Ads.hideAllFeedAds(); // рекламные вью живут только на экране библиотеки
    if (name === 'library') this.renderLibrary();
    if (name === 'shop') this.renderShop();
    if (name === 'profile') this.renderProfile();
    if (name === 'shelf') this.renderShelf();
    if (name !== 'player') { Engine.stopTyping(); this.clearAuto(); WeatherFX.apply(null); }
    window.scrollTo(0, 0);
  },

  toast(text, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  },

  openModal(id) {
    // рекламные вью плагина лежат поверх WebView: под модалкой видимыми не держим
    $$('.ad-slot').forEach(slot => Ads.positionFeedAd(slot.dataset.slot, slot.getBoundingClientRect(), false));
    $('#' + id).classList.add('open');
  },
  closeModal(id) {
    $('#' + id).classList.remove('open');
    if (this.screen === 'library' && !$('.modal-ov.open')) this.syncFeedAds();
  },

  confirm(title, text, yesLabel = 'Да') {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yesLabel;
    this.openModal('modal-confirm');
    return new Promise(res => { this.confirmResolve = res; });
  },

  /* ---------------- кристаллы в шапках ---------------- */
  renderGems(pulse) {
    $$('.js-gems-num').forEach(el => el.textContent = Store.data.crystals);
    if (pulse) $$('.crystals-pill').forEach(el => {
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    });
  },

  /* Реклама в ленте библиотеки: слоты стоят В ПОТОКЕ между карточками историй
     в случайных местах (раскладка сессии — Meta.planFeedAds) и ничего не перекрывают.
     В Android настоящие вью плагина (нативная карточка + баннеры «Лента») ложатся
     точно поверх своих слотов и едут за ними при скролле; в веб-разработке в слотах —
     визуальные заглушки. Уход с экрана библиотеки вью уничтожает (на возврате — свежие). */
  feedSlotEl(slotId, item) {
    const slot = document.createElement('div');
    slot.className = 'native-slot ad-slot';
    slot.dataset.slot = slotId;
    slot.dataset.unit = item.unit;
    slot.dataset.kind = item.kind;
    if (Ads.isNative()) {
      slot.style.height = (this.feedHeights[slotId] || (item.kind === 'native' ? 300 : 120)) + 'px';
    } else {
      const label = item.kind === 'native' ? 'Нативная карточка Яндекса' : 'Баннер «Лента» Яндекса';
      slot.innerHTML = `<div class="native-demo"><span class="native-demo-tag">Реклама</span>
        <div class="native-demo-title">${label}</div>
        <div class="muted small">В Android-приложении здесь настоящий блок ${item.unit}. В веб-режиме — только место размещения.</div></div>`;
    }
    return slot;
  },

  /* Подгоняет Android-вью под текущие положения их слотов (скролл/resize/рендер/модалки).
     Порядок важен: показанное двигаем сразу, новое грузим только когда слот в кадре. */
  syncFeedAds() {
    if (!Ads.isNative() || this._feedSyncQueued) return;
    this._feedSyncQueued = true;
    requestAnimationFrame(async () => {
      this._feedSyncQueued = false;
      if (this.screen !== 'library') return;
      const slots = $$('#story-list .ad-slot');
      const liveIds = new Set(slots.map(s => s.dataset.slot));
      Object.keys(Ads._feed || {}).forEach(id => { if (!liveIds.has(id)) Ads.hideFeedAd(id); });
      const inView = rect => rect.bottom > 0 && rect.top < window.innerHeight && !$('.modal-ov.open');
      const positionShown = () => slots.forEach(slot => {
        const id = slot.dataset.slot;
        if (this.feedDismissed[id] || !Ads.isFeedShown(id)) return;
        Ads.positionFeedAd(id, slot.getBoundingClientRect(), inView(slot.getBoundingClientRect()));
      });
      positionShown();
      for (const slot of slots) {
        const id = slot.dataset.slot;
        if (this.feedDismissed[id]) { slot.style.display = 'none'; continue; }
        if (Ads.isFeedShown(id)) continue;
        const rect = slot.getBoundingClientRect();
        if (!inView(rect)) continue; // слот за экраном — рекламу впустую не грузим
        const r = await Ads.showFeedAd(id, slot.dataset.unit, slot.dataset.kind, rect);
        if (this.screen !== 'library') { Ads.hideAllFeedAds(); return; } // ушли с экрана, пока грузилась
        const live = document.querySelector(`.ad-slot[data-slot="${id}"]`); // слот мог пересоздаться перерендером
        if (!live) continue;
        if (r.shown) {
          if (r.height) { this.feedHeights[id] = r.height; live.style.height = r.height + 'px'; }
        } else {
          live.style.display = 'none'; // рекламы нет — не оставляем пустую дыру
        }
      }
      positionShown(); // высоты слотов могли сдвинуть нижние карточки
    });
  },

  /* ---------------- БИБЛИОТЕКА ---------------- */
  endingsTotal(story) { return Object.values(story.scenes).filter(s => s.ending).length; },

  fmtDuration(min) {
    if (!min) return '';
    if (min < 60) return '~' + min + ' минут';
    const h = Math.round(min / 30) / 2;
    const hs = Number.isInteger(h) ? String(h) : String(h).replace('.', ',');
    return '~' + hs + (h === 1 ? ' час' : ' часа');
  },

  storyCard({ story, source }) {
    const p = Store.getProgress(story.id);
    const pct = p ? Math.min(100, Math.round(((p.visited || []).length / Object.keys(story.scenes).length) * 100)) : 0;
    const btn = document.createElement('button');
    btn.className = 'story-card';
    const coverImg = story.cover ? `<img src="${esc(story.cover)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    btn.innerHTML = `
      <div class="cover" style="background:${gradient(story.coverGradient)}">
        <span class="symbol">${esc(story.coverSymbol || '✦')}</span>${coverImg}
        ${p && p.completed ? '<div class="badge-done">ПРОЙДЕНО</div>' : ''}
      </div>
      <div class="story-meta">
        <div class="story-title">${esc(story.title)}</div>
        <div class="story-genre">${esc(story.genre || '')}${story.estimatedMinutes ? ' · ' + this.fmtDuration(story.estimatedMinutes) : ''}</div>
        <div class="story-desc">${esc(story.description)}</div>
        <div class="story-foot">
          ${p && !p.completed
            ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span class="progress-txt">${pct}%</span>`
            : `<span class="progress-txt">${p && p.completed
                ? `Финалов открыто: ${(p.endingsFound || []).length}/${this.endingsTotal(story)}`
                : `Сцен: ${Object.keys(story.scenes).length} · Финалов: ${this.endingsTotal(story)}`}</span>`}
        </div>
      </div>`;
    btn.addEventListener('click', () => this.openDetail(story.id));
    return btn;
  },

  /* Вкладки формата в начале библиотеки: короткие новеллы / длинные романы.
     Показываются только когда есть оба формата; счётчиков историй здесь нет. */
  renderLibTabs(hasShort, hasLong) {
    const tabs = $('#lib-tabs');
    if (!tabs) return;
    if (!hasShort || !hasLong) { tabs.innerHTML = ''; tabs.style.display = 'none'; return; }
    tabs.style.display = '';
    const mk = (val, label) => `<button data-fmt="${val}" class="${this.libFormat === val ? 'on' : ''}">${label}</button>`;
    tabs.innerHTML = mk('short', 'Короткие · 15–20 мин') + mk('long', 'Длинные · 1–2 часа');
    tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (this.libFormat === b.dataset.fmt) return;
      this.libFormat = b.dataset.fmt;
      Ads.hideAllFeedAds();
      this.renderLibrary();
    }));
  },

  renderLibrary() {
    const list = Loader.list();
    const wrap = $('#story-list');
    wrap.innerHTML = '';

    // «Продолжить чтение»
    const cont = list.filter(({ story }) => { const p = Store.getProgress(story.id); return p && !p.completed && (p.visited || []).length > 0; });
    const cb = $('#continue-block');
    cb.innerHTML = '';
    if (cont.length) {
      const h = document.createElement('h2'); h.className = 'h2'; h.textContent = 'Продолжить чтение'; cb.appendChild(h);
      cont.forEach(e => cb.appendChild(this.storyCard(e)));
    }

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (window.BUNDLED_BUILD) {
        empty.innerHTML = `<div class="big">❦</div><h3>Истории скоро появятся</h3><p>Мы уже готовим первые новеллы. Загляни чуть позже ♡</p>`;
      } else if (!this.storesLoaded && !Loader.fileProtocol) {
        empty.innerHTML = `<div class="big">❦</div><h3>Загружаем истории…</h3><p>Ищем папки историй в <code>stores/</code></p>`;
      } else if (Loader.fileProtocol) {
        empty.innerHTML = `<div class="big">❦</div><h3>Нужен локальный сервер</h3>
          <p>Страница открыта как файл (file://) — браузер в этом режиме запрещает читать папку <code>stores/</code>.<br><br>
          Запусти в папке проекта: <code>python3 -m http.server 8000</code><br>
          и открой <code>http://localhost:8000</code><br><br>
          В Android-сборке сервер не нужен: истории вшиты в приложение.</p>`;
      } else {
        empty.innerHTML = `<div class="big">❦</div><h3>Историй пока нет</h3>
          <p>Добавь в репозиторий папку истории — сюжет и фото вместе:<br>
          <code>stores/1/story.json</code> + картинки рядом,<br>
          затем <code>stores/2/</code>, <code>stores/3/</code>…<br><br>
          Формат описан в <code>STORY_FORMAT.md</code>, готовый промпт для генерации — в <code>PROMPT_FOR_AI.md</code>. После коммита пересобери приложение — история вшьётся в него.</p>`;
      }
      wrap.appendChild(empty);
    } else {
      const shorts = list.filter(e => e.story.format !== 'long');
      const longs = list.filter(e => e.story.format === 'long');
      if (!longs.length) this.libFormat = 'short';
      if (!shorts.length) this.libFormat = 'long';
      this.renderLibTabs(shorts.length > 0, longs.length > 0);
      const items = this.libFormat === 'long' ? longs : shorts;
      // Реклама — в потоке между карточками, места и блоки случайны в пределах сессии
      const plan = Meta.planFeedAds(items.length, this.feedSeed + ':' + this.libFormat);
      const byAfter = {};
      plan.forEach((p, i) => { byAfter[p.after] = { ...p, slot: 'feed-' + i }; });
      items.forEach((e, idx) => {
        wrap.appendChild(this.storyCard(e));
        const ad = byAfter[idx];
        if (ad && !this.feedDismissed[ad.slot]) wrap.appendChild(this.feedSlotEl(ad.slot, ad));
      });
    }
    this.renderDiagnostics();
    this.renderRefBanner();
    this.syncFeedAds();
  },

  renderDiagnostics() {
    const box = $('#library-diag');
    box.innerHTML = '';
    if (!Loader.diagnostics.length) return;
    const d = document.createElement('div');
    d.className = 'diag';
    const items = Loader.diagnostics.slice(0, 12)
      .map(x => `<li class="${x.kind === 'warning' ? 'warn' : ''}"><b>${esc(x.file)}</b> — ${esc(x.message)}</li>`).join('');
    const more = Loader.diagnostics.length > 12 ? `<li>…и ещё ${Loader.diagnostics.length - 12}</li>` : '';
    d.innerHTML = `<h4>Диагностика загрузки (${Loader.diagnostics.length})</h4><ul>${items}${more}</ul>`;
    box.appendChild(d);
  },

  /* ---------------- ДЕТАЛЬ ИСТОРИИ ---------------- */
  openDetail(id) {
    const story = Loader.get(id);
    if (!story) return;
    this.detailId = id;
    const cov = $('#detail-cover');
    cov.style.background = gradient(story.coverGradient);
    cov.querySelectorAll('img').forEach(i => i.remove());
    if (story.cover) {
      const img = document.createElement('img');
      img.src = story.cover; img.alt = '';
      img.onerror = () => img.remove();
      cov.insertBefore(img, cov.querySelector('.shade'));
    }
    $('#detail-genre').textContent = story.genre || '';
    $('#detail-title').textContent = story.title;
    $('#detail-desc').textContent = story.description;

    const paidCount = Object.values(story.scenes).reduce((n, s) => n + (s.choices || []).filter(c => c.crystals).length, 0);
    const chips = [
      story.format === 'long' ? 'Длинный роман' : null,
      story.estimatedMinutes ? this.fmtDuration(story.estimatedMinutes) : null,
      'Сцен: ' + Object.keys(story.scenes).length,
      'Финалов: ' + this.endingsTotal(story),
      paidCount ? `Особых выборов ◆: ${paidCount}` : null,
      ...(story.tags || []),
    ].filter(Boolean);
    $('#detail-chips').innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join('');

    const p = Store.getProgress(id);
    const found = p ? (p.endingsFound || []).length : 0;
    $('#detail-endings').innerHTML = `<span style="font-size:20px">✦</span><span>Открыто финалов: <b>${found} из ${this.endingsTotal(story)}</b>. За первое прохождение — <b>+${CONFIG.crystals.completeStory} ◆</b>, за каждый новый финал — <b>+${CONFIG.crystals.newEnding} ◆</b>.</span>`;

    const act = $('#detail-actions');
    act.innerHTML = '';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = label; b.style.marginBottom = '10px';
      b.addEventListener('click', fn); act.appendChild(b); return b;
    };
    if (!p || (!p.visited || !p.visited.length)) {
      mk('Начать читать', 'btn-primary', () => this.play(id, 'restart'));
    } else if (!p.completed) {
      const pct = Math.min(100, Math.round((p.visited.length / Object.keys(story.scenes).length) * 100));
      mk(`Продолжить · ${pct}%`, 'btn-primary', () => this.play(id, 'continue'));
      mk('Начать сначала', 'btn-ghost', async () => {
        if (await this.confirm('Начать сначала?', 'Текущий прогресс этой истории и купленные в ней выборы сбросятся. Открытые финалы сохранятся.', 'Сначала')) this.play(id, 'restart');
      });
    } else {
      mk('Пройти ещё раз', 'btn-primary', () => this.play(id, 'restart'));
    }

    this.go('detail');
  },

  /* ---------------- ПЛЕЕР ---------------- */
  setChoicesOpen(open) {
    $('#choices').classList.toggle('open', open);
    $('#stage').classList.toggle('choices-open', open);
  },
  async play(id, mode) {
    if (this._startingStory) return;
    this._startingStory = true;
    await Ads.showInterstitial(); // между новеллами; кулдаун и готовность — внутри Ads
    this._startingStory = false;
    const story = Loader.get(id);
    if (!story) return;
    $('#ending-ov').classList.remove('open');
    this.setChoicesOpen(false);
    this.go('player');
    Engine.open(story, mode);
    Meta.bump('opened'); // задание дня «открой историю»
    Ambient.sync();       // фоновая музыка — по жесту пользователя, как требуют браузеры
  },

  preloadBg(story, scene) {
    const targets = new Set();
    (scene.choices || []).forEach(c => targets.add(c.next));
    (scene.branch || []).forEach(b => targets.add(b.to));
    if (scene.next) targets.add(scene.next);
    targets.forEach(t => {
      const sc = story.scenes[t];
      if (!sc) return;
      if (sc.bg) { const i = new Image(); i.src = sc.bg; }
      (sc.show || []).forEach(cid => {
        const img = ((story.characters || {})[cid] || {}).image;
        if (img) { const i = new Image(); i.src = img; }
      });
    });
  },

  renderScene() {
    const story = Engine.story, sc = Engine.scene();
    $('#player-title').textContent = story.title;
    $('#player-progress').style.width = Engine.progressPct() + '%';
    this.setChoicesOpen(false);
    $('#ending-ov').classList.remove('open');

    const bg = $('#stage-bg');
    bg.style.background = gradient(sc.bgGradient || story.coverGradient);
    bg.innerHTML = '';
    if (sc.bg) {
      const img = document.createElement('img');
      img.src = sc.bg; img.alt = '';
      img.onerror = () => img.remove();
      bg.appendChild(img);
    }
    // персонажи
    const wrap = $('#chars');
    wrap.innerHTML = '';
    (sc.show || []).forEach(cid => {
      const ch = (story.characters || {})[cid];
      if (!ch) return;
      const div = document.createElement('div');
      div.className = 'char'; div.dataset.cid = cid;
      if (ch.image) {
        const img = document.createElement('img');
        img.src = ch.image; img.alt = ch.name || '';
        img.onerror = () => { img.remove(); div.appendChild(this.monogram(ch)); };
        div.appendChild(img);
      } else div.appendChild(this.monogram(ch));
      wrap.appendChild(div);
    });
    wrap.dataset.count = String(wrap.children.length || 1);
    WeatherFX.apply(WeatherFX.guess(sc));
    $('#player-auto').classList.toggle('active', !!Store.data.settings.autoPlay);
    this.preloadBg(story, sc);
  },

  monogram(ch) {
    const m = document.createElement('div');
    m.className = 'monogram';
    m.style.background = `linear-gradient(160deg, ${safeColor(ch.color) || '#8A6D4B'}, #2B2620)`;
    m.textContent = (ch.name || '?').trim().charAt(0).toUpperCase();
    return m;
  },

  renderLine(ln) {
    const story = Engine.story;
    const spk = $('#speaker'), txt = $('#dialogue-text');
    const ch = ln.who ? (story.characters || {})[ln.who] : null;
    if (ln.type === 'narration' || !ch) { spk.style.display = 'none'; }
    else {
      spk.style.display = 'block';
      spk.textContent = ch.name + (ln.type === 'thought' ? ' · мысли' : '');
      spk.style.color = safeColor(ch.color) || 'var(--accent-dark)';
    }
    txt.className = 'dialogue-text ' + (ln.type === 'narration' ? 'narration' : ln.type === 'thought' ? 'thought' : '');
    $('#dialogue').scrollTop = 0; // новая реплика всегда с начала, даже если прошлую прокручивали
    $('#dialogue-next').style.visibility = 'hidden';
    // Подсветка говорящего: учитываем эмоциональные варианты вида matvey_soft
    // (у них то же отображаемое имя, что у базового персонажа matvey).
    const speakerName = ch ? ch.name : null;
    $$('#chars .char').forEach(el => {
      const shown = (story.characters || {})[el.dataset.cid];
      const same = !ln.who || el.dataset.cid === ln.who || (!!speakerName && !!shown && shown.name === speakerName);
      el.classList.toggle('speaking', same);
    });
    Engine.startTyping(txt, String(ln.text));
    if (!Store.data.settings.typewriter) { $('#dialogue-next').style.visibility = 'visible'; this.scheduleAuto(); }
    $('#player-progress').style.width = Engine.progressPct() + '%';
  },

  renderChoices() {
    const sc = Engine.scene();
    const wrap = $('#choices');
    wrap.innerHTML = '';
    (sc.choices || []).forEach((ch, idx) => {
      const b = document.createElement('button');
      b.className = 'choice';
      const lockReason = Engine.checkRequires(ch);
      const paid = Engine.isPaid(ch, idx);
      const cost = ch.crystals || 0;
      if (lockReason) b.classList.add('locked');
      let right = '';
      if (cost > 0) right = paid
        ? `<span class="cost paid">✓ куплено</span>`
        : `<span class="cost">◆ ${cost}</span>`;
      b.innerHTML = `<span class="txt">${esc(ch.text)}${lockReason ? `<span class="lock-note">🔒 ${esc(lockReason)}</span>` : ''}</span>${right}`;
      b.addEventListener('click', () => Engine.choose(idx));
      wrap.appendChild(b);
    });
    this.setChoicesOpen(true);
  },

  renderEnding({ ending, notes, reward }) {
    this.endingReward = reward || 0;
    this.endingDoubled = false;
    const db = $('#ending-double');
    if (this.endingReward > 0) {
      db.style.display = 'flex';
      db.textContent = `▶ Реклама: удвоить награду · ещё +${this.endingReward} ◆`;
    } else db.style.display = 'none';
    this.setChoicesOpen(false);
    $('#ending-title').textContent = ending.title || 'Финал';
    $('#ending-badge').textContent = ending.badge || '';
    $('#ending-text').textContent = ending.text || '';
    $('#ending-rewards').innerHTML = (notes || []).map(n => `<div class="reward-line">◆ ${esc(n)}</div>`).join('')
      || '<div class="reward-line">Этот финал уже был открыт раньше</div>';
    $('#ending-ov').classList.add('open');
    this.renderGems(true);
  },

  renderLog() {
    const list = $('#log-list');
    list.innerHTML = '';
    const items = Engine.state ? Engine.state.log : [];
    if (!items.length) { list.innerHTML = '<p class="muted">Пока пусто.</p>'; return; }
    items.forEach(it => {
      const d = document.createElement('div');
      if (it.type === 'choice') { d.className = 'log-item choice-made'; d.textContent = '→ ' + it.text; }
      else {
        d.className = 'log-item';
        const ch = it.who && Engine.story.characters ? Engine.story.characters[it.who] : null;
        d.innerHTML = (ch ? `<span class="who" style="color:${safeColor(ch.color) || 'inherit'}">${esc(ch.name)}: </span>` : '') + esc(it.text);
      }
      list.appendChild(d);
    });
    list.scrollTop = list.scrollHeight;
  },

  /* ---------------- МАГАЗИН ---------------- */
  renderShop() {
    const c = CONFIG.crystals;
    const can = Ads.canWatch();
    const left = c.adDailyLimit - Store.data.ads.count;
    $('#ad-sub').textContent = `+${c.adReward} ◆ за просмотр. Осталось сегодня: ${Math.max(left, 0)} из ${c.adDailyLimit}.`;
    const adBtn = $('#ad-btn');
    adBtn.textContent = `+${c.adReward} ◆`;
    adBtn.disabled = !can.ok;
    adBtn.title = can.ok ? '' : can.reason;

    const dailyDone = Store.data.lastDaily === todayKey();
    const dailyAmount = Meta.dailyAmount();
    const streak = Meta.streakCount();
    $('#daily-sub').textContent = dailyDone
      ? `Сегодня бонус уже получен. Серия дней: ${streak}. Загляни завтра — серия вырастет.`
      : `+${dailyAmount} ◆ один раз в день — просто за вход.${streak > 1 ? ` Серия: ${streak} дн. подряд — бонус повышен.` : ' Заходи каждый день подряд — бонус будет расти.'}`;
    const dBtn = $('#daily-btn');
    dBtn.textContent = dailyDone ? 'Получено' : `+${dailyAmount} ◆`;
    dBtn.disabled = dailyDone;

    $('#complete-sub').textContent = `Первое прохождение истории: +${c.completeStory} ◆. Каждый новый финал: +${c.newEnding} ◆.`;
    $('#ref-shop-sub').textContent = `Друг по твоему приглашению получает +${CONFIG.referrals.newcomerBonus} ◆, а ты +${CONFIG.referrals.inviterBonus} ◆, когда он пройдёт первую историю.`;

    const led = $('#ledger');
    const items = [...(Store.data.ledger || [])].reverse().slice(0, 15);
    led.innerHTML = items.length ? items.map(x => `
      <div class="ledger-item"><span>${esc(x.reason)}<br><span class="muted small">${new Date(x.t).toLocaleString('ru-RU')}</span></span>
      <span class="d ${x.delta >= 0 ? 'plus' : 'minus'}">${x.delta >= 0 ? '+' : ''}${x.delta} ◆</span></div>`).join('')
      : '<p class="muted">Операций пока нет.</p>';
    this.renderGems(false);
  },

  /* Единый поток рекламы с вознаграждением.
     Android: настоящий ролик Яндекса (награда только за полный просмотр).
     Веб-разработка: демо-модалка с таймером. onReward вызывается максимум один раз. */
  async rewardedFlow(onReward) {
    this.closeModal('modal-need');
    if (Ads.isNative()) {
      this.toast('Загружаем рекламу…', 1500);
      const ok = await Ads.showRewardedNative();
      if (ok) { Meta.bump('ads'); onReward(); }
      else this.toast('Чтобы получить награду, досмотри рекламу до конца');
      return;
    }
    this.pendingRewardGrant = onReward;
    this.openModal('modal-ad');
    const claim = $('#ad-claim-btn');
    claim.disabled = true;
    claim.textContent = 'Подожди…';
    const total = CONFIG.crystals.adDurationSec;
    $('#ad-bar').style.width = '0%';
    const done = await Ads.showRewardedDemo(left => {
      $('#ad-countdown').textContent = left > 0 ? `Награда через ${left} сек` : 'Готово!';
      $('#ad-bar').style.width = Math.round(((total - left) / total) * 100) + '%';
    });
    if (done) { claim.disabled = false; claim.textContent = 'Забрать награду ◆'; }
  },

  grantShopAd() {
    Ads.registerWatch();
    Store.addCrystals(CONFIG.crystals.adReward, 'Просмотр рекламы');
    this.renderGems(true);
    this.toast(`+${CONFIG.crystals.adReward} ◆ за рекламу`);
    if (this.screen === 'shop') this.renderShop();
    if (this.pendingChoice && Store.data.crystals >= this.pendingChoice.cost) {
      const { idx } = this.pendingChoice;
      this.pendingChoice = null;
      Engine.choose(idx);
    }
  },

  watchAdFlow() {
    const can = Ads.canWatch();
    if (!can.ok) { this.toast(can.reason); return; }
    this.rewardedFlow(() => this.grantShopAd());
  },

  claimAd() {
    const grant = this.pendingRewardGrant;
    this.pendingRewardGrant = null;
    this.closeModal('modal-ad');
    if (grant) { Meta.bump('ads'); grant(); }
  },

  /* ---------------- ПРОФИЛЬ / РЕФЕРАЛЫ ---------------- */
  renderProfile() {
    $('#my-ref-code').textContent = Referrals.myCode();
    $('#my-ref-link').textContent = Referrals.myLink();
    $('#ref-rules').textContent = `Отправь другу приглашение кнопкой выше: по ссылке он скачает приложение в RuStore, введёт твой код в Профиле и сразу получит +${CONFIG.referrals.newcomerBonus} ◆. Когда он пройдёт свою первую историю до конца, тебе начисляется +${CONFIG.referrals.inviterBonus} ◆.`;
    const st = Referrals.stats();
    $('#ref-invited').textContent = st.invited;
    $('#ref-completed').textContent = st.completed;
    $('#ref-earned').textContent = st.earned + ' ◆';

    const u = Store.data.user;
    $('#claim-card').style.display = u.refClaimed ? 'none' : 'block';
    $('#claim-note').textContent = u.referredBy ? '' : '';
    $('#profile-id-line').textContent = `ID игрока: ${u.id}${u.referredBy ? ` · приглашён по коду ${u.referredBy}` : ''}`;

    this.notifyAchievements(Meta.checkAchievements());
    this.renderQuests();

    // настройки чтения
    const cfg = Store.data.settings;
    const speedKey = !cfg.typewriter ? 'instant' : (cfg.typeMs >= 24 ? 'slow' : (cfg.typeMs && cfg.typeMs <= 8 ? 'fast' : 'normal'));
    $$('#seg-speed button').forEach(b => b.classList.toggle('active', b.dataset.speed === speedKey));
    $$('#seg-font button').forEach(b => b.classList.toggle('active', b.dataset.font === (cfg.fontSize || 'm')));
    $('#autoplay-toggle').textContent = cfg.autoPlay ? 'Вкл' : 'Выкл';
    $('#music-toggle').textContent = cfg.music ? 'Вкл' : 'Выкл';
    $('#weather-toggle').textContent = cfg.weatherFx ? 'Вкл' : 'Выкл';
    $('#notify-toggle').textContent = cfg.notify ? 'Вкл' : 'Выкл';
    if (!Notify.available()) $('#notify-sub').textContent = 'Напоминание вечером: ежедневные кристаллы и задания. Работает в Android-приложении.';
  },

  renderQuests() {
    const box = $('#quests-box'); if (!box) return;
    const qs = Meta.todayQuests();
    box.innerHTML = `<p class="muted small" style="margin-bottom:4px">Серия дней: <b>${Meta.streakCount()}</b> · задания обновятся завтра</p>` + qs.map(q => {
      const st = Meta.questState(q);
      const btn = st.claimed
        ? `<button class="mini-btn" disabled>Получено</button>`
        : st.done
          ? `<button class="mini-btn accent" data-quest="${q.id}">+${q.reward} ◆</button>`
          : `<span class="muted" style="font-weight:700">${st.cur}/${q.goal}</span>`;
      return `<div class="quest-row"><div class="quest-ic">${q.icon}</div>
        <div class="grow" style="flex:1;min-width:0"><div class="row-title">${esc(q.title)}</div><div class="row-sub">${esc(q.desc)}</div>
        <div class="mini-track"><div class="mini-fill" style="width:${Math.round((st.cur / q.goal) * 100)}%"></div></div></div>${btn}</div>`;
    }).join('');
  },

  renderAchievements() {
    const box = $('#ach-box'); if (!box) return;
    const ach = Store.data.meta.ach || {};
    box.innerHTML = Meta.ACHIEVEMENTS.map(a => {
      let p = { cur: 0, max: 1 }; try { p = a.progress(); } catch (e) {}
      const got = !!ach[a.id];
      const cur = Math.min(p.cur, p.max);
      return `<div class="ach-row ${got ? 'done' : 'locked'}"><div class="ach-ic">${a.icon}</div>
        <div class="grow" style="flex:1;min-width:0"><div class="row-title">${esc(a.title)}</div><div class="row-sub">${esc(a.desc)}</div>
        ${got ? '' : `<div class="mini-track"><div class="mini-fill" style="width:${Math.round((cur / p.max) * 100)}%"></div></div>`}</div>
        <span class="${got ? '' : 'muted'}" style="font-weight:700;white-space:nowrap">${got ? `✓ +${a.reward} ◆` : `${cur}/${p.max}`}</span></div>`;
    }).join('');
  },

  notifyAchievements(fresh) {
    if (!fresh || !fresh.length) return;
    if (fresh.length === 1) this.toast(`✦ Достижение «${fresh[0].title}» · +${fresh[0].reward} ◆`, 3200);
    else this.toast(`✦ Достижений открыто: ${fresh.length} · +${fresh.reduce((n, a) => n + a.reward, 0)} ◆`, 3200);
    this.renderGems(true);
  },

  /* ---------------- ПОЛКА ФИНАЛОВ ---------------- */
  renderShelf() {
    this.renderAchievements(); // достижения живут на «Полке», отдельно от рефералов в Профиле
    const opened = Meta.endingsOpened(), total = Meta.endingsTotalAll();
    $('#shelf-total').textContent = `✦ ${opened} из ${total}`;
    const wrap = $('#shelf-list');
    wrap.innerHTML = '';
    Loader.list().forEach(({ story }) => {
      const ends = Object.entries(story.scenes).filter(([, s]) => s.ending)
        .map(([id, s]) => ({ id, title: s.ending.title, badge: s.ending.badge }));
      const found = (Store.getProgress(story.id) || {}).endingsFound || [];
      const card = document.createElement('button');
      card.className = 'shelf-card';
      card.dataset.openStory = story.id;
      const coverImg = story.cover ? `<img src="${esc(story.cover)}" alt="" loading="lazy" onerror="this.remove()">` : '';
      card.innerHTML = `
        <div class="shelf-cover" style="background:${gradient(story.coverGradient)}"><span class="symbol">${esc(story.coverSymbol || '✦')}</span>${coverImg}</div>
        <div style="flex:1;min-width:0">
          <div class="story-title">${esc(story.title)}</div>
          <div class="story-genre">${story.format === 'long' ? 'Длинный роман · ' : ''}открыто ${found.length} из ${ends.length}</div>
          <div class="shelf-ends">${ends.map(e => found.includes(e.id)
            ? `<span class="end-chip open">✓ ${esc(e.title || 'Финал')}${e.badge ? ` · ${esc(e.badge)}` : ''}</span>`
            : `<span class="end-chip locked">🔒 ? ? ?${e.badge ? ` · ${esc(e.badge)}` : ''}</span>`).join('')}</div>
        </div>`;
      wrap.appendChild(card);
    });
    if (!wrap.children.length) wrap.innerHTML = '<div class="empty"><div class="big">✦</div><h3>Истории ещё загружаются</h3></div>';
  },

  /* ---------------- СОХРАНЕНИЯ-ЗАКЛАДКИ ---------------- */
  renderSaves() {
    const story = Engine.story; if (!story) return;
    const saves = Meta.listSaves(story.id);
    const total = Meta.slotsTotal();
    const list = $('#saves-list');
    let html = '';
    for (let i = 0; i < total; i++) {
      const sv = saves[i];
      html += `<div class="save-slot"><div class="grow">
        <div class="lbl">${sv ? esc(sv.label) : 'Пустой слот'}</div>
        <div class="muted small">${sv ? new Date(sv.ts).toLocaleString('ru-RU') : 'Сюда можно поставить закладку'}</div></div>
        ${sv ? `<button class="mini-btn accent" data-save-load="${i}">Открыть</button>` : ''}
        <button class="mini-btn" data-save-put="${i}">${sv ? 'Перезаписать' : 'Сохранить'}</button>
        ${sv ? `<button class="mini-btn" data-save-del="${i}" aria-label="Удалить">✕</button>` : ''}</div>`;
    }
    if (Meta.canBuySlot()) html += `<button class="btn btn-ghost" data-save-buy="1" style="margin-top:4px">+ Дополнительный слот · ${CONFIG.meta.extraSlotPrice} ◆</button>`;
    else html += `<p class="muted small" style="margin-top:4px">Слотов: ${total} — это максимум.</p>`;
    list.innerHTML = html;
  },

  putCurrentSave(idx) {
    const story = Engine.story, state = Engine.state; if (!story || !state) return;
    const snap = JSON.parse(JSON.stringify(state));
    snap.log = (snap.log || []).slice(-200);
    Meta.putSave(story.id, idx, `${story.title} · ${Engine.progressPct()}%`, snap);
    this.toast('Закладка сохранена ⚑');
    this.renderSaves();
  },

  loadSave(idx) {
    const story = Engine.story; if (!story) return;
    const sv = Meta.listSaves(story.id)[idx]; if (!sv) return;
    Engine.stopTyping();
    this.clearAuto();
    Engine.state = JSON.parse(JSON.stringify(sv.snap));
    if (!Engine.state.seen) Engine.state.seen = (Engine.state.visited || []).slice();
    Engine.seenBefore = new Set([...(Engine.state.seen || []), ...(Engine.state.visited || [])]);
    Engine.persist();
    Engine.render();
    if (Engine.scenePhase() === 'choices-ready' && !Store.data.settings.typewriter) this.renderChoices();
    this.closeModal('modal-saves');
    this.toast('Сохранение загружено');
  },

  /* ---------------- АВТОЧТЕНИЕ ---------------- */
  scheduleAuto() {
    this.clearAuto();
    if (!Store.data.settings.autoPlay || this.screen !== 'player') return;
    if ($('#choices').classList.contains('open') || $('#ending-ov').classList.contains('open') || $('.modal-ov.open')) return;
    this.autoTimer = setTimeout(() => {
      if (this.screen === 'player' && !$('#choices').classList.contains('open') && !$('#ending-ov').classList.contains('open') && !$('.modal-ov.open')) Engine.advance();
    }, CONFIG.meta.autoDelayMs);
  },
  clearAuto() { if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; } },

  applyReadSettings() {
    document.body.dataset.font = Store.data.settings.fontSize || 'm';
  },

  /* ---------------- ЗАПРОС ОЦЕНКИ ---------------- */
  showRatePrompt() {
    this._rateStars = 0;
    $$('#rate-stars button').forEach(b => b.classList.remove('on'));
    $('#rate-actions').innerHTML = '';
    this.openModal('modal-rate');
  },

  ratePick(n) {
    this._rateStars = n;
    $$('#rate-stars button').forEach(b => b.classList.toggle('on', +b.dataset.star <= n));
    const act = $('#rate-actions');
    if (n >= 4) {
      act.innerHTML = '<button class="btn btn-accent" id="rate-go">Оценить в RuStore ♡</button>';
      $('#rate-go').addEventListener('click', () => {
        Meta.rateAnswered('rated');
        this.closeModal('modal-rate');
        this.copyText(CONFIG.referrals.storeUrl, 'Спасибо! Ссылка на страницу приложения скопирована');
        try { window.open(CONFIG.referrals.storeUrl, '_blank'); } catch (e) {}
      });
    } else {
      act.innerHTML = '<p class="muted" style="margin:6px 0 10px">Спасибо за честность! Мы стараемся делать истории лучше.</p><button class="btn btn-primary" id="rate-thanks">Хорошо</button>';
      $('#rate-thanks').addEventListener('click', () => { Meta.rateAnswered('later'); this.closeModal('modal-rate'); });
    }
  },

  renderRefBanner() {
    const banner = $('#ref-banner');
    const show = this.pendingRef && !Store.data.user.refClaimed;
    banner.classList.toggle('open', !!show);
    if (show) $('#ref-banner-text').textContent = `По коду ${this.pendingRef} тебе положен бонус новичка: +${CONFIG.referrals.newcomerBonus} ◆ на особые выборы.`;
  },

  claimRef(code) {
    const r = Referrals.claim(code);
    if (r.ok) {
      this.toast(`+${CONFIG.referrals.newcomerBonus} ◆ — бонус новичка получен`);
      this.pendingRef = null;
      this.renderGems(true);
    } else this.toast(r.reason);
    this.renderLibrary(); this.renderProfile();
    return r.ok;
  },

  async copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); this.toast(okMsg); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); this.toast(okMsg); } catch (_) { this.toast('Не удалось скопировать — скопируй вручную'); }
      ta.remove();
    }
  },

  /* ---------------- ИНИЦИАЛИЗАЦИЯ ---------------- */
  bind() {
    document.addEventListener('click', e => {
      const goEl = e.target.closest('[data-go]');
      if (goEl) { this.go(goEl.dataset.go); return; }
      const qBtn = e.target.closest('[data-quest]');
      if (qBtn) {
        if (Meta.claimQuest(qBtn.dataset.quest)) {
          this.toast('Задание выполнено · награда получена ◆');
          this.renderGems(true);
          this.notifyAchievements(Meta.checkAchievements());
          this.renderProfile();
        }
        return;
      }
      const openStory = e.target.closest('[data-open-story]');
      if (openStory) { this.openDetail(openStory.dataset.openStory); return; }
      const savePut = e.target.closest('[data-save-put]');
      if (savePut) { this.putCurrentSave(+savePut.dataset.savePut); return; }
      const saveLoad = e.target.closest('[data-save-load]');
      if (saveLoad) { this.loadSave(+saveLoad.dataset.saveLoad); return; }
      const saveDel = e.target.closest('[data-save-del]');
      if (saveDel) { Meta.deleteSave(Engine.story.id, +saveDel.dataset.saveDel); this.renderSaves(); return; }
      const saveBuy = e.target.closest('[data-save-buy]');
      if (saveBuy) {
        if (Meta.buySlot()) { this.toast('Новый слот сохранения открыт ⚑'); this.renderGems(true); }
        else this.toast(`Не хватает кристаллов: слот стоит ${CONFIG.meta.extraSlotPrice} ◆`);
        this.renderSaves();
        return;
      }
      const closeEl = e.target.closest('[data-close]');
      if (closeEl) {
        this.closeModal(closeEl.dataset.close);
        if (closeEl.dataset.close === 'modal-confirm' && this.confirmResolve) { this.confirmResolve(false); this.confirmResolve = null; }
        return;
      }
    });
    // кристаллы-пилюли в плеере открывают «где взять», остальные ведут в магазин (data-go выше)
    $$('.js-gems').forEach(b => b.addEventListener('click', () => {
      if (this.screen === 'player' && !b.dataset.go) {
        $('#need-text').textContent = `Твой баланс: ${Store.data.crystals} ◆. Особые выборы открывают дополнительные сцены и финалы.`;
        this.pendingChoice = null;
        this.openModal('modal-need');
      }
    }));
    document.addEventListener('crystals-changed', () => this.renderGems(false));

    // рекламные вью следуют за своими слотами при скролле библиотеки
    const libScroll = $('#screen-library .scroll');
    if (libScroll) libScroll.addEventListener('scroll', () => this.syncFeedAds(), { passive: true });
    window.addEventListener('resize', () => { this.syncFeedAds(); WeatherFX._resize(); });

    // плеер
    $('#dialogue').addEventListener('click', () => { this.clearAuto(); Engine.advance(); });
    $('#stage').addEventListener('click', e => {
      if ($('#choices').classList.contains('open') || $('#ending-ov').classList.contains('open')) return;
      if (e.target === $('#stage') || e.target.closest('#stage-bg') || e.target.closest('.stage-shade')) { this.clearAuto(); Engine.advance(); }
    });
    document.addEventListener('keydown', e => {
      if (this.screen === 'player' && (e.code === 'Space' || e.code === 'Enter') && !$('#choices').classList.contains('open')) {
        e.preventDefault(); this.clearAuto(); Engine.advance();
      }
    });
    $('#player-skip').addEventListener('click', () => {
      this.clearAuto();
      if (!Engine.skipRead()) this.toast('Дальше — ещё не прочитанное ♡');
    });
    $('#player-auto').addEventListener('click', () => {
      const st = Store.data.settings;
      st.autoPlay = !st.autoPlay; Store.save();
      $('#player-auto').classList.toggle('active', st.autoPlay);
      this.toast(st.autoPlay ? 'Авточтение включено — листаю сама' : 'Авточтение выключено');
      if (st.autoPlay) this.scheduleAuto(); else this.clearAuto();
    });
    $('#player-saves').addEventListener('click', () => { this.renderSaves(); this.openModal('modal-saves'); });
    $('#player-exit').addEventListener('click', () => this.go('library'));
    $('#player-log').addEventListener('click', () => { this.renderLog(); this.openModal('modal-log'); });
    $('#ending-again').addEventListener('click', () => { $('#ending-ov').classList.remove('open'); Engine.open(Engine.story, 'restart'); });
    $('#ending-library').addEventListener('click', async () => {
      $('#ending-ov').classList.remove('open');
      await Ads.showInterstitial(); // при окончании истории — естественная пауза
      this.go('library');
    });
    $('#ending-double').addEventListener('click', () => {
      if (this.endingDoubled || !this.endingReward) return;
      this.rewardedFlow(() => {
        this.endingDoubled = true;
        Store.addCrystals(this.endingReward, 'Удвоение награды за финал ×2');
        $('#ending-double').style.display = 'none';
        const line = document.createElement('div');
        line.className = 'reward-line';
        line.textContent = `◆ Награда удвоена: ещё +${this.endingReward} ◆`;
        $('#ending-rewards').appendChild(line);
        this.renderGems(true);
      });
    });

    // магазин
    $('#ad-btn').addEventListener('click', () => this.watchAdFlow());
    $('#ad-claim-btn').addEventListener('click', () => this.claimAd());
    $('#daily-btn').addEventListener('click', () => {
      if (Store.data.lastDaily === todayKey()) return;
      Store.data.lastDaily = todayKey(); Store.save();
      const amount = Meta.dailyAmount(); const streak = Meta.streakCount();
      Store.addCrystals(amount, streak > 1 ? `Ежедневный бонус (серия ${streak})` : 'Ежедневный бонус');
      this.toast(`+${amount} ◆ — ежедневный бонус${streak > 1 ? ` · серия ${streak} дн.` : ''}`);
      this.renderGems(true); this.renderShop();
      this.notifyAchievements(Meta.checkAchievements());
    });
    $('#need-ad-btn').addEventListener('click', () => this.watchAdFlow());
    $('#need-shop-btn').addEventListener('click', () => { this.closeModal('modal-need'); this.go('shop'); });

    // профиль
    $('#copy-code-btn').addEventListener('click', () => this.copyText(Referrals.myCode(), 'Код скопирован'));
    $('#copy-link-btn').addEventListener('click', () => this.copyText(Referrals.myInviteText(), 'Приглашение скопировано — отправь его другу'));
    $('#claim-btn').addEventListener('click', () => this.claimRef($('#claim-input').value));
    $('#ref-banner-btn').addEventListener('click', () => this.claimRef(this.pendingRef));
    // настройки чтения
    $('#seg-speed').addEventListener('click', e => {
      const b = e.target.closest('[data-speed]'); if (!b) return;
      const st = Store.data.settings;
      const map = { instant: { tw: false, ms: null }, fast: { tw: true, ms: 6 }, normal: { tw: true, ms: 14 }, slow: { tw: true, ms: 28 } };
      const v = map[b.dataset.speed]; if (!v) return;
      st.typewriter = v.tw; st.typeMs = v.ms; Store.save();
      this.renderProfile();
    });
    $('#seg-font').addEventListener('click', e => {
      const b = e.target.closest('[data-font]'); if (!b) return;
      Store.data.settings.fontSize = b.dataset.font; Store.save();
      this.applyReadSettings(); this.renderProfile();
    });
    $('#autoplay-toggle').addEventListener('click', () => {
      Store.data.settings.autoPlay = !Store.data.settings.autoPlay; Store.save();
      if (!Store.data.settings.autoPlay) this.clearAuto();
      this.renderProfile();
    });
    $('#music-toggle').addEventListener('click', () => {
      Store.data.settings.music = !Store.data.settings.music; Store.save();
      Ambient.sync(); this.renderProfile();
    });
    $('#weather-toggle').addEventListener('click', () => {
      Store.data.settings.weatherFx = !Store.data.settings.weatherFx; Store.save();
      this.renderProfile();
    });
    $('#notify-toggle').addEventListener('click', async () => {
      const st = Store.data.settings;
      st.notify = !st.notify; Store.save();
      if (st.notify) {
        if (!Notify.available()) this.toast('Уведомления работают в Android-приложении');
        else if (!await Notify.sync(true)) { st.notify = false; Store.save(); this.toast('Разреши уведомления в настройках телефона'); }
        else this.toast('Уведомления включены: напоминание в 19:00 ◆');
      } else {
        Notify.sync(false);
        this.toast('Уведомления выключены');
      }
      this.renderProfile();
    });
    // запрос оценки
    $$('#rate-stars button').forEach(b => b.addEventListener('click', () => this.ratePick(+b.dataset.star)));
    $('#rate-later').addEventListener('click', () => { Meta.rateAnswered('later'); this.closeModal('modal-rate'); });
    $('#reset-all-btn').addEventListener('click', async () => {
      if (await this.confirm('Сбросить всё?', 'Кристаллы, прогресс всех историй и твой реферальный код будут удалены безвозвратно.', 'Сбросить всё')) {
        Store.resetAll(); location.href = location.pathname;
      }
    });

    // confirm
    $('#confirm-yes').addEventListener('click', () => {
      this.closeModal('modal-confirm');
      if (this.confirmResolve) { this.confirmResolve(true); this.confirmResolve = null; }
    });
    $('#modal-confirm').addEventListener('click', e => {
      if (e.target.id === 'modal-confirm' && this.confirmResolve) { this.confirmResolve(false); this.confirmResolve = null; }
    });

    // события движка
    Engine.onEvent = (type, payload) => {
      if (type === 'render-scene') this.renderScene();
      if (type === 'render-line') this.renderLine(payload);
      if (type === 'line-read') {
        Meta.bump('lines');
        if (Store.data.meta.lifetime.lines % 25 === 0) this.notifyAchievements(Meta.checkAchievements());
      }
      if (type === 'choice-made') {
        Meta.bump('choices');
        if (payload && payload.paid) Meta.bump('paidChoices');
        this.notifyAchievements(Meta.checkAchievements());
      }
      if (type === 'typing-done') { $('#dialogue-next').style.visibility = 'visible'; this.scheduleAuto(); }
      if (type === 'show-choices') this.renderChoices();
      if (type === 'ending') {
        Meta.bump('endings');
        this.clearAuto();
        this.renderEnding(payload);
        const fresh = Meta.checkAchievements();
        setTimeout(() => this.notifyAchievements(fresh), 700);
        // момент восторга после финала — лучшее время попросить оценку
        if (payload.reward > 0 && Meta.shouldAskRate()) {
          setTimeout(() => { if (!$('.modal-ov.open')) this.showRatePrompt(); }, 1800);
        }
      }
      if (type === 'stat-change') payload.forEach((c, i) => setTimeout(() => this.toast(c, 1800), i * 350));
      if (type === 'locked') this.toast('🔒 ' + payload);
      if (type === 'crystals-spent') { this.renderGems(true); }
      if (type === 'need-crystals') {
        this.pendingChoice = payload;
        $('#need-text').textContent = `Этот выбор стоит ${payload.cost} ◆, у тебя сейчас ${Store.data.crystals} ◆. Посмотри короткую рекламу — или получи кристаллы другим способом, и выбор совершится автоматически.`;
        $('#need-ad-btn').textContent = `▶ Посмотреть рекламу · +${CONFIG.crystals.adReward} ◆`;
        this.openModal('modal-need');
      }
    };
  },

  async init() {
    Store.load();
    Meta.touchDaily();        // серия дней + задания на сегодня
    this.bind();
    this.applyReadSettings();
    Notify.init();            // освежить расписание уведомлений, если включены
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      Meta.touchDaily();      // день мог смениться, пока приложение было открыто
      if (Ambient.started && Ambient.ctx && Ambient.ctx.state === 'suspended') Ambient.ctx.resume();
    });
    this.renderGems(false);

    // стартовый бонус в историю операций + приветствие (один раз)
    if (!Store.data.ledger.length) {
      Store.data.ledger.push({ t: Date.now(), delta: CONFIG.crystals.startBonus, reason: 'Стартовый бонус' });
      Store.save();
    }

    // реферальная ссылка ?ref=NV-XXXXXX
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && ref.trim().toUpperCase() !== Store.data.user.refCode && !Store.data.user.refClaimed) {
      this.pendingRef = ref.trim().toUpperCase();
    }

    Ads.init(); // Яндекс: инициализация + предзагрузка interstitial/rewarded (Android)
    this.feedSeed = Store.data.user.id + ':' + Date.now(); // раскладка рекламы в ленте на эту сессию
    Ads.onFeedClosed = id => {
      this.feedDismissed[id] = true;
      const s = document.querySelector(`.ad-slot[data-slot="${id}"]`);
      if (s) s.style.display = 'none';
    };
    Ads.onFeedResized = (id, h) => {
      this.feedHeights[id] = h;
      const s = document.querySelector(`.ad-slot[data-slot="${id}"]`);
      if (s) s.style.height = h + 'px';
      this.syncFeedAds();
    };

    // Android-сборка: истории вшиты (офлайн);
    // веб-разработка: stores/N/story.json подгружаются по сети по мере готовности
    if (Loader.loadBundled()) {
      this.storesLoaded = true;
      this.renderLibrary();
      this.notifyAchievements(Meta.checkAchievements());
    } else {
      this.renderLibrary();
      Loader.loadFromStores(() => { if (this.screen === 'library') this.renderLibrary(); })
        .then(() => { this.storesLoaded = true; if (this.screen === 'library') this.renderLibrary(); this.notifyAchievements(Meta.checkAchievements()); })
        .catch(() => { this.storesLoaded = true; if (this.screen === 'library') this.renderLibrary(); });
    }

    // Аппаратная кнопка «Назад» на Android (Capacitor): сначала закрываем
    // модалки и возвращаемся по экранам, выход — только с библиотеки.
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        const openModal = $('.modal-ov.open');
        if (openModal) { openModal.classList.remove('open'); return; }
        if ($('#ending-ov').classList.contains('open')) { this.go('library'); return; }
        if (this.screen === 'player' || this.screen === 'detail') { this.go('library'); return; }
        if (this.screen !== 'library') { this.go('library'); return; }
        window.Capacitor.Plugins.App.exitApp();
      });
    }

    if (!Store.data.welcomeShown) {
      Store.data.welcomeShown = true; Store.save();
      $('#welcome-text').innerHTML = `Тебе начислен стартовый бонус: <b>+${CONFIG.crystals.startBonus} ◆</b>.<br><br>Кристаллы открывают особые выборы и сцены. Их можно получать за просмотр рекламы, прохождение историй, ежедневный вход и приглашение друзей.`;
      this.openModal('modal-welcome');
    }
    this.renderRefBanner();
  },
};

document.addEventListener('DOMContentLoaded', () => UI.init());
