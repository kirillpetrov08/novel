/* ============================================================
   МЕТАПРОГРЕСС ИГРОКА
   Серия дней (стрик), ежедневные задания, достижения,
   запрос оценки в RuStore, слоты-закладки в историях.
   Всё локально, данные — в Store.data.meta (см. store.js).
   ============================================================ */

const Meta = {
  m() { return Store.data.meta; },

  yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); },

  /* Вызывать при старте приложения (и при возврате в него):
     обновляет серию дней и сбр��сывает счётчики заданий на новый день. */
  touchDaily() {
    const meta = this.m(); if (!meta) return;
    const today = todayKey();
    if (meta.streak.lastDay !== today) {
      meta.streak.count = (meta.streak.lastDay === this.yesterdayKey()) ? (meta.streak.count || 0) + 1 : 1;
      meta.streak.lastDay = today;
    }
    if (meta.quests.day !== today) {
      meta.quests = {
        day: today,
        counters: { lines: 0, choices: 0, endings: 0, ads: 0, opened: 0, paidChoices: 0 },
        claimed: [],
      };
    }
    Store.save();
  },

  /* Счётчики действий: одновременно в «сегодня» (задания) и «за всё время» (достижения). */
  bump(counter, n = 1) {
    const meta = this.m(); if (!meta) return;
    if (meta.quests.day !== todayKey()) this.touchDaily();
    if (counter in meta.quests.counters) meta.quests.counters[counter] += n;
    if (counter in meta.lifetime) meta.lifetime[counter] += n;
    Store.save();
  },

  /* Размер ежедневного бонуса с учётом серии дней. */
  dailyAmount() {
    const c = CONFIG.crystals, mm = CONFIG.meta;
    const streak = (this.m() && this.m().streak.count) || 1;
    return c.dailyBonus + Math.min(Math.max(streak - 1, 0), mm.streakBonusCap) * mm.streakBonusPerDay;
  },
  streakCount() { return (this.m() && this.m().streak.count) || 0; },

  /* ---------------- ежедневные задания ---------------- */
  QUEST_POOL: [
    { id: 'q-lines',   icon: '☰', title: 'Почитай сегодня',   desc: 'Прочитай 40 реплик',                    counter: 'lines',       goal: 40, reward: 3 },
    { id: 'q-choices', icon: '✦', title: 'Твой выбор',        desc: 'Сделай 5 выборов',                       counter: 'choices',     goal: 5,  reward: 3 },
    { id: 'q-ending',  icon: '❦', title: 'До финала',         desc: 'Дойди до любого финала',                 counter: 'endings',     goal: 1,  reward: 5 },
    { id: 'q-ad',      icon: '▶', title: 'Поддержка проекта', desc: 'Посмотри рекламу за кристаллы',          counter: 'ads',         goal: 1,  reward: 2 },
    { id: 'q-open',    icon: '♡', title: 'Новая глава дня',   desc: 'Открой любую историю',                   counter: 'opened',      goal: 1,  reward: 2 },
    { id: 'q-paid',    icon: '◆', title: 'Особый момент',     desc: 'Сделай 1 особый выбор за кристаллы',     counter: 'paidChoices', goal: 1,  reward: 3 },
  ],

  /* Три задания на сегодня: детерминированно ротируются по дате. */
  todayQuests() {
    if (this.m() && this.m().quests.day !== todayKey()) this.touchDaily();
    const day = todayKey();
    let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = this.QUEST_POOL;
    const out = [];
    for (let i = 0; i < 3; i++) out.push(pool[(h + i * 2) % pool.length]);
    return [...new Set(out)].slice(0, 3);
  },

  questState(q) {
    const meta = this.m();
    const cur = Math.min((meta.quests.counters[q.counter] || 0), q.goal);
    return { cur, done: cur >= q.goal, claimed: meta.quests.claimed.includes(q.id) };
  },

  claimQuest(id) {
    const meta = this.m();
    const q = this.todayQuests().find(x => x.id === id);
    if (!q) return false;
    const st = this.questState(q);
    if (!st.done || st.claimed) return false;
    meta.quests.claimed.push(id);
    Store.save();
    Store.addCrystals(q.reward, `Задание дня: ${q.title}`);
    return true;
  },

  /* ---------------- достижения ---------------- */
  /* progress() -> {cur, max}; награда начисляется сразу при получении. */
  ACHIEVEMENTS: [
    { id: 'a-first-ending', icon: '❦', title: 'Первый финал',        desc: 'Дойди до любого финала',              reward: 5,  progress: () => ({ cur: Meta.endingsOpened(), max: 1 }) },
    { id: 'a-collector',    icon: '✦', title: 'Коллекционер',        desc: 'Открой ВСЕ финалы одной истории',     reward: 15, progress: () => ({ cur: Meta.hasFullStory() ? 1 : 0, max: 1 }) },
    { id: 'a-endings-10',   icon: '❦', title: 'Охотница за финалами',desc: 'Открой 10 разных финалов',            reward: 15, progress: () => ({ cur: Meta.endingsOpened(), max: 10 }) },
    { id: 'a-long',         icon: '☾', title: 'Длинный роман',       desc: 'Прочитай до конца длинный роман',     reward: 20, progress: () => ({ cur: Meta.longCompleted() ? 1 : 0, max: 1 }) },
    { id: 'a-choices-50',   icon: '✦', title: 'Решительная',         desc: 'Сделай 50 выборов',                   reward: 5,  progress: () => ({ cur: Meta.m().lifetime.choices, max: 50 }) },
    { id: 'a-choices-200',  icon: '✦', title: 'Судьбоносная',        desc: 'Сделай 200 выборов',                  reward: 10, progress: () => ({ cur: Meta.m().lifetime.choices, max: 200 }) },
    { id: 'a-paid-10',      icon: '◆', title: 'Особые моменты',      desc: 'Сделай 10 особых выборов за кристаллы',reward: 10, progress: () => ({ cur: Meta.m().lifetime.paidChoices, max: 10 }) },
    { id: 'a-lines-1000',   icon: '☰', title: 'Тысяча реплик',       desc: 'Прочитай 1 000 реплик',               reward: 5,  progress: () => ({ cur: Meta.m().lifetime.lines, max: 1000 }) },
    { id: 'a-lines-5000',   icon: '☰', title: 'Книжный червь',       desc: 'Прочитай 5 000 реплик',               reward: 15, progress: () => ({ cur: Meta.m().lifetime.lines, max: 5000 }) },
    { id: 'a-streak-3',     icon: '☼', title: 'Три дня подряд',      desc: 'Заходи в приложение 3 дня подряд',    reward: 5,  progress: () => ({ cur: meta.streakCount(), max: 3 }) },
    { id: 'a-streak-7',     icon: '☼', title: 'Неделя с Новеллой',   desc: 'Заходи в приложение 7 дней подряд',   reward: 15, progress: () => ({ cur: meta.streakCount(), max: 7 }) },
    { id: 'a-ads-10',       icon: '▶', title: 'Поддержка проекта',   desc: 'Посмотри 10 реклам за кристаллы',     reward: 5,  progress: () => ({ cur: Meta.m().lifetime.ads, max: 10 }) },
  ],

  storiesCompleted() { return Object.values(Store.data.progress || {}).filter(p => p.completed).length; },
  endingsOpened() { return Object.values(Store.data.progress || {}).reduce((n, p) => n + ((p.endingsFound || []).length), 0); },
  endingsTotalAll() {
    if (typeof Loader === 'undefined') return 0;
    return Loader.list().reduce((n, e) => n + Object.values(e.story.scenes).filter(s => s.ending).length, 0);
  },
  hasFullStory() {
    if (typeof Loader === 'undefined') return false;
    return Loader.list().some(({ story }) => {
      const total = Object.values(story.scenes).filter(s => s.ending).length;
      const p = Store.getProgress(story.id);
      return total > 0 && p && (p.endingsFound || []).length >= total;
    });
  },
  longCompleted() {
    if (typeof Loader === 'undefined') return false;
    return Loader.list().some(({ story }) => story.format === 'long' && (Store.getProgress(story.id) || {}).completed);
  },

  /* Проверяет достижения; возвращает список только что полученных (награда уже начислена). */
  checkAchievements() {
    const meta = this.m(); if (!meta) return [];
    const fresh = [];
    for (const a of this.ACHIEVEMENTS) {
      if (meta.ach[a.id]) continue;
      let p; try { p = a.progress(); } catch (e) { continue; }
      if (p && p.cur >= p.max) {
        meta.ach[a.id] = Date.now();
        fresh.push(a);
      }
    }
    if (fresh.length) {
      Store.save();
      const sum = fresh.reduce((n, a) => n + a.reward, 0);
      Store.addCrystals(sum, fresh.length === 1 ? `Достижение: ${fresh[0].title}` : `Достижения: ${fresh.length}`);
    }
    return fresh;
  },

  /* ---------------- запрос оценки в RuStore ---------------- */
  shouldAskRate() {
    const meta = this.m(); if (!meta) return false;
    const r = meta.rate;
    if (r.state === 'rated' || r.state === 'never') return false;
    if (r.asks >= CONFIG.meta.rateMaxAsks) return false;
    if (Date.now() - (r.lastAsk || 0) < CONFIG.meta.rateMinDaysBetween * 86400000) return false;
    return this.endingsOpened() >= 1;
  },
  rateAnswered(state) { // 'rated' | 'later'
    const r = this.m().rate;
    r.state = state; r.lastAsk = Date.now(); r.asks = (r.asks || 0) + 1;
    Store.save();
  },

  /* ---------------- рекламные слоты в ленте библиотеки ---------------- */
  /* Случайные (но стабильные внутри сессии) позиции рекламы между карточками.
     seedStr задаёт раскладку: внутри одной сессии перерендеры не «прыгают»,
     между запусками места разные. Возвращает [{after, unit, kind}],
     after — индекс карточки, ПОСЛЕ которой вставить слот (между историями). */
  planFeedAds(count, seedStr) {
    if (!count || count < 2) return [];
    let h = 2166136261;
    const s = String(seedStr || 'feed');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    // Позиции 0..count-2 — строго между карточками; шаг между слотами не меньше
    // minGap, старт и джиттер случайны, число слотов гарантировано конструкцией.
    const minGap = count >= 7 ? 3 : 2;
    const maxSlots = Math.floor((count - 2) / minGap) + 1;
    const slots = Math.min(count >= 7 ? 3 : count >= 3 ? 2 : 1, maxSlots);
    const span = (count - 1) - (slots - 1) * minGap; // допустимые старты: 0..span-1
    const base = Math.floor(rnd() * span);
    let shift = 0;
    const maxShift = span - 1 - base;
    const positions = [];
    for (let i = 0; i < slots; i++) {
      if (i > 0) shift += Math.floor(rnd() * (maxShift - shift + 1));
      positions.push(base + i * minGap + shift);
    }
    const units = [{ unit: CONFIG.ads.native, kind: 'native' },
      ...(CONFIG.ads.bannerFeed || []).map(u => ({ unit: u, kind: 'banner' }))];
    // случайный порядок блоков без повторов подряд
    const order = units.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return positions.map((after, i) => ({ after, unit: order[i % order.length].unit, kind: order[i % order.length].kind }));
  },

  /* ---------------- слоты-закладки (сохранения) ---------------- */
  slotsTotal() { return CONFIG.meta.freeSaveSlots + (this.m().extraSlots || 0); },
  canBuySlot() { return (this.m().extraSlots || 0) < CONFIG.meta.maxExtraSlots; },
  buySlot() {
    if (!this.canBuySlot()) return false;
    if (!Store.spendCrystals(CONFIG.meta.extraSlotPrice, 'Дополнительный слот сохранения')) return false;
    this.m().extraSlots = (this.m().extraSlots || 0) + 1;
    Store.save();
    return true;
  },
  listSaves(storyId) { return this.m().saves[storyId] || []; },
  putSave(storyId, idx, label, snap) {
    const meta = this.m();
    if (!meta.saves[storyId]) meta.saves[storyId] = [];
    meta.saves[storyId][idx] = { ts: Date.now(), label, snap };
    Store.save();
  },
  deleteSave(storyId, idx) {
    const arr = this.m().saves[storyId];
    if (arr && arr[idx]) { arr[idx] = null; Store.save(); }
  },
};
