/* ============================================================
   СОХРАНЕНИЕ — всё состояние игрока в localStorage, один ключ.
   Структура versioned: при смене формата просто подними версию.
   ============================================================ */
const SAVE_KEY = 'novel_save_v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function refCodeFrom(id) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 'NV-' + h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}
/* Ключ дня по ЛОКАЛЬНОЙ дате телефона (не UTC!): иначе «завтра» для ежедневного
   бонуса, заданий и серии дней наступало бы в 3 часа ночи по Москве. */
function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Санитизация сохранения: localStorage мог остаться от старой версии или
   оказаться частично повреждённым. Неверный тип не должен ронять загрузку
   приложения и не должен превращаться в «строковые» кристаллы вида 20+5=205. */
function saveObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function saveNum(v, fallback) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : fallback;
}
function saveInt(v, fallback, min = -Infinity) {
  return Math.max(min, Math.floor(saveNum(v, fallback)));
}
function saveBool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }
function saveText(v, fallback = '') { return typeof v === 'string' ? v : fallback; }
function saveStringArray(v) {
  return Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string'))] : [];
}
function normalizePlayState(p) {
  const state = saveObj(p);
  if (!state) return null;
  state.sceneId = saveText(state.sceneId);
  state.lineIndex = saveInt(state.lineIndex, 0, 0);
  const stats = saveObj(state.stats) || {};
  Object.keys(stats).forEach(k => { stats[k] = saveNum(stats[k], 0); });
  state.stats = stats;
  ['paid', 'visited', 'endingsFound', 'seen'].forEach(k => { state[k] = saveStringArray(state[k]); });
  state.log = Array.isArray(state.log) ? state.log.filter(x => !!saveObj(x)) : [];
  state.completed = state.completed === true;
  state.completedBefore = state.completedBefore === true;
  return state;
}

function defaultSave() {
  const id = uid();
  return {
    v: 1,
    user: { id, refCode: refCodeFrom(id), referredBy: null, refClaimed: false, createdAt: Date.now() },
    crystals: CONFIG.crystals.startBonus,
    ledger: [],                       // история операций с кристаллами {t, delta, reason}
    progress: {},                     // storyId -> {sceneId, lineIndex, stats, paid:[], visited:[], completed, endingsFound:[]}
    ads: { day: todayKey(), count: 0, lastAt: 0, lastInterstitialAt: 0 },
    lastDaily: '',
    referralLedger: [],               // локальный реестр рефералов (имитация сервера, см. backend.js)
    settings: {
      typewriter: true,               // печатная машинка: текст по символам
      typeMs: null,                   // скорость машинки (мс); null = из конфига
      fontSize: 'm',                  // 's' | 'm' | 'l' — размер текста реплик
      music: true,                    // фоновая музыка/атмосфера (WebAudio)
      weatherFx: true,                // живые эффекты погоды (снег/дождь) в сценах
      notify: false,                  // локальные уведомления (Android)
    },
    welcomeShown: false,
    // Метапрогресс игрока: серия дней, задания, достижения, статистика, закладки.
    meta: {
      streak: { count: 0, lastDay: '' },
      lifetime: { lines: 0, choices: 0, paidChoices: 0, ads: 0 },
      quests: { day: '', counters: { lines: 0, choices: 0, endings: 0, ads: 0, opened: 0, paidChoices: 0 }, claimed: [] },
      ach: {},                        // id -> время получения (награда выдаётся сразу)
      rate: { state: 'new', lastAsk: 0, asks: 0 },  // запрос оценки в RuStore
      saves: {},                      // storyId -> [{ts, label, snap}] — слоты-закладки
      extraSlots: 0,                  // купленные дополнительные слоты сохранений
    },
  };
}

