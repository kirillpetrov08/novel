/* ============================================================
   BACKEND-АДАПТЕРЫ: реклама Яндекса и рефералы.

   РЕКЛАМА — подключена по-настоящему:
   Android-приложение использует Yandex Mobile Ads SDK через
   локальный Capacitor-плагин (android/.../YandexAdsPlugin.java).
   Блоки из кабинета РСЯ (ID в js/config.js → CONFIG.ads):
     • rewarded     R-M-20304990-1 — кристаллы в магазине, «не хватает
                    кристаллов», удвоение награды за финал
     • interstitial R-M-20304990-2 — между новеллами: вход в историю
                    из библиотеки и выход с экрана финала
     • native       R-M-20304990-3 — нативная карточка в библиотеке
   В веб-режиме разработки (нет плагина) rewarded заменяется
   демо-таймером, interstitial пропускается, native — карточкой-
   заглушкой, чтобы было видно место размещения.

   РЕФЕРАЛЫ между разными телефонами требуют сервер — сейчас
   работает локальная реализация. Подключение Supabase/Firebase
   заменяет тела функций Referrals.* (см. REFERRAL_BACKEND.md).
   ============================================================ */

const Ads = {
  _inited: false,
  _nativeVisible: false,
  _nativeHeight: 0,      // высота нативной карточки (dp) — под слот в библиотеке
  _nativePromise: null,  // текущая загрузка native (защита от параллельных вызовов)
  onNativeResized: null, // выставляет UI: (heightDp) => подправить высоту слота

  plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.YandexAds) || null;
  },
  isNative() { return !!this.plugin(); },

  async init() {
    const p = this.plugin();
    if (!p || this._inited) return;
    this._inited = true;
    try {
      await p.initialize();
      // Предзагрузка полноэкранных форматов: показ потом мгновенный.
      p.preloadInterstitial({ adUnitId: CONFIG.ads.interstitial });
      p.preloadRewarded({ adUnitId: CONFIG.ads.rewarded });
      if (p.addListener) {
        p.addListener('nativeClosed', () => { this._nativeVisible = false; });
        p.addListener('nativeResized', e => {
          if (e && e.height) {
            this._nativeHeight = e.height;
            if (this.onNativeResized) this.onNativeResized(e.height);
          }
        });
      }
    } catch (e) { /* без рекламы приложение продолжает работать */ }
  },

  /* --- Rewarded: true, только если игрок досмотрел и получил награду --- */
  async showRewardedNative() {
    const p = this.plugin();
    if (!p) return false;
    try {
      const r = await p.showRewarded({ adUnitId: CONFIG.ads.rewarded });
      p.preloadRewarded({ adUnitId: CONFIG.ads.rewarded });
      return !!(r && r.rewarded);
    } catch (e) { return false; }
  },

  /* Веб-режим разработки: таймер-заглушка на месте настоящего SDK. */
  showRewardedDemo(onTick) {
    return new Promise(resolve => {
      let left = CONFIG.crystals.adDurationSec;
      onTick && onTick(left);
      const timer = setInterval(() => {
        left--;
        onTick && onTick(Math.max(left, 0));
        if (left <= 0) { clearInterval(timer); resolve(true); }
      }, 1000);
    });
  },

  /* --- Interstitial: между новеллами и после финала. С кулдауном,
         никогда не блокирует пользователя, если реклама не готова. --- */
  async showInterstitial() {
    const last = Store.data.ads.lastInterstitialAt || 0;
    if (Date.now() - last < CONFIG.ads.interstitialCooldownSec * 1000) return false;
    const p = this.plugin();
    if (!p) return false; // в веб-разработке просто пропускаем
    try {
      const r = await p.showInterstitial({ adUnitId: CONFIG.ads.interstitial });
      const shown = !!(r && r.shown);
      if (shown) { Store.data.ads.lastInterstitialAt = Date.now(); Store.save(); }
      return shown;
    } catch (e) { return false; }
  },

  /* --- Native: карточка лежит точно поверх слота между историями в библиотеке.
         JS резервирует слот в потоке списка, плагин рисует поверх него и едет за скроллом. --- */
  _rectArgs(rect) {
    return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width) };
  },
  isNativeShown() { return this._nativeVisible; },
  /* Первый показ: загружает рекламу, возвращает её высоту для слота. */
  async showNative(rect) {
    const p = this.plugin();
    if (!p || !rect) return { shown: false, height: 0 };
    if (this._nativeVisible) { this.positionNative(rect, true); return { shown: true, height: this._nativeHeight }; }
    if (this._nativePromise) return this._nativePromise;
    this._nativePromise = (async () => {
      try {
        const r = await p.showNative({ adUnitId: CONFIG.ads.native, ...this._rectArgs(rect) });
        this._nativeVisible = !!(r && r.shown);
        this._nativeHeight = (r && r.height) || 0;
        return { shown: this._nativeVisible, height: this._nativeHeight };
      } catch (e) { return { shown: false, height: 0 }; }
      finally { this._nativePromise = null; }
    })();
    return this._nativePromise;
  },
  /* Переставить уже показанную карточку (скролл/resize) или спрятать без уничтожения. */
  positionNative(rect, visible) {
    const p = this.plugin();
    if (!p || !this._nativeVisible || !rect) return;
    try { p.positionNative({ ...this._rectArgs(rect), visible: !!visible }); } catch (e) {}
  },
  hideNative() {
    const p = this.plugin();
    this._nativeVisible = false;
    if (p) { try { p.hideNative(); } catch (e) {} }
  },

  /* --- Лимиты именно для кнопки в магазине (фарм кристаллов) --- */
  canWatch() {
    const a = Store.data.ads;
    if (a.count >= CONFIG.crystals.adDailyLimit) return { ok: false, reason: `Лимит на сегодня: ${CONFIG.crystals.adDailyLimit} реклам` };
    const wait = CONFIG.crystals.adCooldownSec - Math.floor((Date.now() - a.lastAt) / 1000);
    if (a.lastAt && wait > 0) return { ok: false, reason: `Следующая реклама через ${wait} сек` };
    return { ok: true };
  },
  registerWatch() {
    Store.data.ads.count++;
    Store.data.ads.lastAt = Date.now();
    Store.save();
  },
};

