/* ============================================================
   BACKEND-АДАПТЕРЫ: реклама и рефералы.

   Сейчас работает локальная реализация (без сервера) — её
   достаточно для запуска и тестов. Когда понадобится настоящая
   реклама и рефералы между разными телефонами, заменяется ТОЛЬКО
   этот файл (интерфейсы Ads.* и Referrals.* остаются теми же):

   • Реклама: внутри Ads.showRewarded() вызвать SDK
     (Yandex Ads / AdMob / VK Ads) и резолвить Promise по их
     событию «реклама досмотрена».
   • Рефералы между устройствами физически требуют сервер:
     бесплатные варианты — Supabase / Firebase. Схема таблиц
     и порядок подключения — в REFERRAL_BACKEND.md.
   ============================================================ */

const Ads = {
  /* Показать rewarded-рекламу. Возвращает Promise<boolean> — досмотрел ли игрок. */
  showRewarded(onTick) {
    // ДЕМО-РЕАЛИЗАЦИЯ: таймер CONFIG.crystals.adDurationSec секунд.
    // ЗАМЕНА НА РЕАЛЬНЫЙ SDK — только здесь.
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
  myLink() {
    const base = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : location.pathname;
    return `${base}?ref=${this.myCode()}`;
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

  /* Вызывается при ПЕРВОМ завершении любой истории: начисляем пригласившему.
     В локальной реализации выплата видна в реестре этого устройства;
     при серверном бэкенде здесь будет запрос к API (см. REFERRAL_BACKEND.md). */
  onFirstStoryCompleted() {
    const u = Store.data.user;
    if (!u.referredBy) return;
    const entry = Store.data.referralLedger.find(r => r.newcomer === u.id && r.status === 'joined');
    if (entry) { entry.status = 'inviter-paid'; entry.paidAt = Date.now(); Store.save(); }
  },

  /* Статистика для экрана профиля (по локальному реестру). */
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