const Store = {
  data: null,
  load() {
    const def = defaultSave();
    let parsed = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      parsed = raw ? saveObj(JSON.parse(raw)) : null;
    } catch (e) { parsed = null; }
    this.data = parsed ? Object.assign({}, def, parsed) : def;
    const d = this.data;

    // Скаляры и верхнеуровневые контейнеры: consumers вправе полагаться на типы.
    d.v = 1;
    d.crystals = saveInt(d.crystals, def.crystals, 0);
    d.ledger = (Array.isArray(d.ledger) ? d.ledger : [])
      .filter(x => !!saveObj(x))
      .map(x => ({ t: saveNum(x.t, 0), delta: saveInt(x.delta, 0), reason: saveText(x.reason, 'Кристаллы') }))
      .slice(-200);
    d.referralLedger = (Array.isArray(d.referralLedger) ? d.referralLedger : []).filter(x => !!saveObj(x));
    d.lastDaily = saveText(d.lastDaily);
    d.welcomeShown = d.welcomeShown === true;

    // Прогресс историй: оставляем только состояния-объекты с корректными полями.
    d.progress = saveObj(d.progress) || {};
    Object.keys(d.progress).forEach(id => {
      const state = normalizePlayState(d.progress[id]);
      if (state) d.progress[id] = state; else delete d.progress[id];
    });

    const ads = Object.assign({}, def.ads, saveObj(d.ads) || {});
    d.ads = {
      day: saveText(ads.day, def.ads.day),
      count: saveInt(ads.count, 0, 0),
      lastAt: Math.max(0, saveNum(ads.lastAt, 0)),
      lastInterstitialAt: Math.max(0, saveNum(ads.lastInterstitialAt, 0)),
    };
    if (d.ads.day !== todayKey()) {
      // Счётчик rewarded — дневной; кулдаун interstitial через полночь не сбрасываем.
      d.ads.day = todayKey(); d.ads.count = 0; d.ads.lastAt = 0;
    }

    // Мягкая миграция вложенных объектов для старых сохранений.
    const user = Object.assign({}, def.user, saveObj(d.user) || {});
    user.id = saveText(user.id, def.user.id) || def.user.id;
    user.refCode = saveText(user.refCode, refCodeFrom(user.id)) || refCodeFrom(user.id);
    user.referredBy = typeof user.referredBy === 'string' && user.referredBy ? user.referredBy : null;
    user.refClaimed = user.refClaimed === true;
    user.createdAt = Math.max(0, saveNum(user.createdAt, def.user.createdAt));
    d.user = user;

    const settings = Object.assign({}, def.settings, saveObj(d.settings) || {});
    settings.typewriter = saveBool(settings.typewriter, def.settings.typewriter);
    const typeMs = saveNum(settings.typeMs, NaN);
    settings.typeMs = Number.isFinite(typeMs) && typeMs > 0 ? typeMs : null;
    settings.fontSize = ['s', 'm', 'l'].includes(settings.fontSize) ? settings.fontSize : def.settings.fontSize;
    settings.music = saveBool(settings.music, def.settings.music);
    settings.weatherFx = saveBool(settings.weatherFx, def.settings.weatherFx);
    settings.notify = saveBool(settings.notify, def.settings.notify);
    delete settings.autoPlay; // авточтение убрано из приложения
    d.settings = settings;

    const meta = Object.assign({}, def.meta, saveObj(d.meta) || {});
    const streak = Object.assign({}, def.meta.streak, saveObj(meta.streak) || {});
    streak.count = saveInt(streak.count, 0, 0);
    streak.lastDay = saveText(streak.lastDay);
    meta.streak = streak;

    const lifetime = Object.assign({}, def.meta.lifetime, saveObj(meta.lifetime) || {});
    Object.keys(def.meta.lifetime).forEach(k => { lifetime[k] = saveInt(lifetime[k], 0, 0); });
    meta.lifetime = lifetime;

    const quests = Object.assign({}, def.meta.quests, saveObj(meta.quests) || {});
    quests.day = saveText(quests.day);
    quests.counters = Object.assign({}, def.meta.quests.counters, saveObj(quests.counters) || {});
    Object.keys(def.meta.quests.counters).forEach(k => { quests.counters[k] = saveInt(quests.counters[k], 0, 0); });
    quests.claimed = saveStringArray(quests.claimed);
    meta.quests = quests;

    const ach = saveObj(meta.ach) || {};
    Object.keys(ach).forEach(k => {
      const t = saveNum(ach[k], NaN);
      if (Number.isFinite(t) && t >= 0) ach[k] = t; else delete ach[k];
    });
    meta.ach = ach;

    const rate = Object.assign({}, def.meta.rate, saveObj(meta.rate) || {});
    rate.state = ['new', 'later', 'rated', 'never'].includes(rate.state) ? rate.state : def.meta.rate.state;
    rate.lastAsk = Math.max(0, saveNum(rate.lastAsk, 0));
    rate.asks = saveInt(rate.asks, 0, 0);
    meta.rate = rate;

    const saves = saveObj(meta.saves) || {};
    Object.keys(saves).forEach(storyId => {
      const slots = saves[storyId];
      if (!Array.isArray(slots)) { delete saves[storyId]; return; }
      saves[storyId] = slots.map(slot => {
        const item = saveObj(slot);
        const snap = item && normalizePlayState(item.snap);
        return snap ? { ts: Math.max(0, saveNum(item.ts, 0)), label: saveText(item.label, 'Закладка'), snap } : null;
      });
    });
    meta.saves = saves;
    meta.extraSlots = Math.min(
      saveInt(meta.extraSlots, 0, 0),
      Math.max(0, saveInt(CONFIG.meta && CONFIG.meta.maxExtraSlots, 0, 0)),
    );
    d.meta = meta;

    delete d.imported; // пользовательский импорт историй убран — истории только из stores/
    this.save();
    return this.data;
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* переполнено — не падаем */ }
  },
  resetAll() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* load() ниже всё равно создаст чистое состояние в памяти */ }
    this.load();
  },

  /* --- кристаллы: единственный способ менять баланс --- */
  addCrystals(delta, reason) {
    const amount = saveInt(delta, 0);
    this.data.crystals = Math.max(0, saveInt(this.data.crystals, 0, 0) + amount);
    if (!Array.isArray(this.data.ledger)) this.data.ledger = [];
    this.data.ledger.push({ t: Date.now(), delta: amount, reason });
    if (this.data.ledger.length > 200) this.data.ledger = this.data.ledger.slice(-200);
    this.save();
    document.dispatchEvent(new CustomEvent('crystals-changed', { detail: { delta: amount, reason } }));
    return this.data.crystals;
  },
  spendCrystals(amount, reason) {
    const cost = saveInt(amount, 0, 0);
    if (cost === 0) return true;
    if (saveInt(this.data.crystals, 0, 0) < cost) return false;
    this.addCrystals(-cost, reason);
    return true;
  },

  /* --- прогресс по истории --- */
  getProgress(storyId) {
    const progress = saveObj(this.data && this.data.progress);
    return progress ? (progress[storyId] || null) : null;
  },
  setProgress(storyId, p) {
    if (!saveObj(this.data.progress)) this.data.progress = {};
    this.data.progress[storyId] = p;
    this.save();
  },
  clearProgress(storyId) {
    if (!saveObj(this.data.progress)) this.data.progress = {};
    delete this.data.progress[storyId];
    this.save();
  },
};