const Referrals = {
  myCode() { return Store.data.user.refCode; },
  /* Ссылка на скачивание приложения (страница в RuStore). Друг ставит приложение
     по ней и вводит код вручную в Профиле; автоактивация по ?ref= осталась только
     для веб-превью разработки (разбор параметра — в app.js при старте). */
  myLink() {
    return CONFIG.referrals.storeUrl;
  },

  /* Готовый текст приглашения для мессенджера: ссылка на скачивание + код. */
  myInviteText() {
    return `«${CONFIG.appName}» — интерактивные истории любви, где твои выборы меняют финал ♡\n` +
      `Скачай в RuStore: ${this.myLink()}\n` +
      `И введи мой код ${this.myCode()} в разделе «Профиль» — получишь +${CONFIG.referrals.newcomerBonus} ◆ на особые выборы.`;
  },

  /* Новичок активирует чужой код (по ссылке ?ref= или вручную). Один раз в жизни аккаунта. */
  claim(code) {
    code = (code || '').trim().toUpperCase();
    const u = Store.data.user;
    if (!code) return { ok: false, reason: 'Введи код друга' };
    if (code === u.refCode) return { ok: false, reason: 'Это твой собственный код' };
    if (u.refClaimed) return { ok: false, reason: 'Реферальный бонус уже получен' };
    if (!/^NV-[A-Z0-9]{6}$/.test(code)) return { ok: false, reason: 'Код выглядит неверно. Формат: NV-XXXXXX' };

    u.refClaimed = true;
    u.referredBy = code;
    Store.data.referralLedger.push({ code, newcomer: u.id, status: 'joined', t: Date.now() });
    Store.save();
    Store.addCrystals(CONFIG.referrals.newcomerBonus, 'Реферальный бонус новичка');
    return { ok: true };
  },

  /* Вызывается при ПЕРВОМ завершении любой истории: засчитываем пригласившему.
     В локальной реализации выплата видна в реестре этого устройства;
     при серверном бэкенде здесь будет запрос к API (см. REFERRAL_BACKEND.md). */
  onFirstStoryCompleted() {
    const u = Store.data.user;
    if (!u.referredBy) return;
    const entry = Store.data.referralLedger.find(r => r.newcomer === u.id && r.status === 'joined');
    if (entry) { entry.status = 'inviter-paid'; entry.paidAt = Date.now(); Store.save(); }
  },

  stats() {
    const mine = Store.data.referralLedger.filter(r => r.code === this.myCode());
    const completed = mine.filter(r => r.status === 'inviter-paid').length;
    return {
      invited: mine.length,
      completed,
      earned: completed * CONFIG.referrals.inviterBonus,
    };
  },
};
