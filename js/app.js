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

const UI = {
  screen: 'library',
  detailId: null,
  pendingChoice: null,   // {idx, cost} — выбор, на который не хватило кристаллов
  pendingRewardGrant: null, // колбэк начисления для демо-рекламы в веб-режиме
  endingReward: 0,       // награда текущего финала — база для удвоения ×2
  endingDoubled: false,
  _startingStory: false,
  nativeDismissedSession: false,
  nativeHeight: 0,         // высота нативной карточки (dp) для резерва слота
  _nativeSyncQueued: false,
  pendingRef: null,
  confirmResolve: null,
  storesLoaded: false,

  /* ---------------- навигация ---------------- */
  go(name) {
    this.screen = name;
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === 'screen-' + name));
    $('#tabbar').style.display = (name === 'player' || name === 'detail') ? 'none' : 'flex';
    $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    this.updateNativeSlot(name);
    if (name === 'library') this.renderLibrary();
    if (name === 'shop') this.renderShop();
    if (name === 'profile') this.renderProfile();
    if (name !== 'player') Engine.stopTyping();
    window.scrollTo(0, 0);
  },

  toast(text, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  },

  openModal(id) {
    // нативная карточка — Android-вью поверх WebView: под модалкой видимой не держим
    const slot = $('#native-ad-slot');
    if (slot) Ads.positionNative(slot.getBoundingClientRect(), false);
    $('#' + id).classList.add('open');
  },
  closeModal(id) {
    $('#' + id).classList.remove('open');
    if (this.screen === 'library' && !$('.modal-ov.open')) this.syncNativePosition();
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

  /* Нативная реклама R-M-…-3: слот стоит В ПОТОКЕ между карточками историй
     (создаётся в renderLibrary после первой истории) и ничего не перекрывает.
     В Android настоящая карточка плагина ложится точно поверх слота и едет
     за ним при скролле; в веб-разработке в слоте — визуальная заглушка.
     Уход с экрана библиотеки карточку уничтожает (на возврате — свежая). */
  updateNativeSlot(name) {
    if (name !== 'library') { Ads.hideNative(); return; }
    this.syncNativePosition();
  },

  /* Слот нативной рекламы для списка историй. */
  nativeSlotEl() {
    const slot = document.createElement('div');
    slot.id = 'native-ad-slot';
    slot.className = 'native-slot';
    if (Ads.isNative()) {
      slot.style.height = (this.nativeHeight || 300) + 'px';
    } else {
      slot.innerHTML = `<div class="native-demo"><span class="native-demo-tag">Реклама</span>
        <div class="native-demo-title">Нативная карточка Яндекса</div>
        <div class="muted small">В Android-приложении здесь настоящий блок ${CONFIG.ads.native}. В веб-режиме — только место размещения.</div></div>`;
    }
    return slot;
  },

  /* Подгоняет Android-карточку под текущее положение слота (скролл/resize/рендер/модалки). */
  syncNativePosition() {
    if (!Ads.isNative() || this._nativeSyncQueued) return;
    this._nativeSyncQueued = true;
    requestAnimationFrame(async () => {
      this._nativeSyncQueued = false;
      if (this.screen !== 'library' || this.nativeDismissedSession) return;
      const slot = $('#native-ad-slot');
      if (!slot) { Ads.hideNative(); return; }
      const rect = slot.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < window.innerHeight && !$('.modal-ov.open');
      if (!Ads.isNativeShown()) {
        if (!inView) return; // слот за экраном — рекламу впустую не грузим
        const r = await Ads.showNative(rect);
        if (this.screen !== 'library') { Ads.hideNative(); return; } // ушли с экрана, пока грузилась
        const live = $('#native-ad-slot'); // слот мог пересоздаться перерендером за время загрузки
        if (!live) return;
        if (r.shown) {
          if (r.height && r.height !== this.nativeHeight) {
            this.nativeHeight = r.height;
            live.style.height = r.height + 'px';
          }
          this.syncNativePosition(); // высота слота могла сдвинуть его позицию
        } else {
          live.style.display = 'none'; // рекламы нет — не оставляем пустую дыру
        }
        return;
      }
      Ads.positionNative(rect, inView);
    });
  },

  /* ---------------- БИБЛИОТЕКА ---------------- */
  endingsTotal(story) { return Object.values(story.scenes).filter(s => s.ending).length; },

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
        <div class="story-genre">${esc(story.genre || '')}${story.estimatedMinutes ? ` · ~${story.estimatedMinutes} мин` : ''}</div>
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
      list.forEach((e, i) => {
        wrap.appendChild(this.storyCard(e));
        // Нативная реклама — между историями: слот в потоке после первой карточки
        if (i === 0 && !this.nativeDismissedSession) wrap.appendChild(this.nativeSlotEl());
      });
    }
    this.renderDiagnostics();
    this.renderRefBanner();
    this.syncNativePosition();
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
      story.estimatedMinutes ? '~' + story.estimatedMinutes + ' минут' : null,
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
    if (!Store.data.settings.typewriter) $('#dialogue-next').style.visibility = 'visible';
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
    $('#daily-sub').textContent = dailyDone ? 'Сегодня бонус уже получен. Загляни завтра.' : `+${c.dailyBonus} ◆ один раз в день — просто за вход.`;
    const dBtn = $('#daily-btn');
    dBtn.textContent = dailyDone ? 'Получено' : `+${c.dailyBonus} ◆`;
    dBtn.disabled = dailyDone;

    $('#complete-sub').textContent = `Первое прохождение истории: +${c.completeStory} ◆. Каждый новый финал: +${c.newEnding} ◆.`;
    $('#ref-shop-sub').textContent = `Друг по твоей ссылке получает +${CONFIG.referrals.newcomerBonus} ◆, а ты +${CONFIG.referrals.inviterBonus} ◆, когда он пройдёт первую историю.`;

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
      if (ok) onReward();
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
    if (grant) grant();
  },

  /* ---------------- ПРОФИЛЬ / РЕФЕРАЛЫ ---------------- */
  renderProfile() {
    $('#my-ref-code').textContent = Referrals.myCode();
    $('#my-ref-link').textContent = Referrals.myLink();
    $('#ref-rules').textContent = `Друг переходит по ссылке или вводит твой код и сразу получает +${CONFIG.referrals.newcomerBonus} ◆. Когда он пройдёт свою первую историю до конца, тебе начисляется +${CONFIG.referrals.inviterBonus} ◆.`;
    const st = Referrals.stats();
    $('#ref-invited').textContent = st.invited;
    $('#ref-completed').textContent = st.completed;
    $('#ref-earned').textContent = st.earned + ' ◆';

    const u = Store.data.user;
    $('#claim-card').style.display = u.refClaimed ? 'none' : 'block';
    $('#claim-note').textContent = u.referredBy ? '' : '';
    $('#typewriter-toggle').textContent = Store.data.settings.typewriter ? 'Вкл' : 'Выкл';
    $('#profile-id-line').textContent = `ID игрока: ${u.id}${u.referredBy ? ` · приглашён по коду ${u.referredBy}` : ''}`;
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

    // нативная реклама следует за слотом при скролле библиотеки
    const libScroll = $('#screen-library .scroll');
    if (libScroll) libScroll.addEventListener('scroll', () => this.syncNativePosition(), { passive: true });
    window.addEventListener('resize', () => this.syncNativePosition());

    // плеер
    $('#dialogue').addEventListener('click', () => Engine.advance());
    $('#stage').addEventListener('click', e => {
      if ($('#choices').classList.contains('open') || $('#ending-ov').classList.contains('open')) return;
      if (e.target === $('#stage') || e.target.closest('#stage-bg') || e.target.closest('.stage-shade')) Engine.advance();
    });
    document.addEventListener('keydown', e => {
      if (this.screen === 'player' && (e.code === 'Space' || e.code === 'Enter') && !$('#choices').classList.contains('open')) {
        e.preventDefault(); Engine.advance();
      }
    });
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
      Store.addCrystals(CONFIG.crystals.dailyBonus, 'Ежедневный бонус');
      this.toast(`+${CONFIG.crystals.dailyBonus} ◆ — ежедневный бонус`);
      this.renderGems(true); this.renderShop();
    });
    $('#need-ad-btn').addEventListener('click', () => this.watchAdFlow());
    $('#need-shop-btn').addEventListener('click', () => { this.closeModal('modal-need'); this.go('shop'); });

    // профиль
    $('#copy-code-btn').addEventListener('click', () => this.copyText(Referrals.myCode(), 'Код скопирован'));
    $('#copy-link-btn').addEventListener('click', () => this.copyText(Referrals.myLink(), 'Ссылка скопирована — отправь её другу'));
    $('#claim-btn').addEventListener('click', () => this.claimRef($('#claim-input').value));
    $('#ref-banner-btn').addEventListener('click', () => this.claimRef(this.pendingRef));
    $('#typewriter-toggle').addEventListener('click', () => {
      Store.data.settings.typewriter = !Store.data.settings.typewriter; Store.save();
      this.renderProfile();
    });
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
      if (type === 'typing-done') $('#dialogue-next').style.visibility = 'visible';
      if (type === 'show-choices') this.renderChoices();
      if (type === 'ending') this.renderEnding(payload);
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
    this.bind();
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
    const yandex = Ads.plugin();
    if (yandex && yandex.addListener) yandex.addListener('nativeClosed', () => {
      this.nativeDismissedSession = true;
      const s = $('#native-ad-slot'); if (s) s.style.display = 'none';
    });
    Ads.onNativeResized = h => {
      this.nativeHeight = h;
      const s = $('#native-ad-slot'); if (s) s.style.height = h + 'px';
      this.syncNativePosition();
    };

    // Android-сборка: истории вшиты (офлайн);
    // веб-разработка: stores/N/story.json подгружаются по сети по мере готовности
    if (Loader.loadBundled()) {
      this.storesLoaded = true;
      this.renderLibrary();
    } else {
      this.renderLibrary();
      Loader.loadFromStores(() => { if (this.screen === 'library') this.renderLibrary(); })
        .then(() => { this.storesLoaded = true; if (this.screen === 'library') this.renderLibrary(); })
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
