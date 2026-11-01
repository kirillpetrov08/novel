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
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave();
    } catch (e) { this.data = defaultSave(); }
    if (this.data.ads.day !== todayKey()) this.data.ads = { day: todayKey(), count: 0, lastAt: 0, lastInterstitialAt: 0 };
    if (this.data.ads.lastInterstitialAt === undefined) this.data.ads.lastInterstitialAt = 0;
    // мягкая миграция вложенных объектов для старых сохранений
    const def = defaultSave();
    this.data.user = Object.assign({}, def.user, this.data.user || {});
    this.data.settings = Object.assign({}, def.settings, this.data.settings || {});
    delete this.data.settings.autoPlay; // авточтение убрано из приложения
    this.data.meta = Object.assign({}, def.meta, this.data.meta || {});
    this.data.meta.streak = Object.assign({}, def.meta.streak, this.data.meta.streak || {});
    this.data.meta.lifetime = Object.assign({}, def.meta.lifetime, this.data.meta.lifetime || {});
    this.data.meta.quests = Object.assign({}, def.meta.quests, this.data.meta.quests || {});
    this.data.meta.quests.counters = Object.assign({}, def.meta.quests.counters, this.data.meta.quests.counters || {});
    this.data.meta.rate = Object.assign({}, def.meta.rate, this.data.meta.rate || {});
    delete this.data.imported; // пользовательский импорт историй убран — истории только из stores/
    this.save();
    return this.data;
  },
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* переполнено — не падаем */ }
  },
  resetAll() { localStorage.removeItem(SAVE_KEY); this.load(); },

  /* --- кристаллы: единственный способ менять баланс --- */
  addCrystals(delta, reason) {
    this.data.crystals = Math.max(0, this.data.crystals + delta);
    this.data.ledger.push({ t: Date.now(), delta, reason });
    if (this.data.ledger.length > 200) this.data.ledger = this.data.ledger.slice(-200);
    this.save();
    document.dispatchEvent(new CustomEvent('crystals-changed', { detail: { delta, reason } }));
    return this.data.crystals;
  },
  spendCrystals(amount, reason) {
    if (this.data.crystals < amount) return false;
    this.addCrystals(-amount, reason);
    return true;
  },

  /* --- прогресс по истории --- */
  getProgress(storyId) {
    return this.data.progress[storyId] || null;
  },
  setProgress(storyId, p) { this.data.progress[storyId] = p; this.save(); },
  clearProgress(storyId) { delete this.data.progress[storyId]; this.save(); },
};
