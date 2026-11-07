/* ============================================================
   ЛОКАЛЬНЫЕ УВЕДОМЛЕНИЯ (Android, Capacitor LocalNotifications)
   Без сервера: ежедневное напоминание про кристаллы и задания
   + «возвращайся» через 3 дня отсутствия (переносится при каждом входе).
   В веб-режиме разработки тихо выключены.
   ============================================================ */

const Notify = {
  ID_DAILY: 1001,
  ID_COMEBACK: 1002,
  _syncPromise: null,

  plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  },
  available() { return !!this.plugin(); },
  enabled() { return !!(Store.data && Store.data.settings && Store.data.settings.notify); },

  /* При старте приводим системное расписание в соответствие настройке:
     включено — освежить, выключено/сброшено — отменить старые напоминания. */
  init() { this.sync(false); },

  async ensurePermission() {
    const p = this.plugin(); if (!p) return false;
    try {
      const st = await p.checkPermissions();
      if (st.display === 'granted') return true;
      const req = await p.requestPermissions();
      return req.display === 'granted';
    } catch (e) { return false; }
  },

  nextAt19() {
    const d = new Date(); d.setHours(19, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  },

  /* ask=true — можно запрашивать разрешение (клик по переключателю).
     Синхронизации выполняются строго по очереди: параллельные cancel/schedule
     от старта и переключателя не должны обгонять друг друга. */
  sync(ask) {
    const run = (this._syncPromise || Promise.resolve())
      .catch(() => {})
      .then(() => this._syncOnce(ask));
    this._syncPromise = run;
    return run.finally(() => { if (this._syncPromise === run) this._syncPromise = null; });
  },

  async _syncOnce(ask) {
    const p = this.plugin(); if (!p) return false;
    try { await p.cancel({ notifications: [{ id: this.ID_DAILY }, { id: this.ID_COMEBACK }] }); } catch (e) {}
    if (!this.enabled()) return true;
    let granted = false;
    try {
      const st = await p.checkPermissions();
      granted = st.display === 'granted' || (ask && await this.ensurePermission());
    } catch (e) {}
    if (!granted) return false;
    try {
      await p.schedule({
        notifications: [
          {
            id: this.ID_DAILY,
            title: 'Новелла ◆',
            body: 'Твои ежедневные кристаллы и задания уже ждут. Загляни за новой главой ♡',
            schedule: { at: this.nextAt19(), repeats: true, every: 'day', allowWhileIdle: true },
          },
          {
            id: this.ID_COMEBACK,
            title: 'Новелла ♡',
            body: 'История скучает без тебя… Герои застыли на самом интересном месте.',
            schedule: { at: new Date(Date.now() + 3 * 86400000), allowWhileIdle: true },
          },
        ],
      });
      return true;
    } catch (e) { return false; }
  },
};
