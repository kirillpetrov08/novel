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
function todayKey() { return new Date().toISOString().slice(0, 10); }

function defaultSave() {
  const id = uid();
  return {
    v: 1,
    user: { id, refCode: refCodeFrom(id), referredBy: null, refClaimed: false, createdAt: Date.now() },
    crystals: CONFIG.crystals.startBonus,
    ledger: [],                       // история операций с кристаллами {t, delta, reason}
    progress: {},                     // storyId -> {sceneId, lineIndex, stats, paid:[], visited:[], completed, endingsFound:[]}
    imported: [],                     // истории, добавленные через кнопку «Импорт» (полные объекты)
    ads: { day: todayKey(), count: 0, lastAt: 0 },
    lastDaily: '',
    referralLedger: [],               // локальный реестр рефералов (имитация сервера, см. backend.js)
    settings: { typewriter: true },
    welcomeShown: false,
  };
}

const Store = {
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      this.data = raw ? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave();
    } catch (e) { this.data = defaultSave(); }
    if (this.data.ads.day !== todayKey()) this.data.ads = { day: todayKey(), count: 0, lastAt: 0 };
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
