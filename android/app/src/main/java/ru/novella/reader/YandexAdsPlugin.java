package ru.novella.reader;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.yandex.mobile.ads.common.AdError;
import com.yandex.mobile.ads.common.AdRequest;
import com.yandex.mobile.ads.common.AdRequestError;
import com.yandex.mobile.ads.common.ImpressionData;
import com.yandex.mobile.ads.interstitial.InterstitialAd;
import com.yandex.mobile.ads.interstitial.InterstitialAdEventListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoadListener;
import com.yandex.mobile.ads.interstitial.InterstitialAdLoader;
import com.yandex.mobile.ads.nativeads.MediaView;
import com.yandex.mobile.ads.nativeads.Rating;

import java.util.Locale;
import com.yandex.mobile.ads.nativeads.NativeAd;
import com.yandex.mobile.ads.nativeads.NativeAdLoadListener;
import com.yandex.mobile.ads.nativeads.NativeAdLoader;
import com.yandex.mobile.ads.nativeads.NativeAdView;
import com.yandex.mobile.ads.nativeads.NativeAdViewBinder;
import com.yandex.mobile.ads.rewarded.Reward;
import com.yandex.mobile.ads.rewarded.RewardedAd;
import com.yandex.mobile.ads.rewarded.RewardedAdEventListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoadListener;
import com.yandex.mobile.ads.rewarded.RewardedAdLoader;
import com.yandex.mobile.ads.banner.BannerAdEventListener;
import com.yandex.mobile.ads.banner.BannerAdSize;
import com.yandex.mobile.ads.banner.BannerAdView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Локальный Capacitor-плагин Yandex Mobile Ads SDK (com.yandex.android:mobileads).
 * SDK в актуальной версии инициализируется автоматически при старте приложения.
 *
 * Методы из JS (Capacitor.Plugins.YandexAds):
 *   initialize()                                  -> { ready: true } (автоинициализация SDK)
 *   preloadInterstitial({adUnitId}) / preloadRewarded({adUnitId})
 *   showInterstitial({adUnitId})                  -> { shown } резолвится при закрытии/ошибке/неготовности
 *   showRewarded({adUnitId})                      -> { rewarded } резолвится при закрытии; rewarded=true только после onRewarded
 *   showNative({adUnitId, x, y, width})           -> { shown, height } карточка поверх WebView точно по rect JS-слота (dp от начала WebView)
 *   positionNative({x, y, width, visible})        -> {} двигает уже показанную карточку за слотом (скролл библиотеки)
 *   hideNative()                                  -> {}
 *   showFeedAd({id, adUnitId, kind, x, y, width}) -> { shown, height } слот ленты библиотеки:
 *                                                    kind=native — та же карточка, kind=banner — BannerAdView («Лента»)
 *   positionFeedAd({id, x, y, width, visible})    -> {} двигает слот ленты за его DOM-местом
 *   hideFeedAd({id}) / hideAllFeedAds()           -> {}
 * События в JS: "nativeClosed" — пользователь закрыл нативную карточку крестиком;
 *               "nativeResized" {height} — высота карточки изменилась (JS подгоняет слот);
 *               "feedClosed" {id} / "feedResized" {id, height} — то же для слотов ленты.
 *
 * Вся показы/загрузки — только главный поток (требование SDK).
 */
@CapacitorPlugin(name = "YandexAds")
public class YandexAdsPlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private InterstitialAdLoader interstitialLoader;
    private InterstitialAd interstitialAd;
    private boolean interstitialLoading = false;
    private PluginCall pendingInterstitialShow;

    private RewardedAdLoader rewardedLoader;
    private RewardedAd rewardedAd;
    private boolean rewardedLoading = false;
    private boolean rewardEarned = false;
    private PluginCall pendingRewardedShow;   // вызов showRewarded, ждущий закрытия рекламы
    private Runnable rewardedTimeout;

    private NativeAdLoader nativeLoader;
    private View nativeWrapper;               // обёртка карточки поверх WebView
    private boolean nativeLoading = false;
    private int nativeHeightDp = 0;           // высота карточки (dp) — JS резервирует слот такой же высоты
    private boolean nativeCancelled = false;  // hideNative во время загрузки: загруженное уже не показываем

    // Лента библиотеки: несколько рекламных слотов одновременно (native + баннеры).
    private final Map<String, View> feedViews = new HashMap<>();        // slotId -> обёртка поверх WebView
    private final Map<String, Integer> feedHeights = new HashMap<>();   // slotId -> высота (dp)
    private final Set<String> feedLoading = new HashSet<>();            // слоты в процессе загрузки
    private final Set<String> feedCancelled = new HashSet<>();          // скрытые во время загрузки — не показывать

    // ---------------------------------------------------------------
    @PluginMethod
    public void initialize(PluginCall call) {
        // Актуальный Yandex Mobile Ads SDK инициализируется автоматически.
        JSObject ret = new JSObject();
        ret.put("ready", true);
        call.resolve(ret);
    }

    private void ui(Runnable r) {
        Activity a = getActivity();
        if (a != null) a.runOnUiThread(r);
    }

    // =========================== INTERSTITIAL ===========================
    @PluginMethod
    public void preloadInterstitial(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        ui(() -> loadInterstitial(adUnitId));
        call.resolve();
    }

    private void loadInterstitial(String adUnitId) {
        if (adUnitId == null || interstitialAd != null || interstitialLoading) return;
        Context ctx = getContext();
        if (ctx == null) return;
        if (interstitialLoader == null) interstitialLoader = new InterstitialAdLoader(ctx);
        interstitialLoading = true;
        interstitialLoader.loadAd(new AdRequest.Builder(adUnitId).build(), new InterstitialAdLoadListener() {
            @Override
            public void onAdLoaded(@NonNull InterstitialAd ad) {
                interstitialLoading = false;
                interstitialAd = ad;
            }
            @Override
            public void onAdFailedToLoad(@NonNull AdRequestError error) {
                interstitialLoading = false; // ретраи в цикле запрещены доками SDK — следующий preload сделает JS
            }
        });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        ui(() -> {
            Activity activity = getActivity();
            if (activity == null || interstitialAd == null) {
                loadInterstitial(adUnitId); // подгрузим к следующему разу, пользователя не ждём
                JSObject ret = new JSObject();
                ret.put("shown", false);
                call.resolve(ret);
                return;
            }
            pendingInterstitialShow = call;
            interstitialAd.setAdEventListener(new InterstitialAdEventListener() {
                @Override public void onAdShown() {}
                @Override
                public void onAdFailedToShow(@NonNull AdError adError) { finishInterstitial(adUnitId, false); }
                @Override
                public void onAdDismissed() { finishInterstitial(adUnitId, true); }
                @Override public void onAdClicked() {}
                @Override public void onAdImpression(@Nullable ImpressionData impressionData) {}
            });
            interstitialAd.show(activity);
        });
    }

    private void finishInterstitial(String adUnitId, boolean shown) {
        if (interstitialAd != null) {
            interstitialAd.setAdEventListener(null);
            interstitialAd = null;
        }
        if (pendingInterstitialShow != null) {
            JSObject ret = new JSObject();
            ret.put("shown", shown);
            pendingInterstitialShow.resolve(ret);
            pendingInterstitialShow = null;
        }
        loadInterstitial(adUnitId); // предзагрузка следующей
    }

    // =========================== REWARDED ===========================
    @PluginMethod
    public void preloadRewarded(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        ui(() -> loadRewarded(adUnitId, false));
        call.resolve();
    }

    private void loadRewarded(String adUnitId, boolean showWhenLoaded) {
        if (adUnitId == null || rewardedAd != null || rewardedLoading) return;
        Context ctx = getContext();
        if (ctx == null) return;
        if (rewardedLoader == null) rewardedLoader = new RewardedAdLoader(ctx);
        rewardedLoading = true;
        rewardedLoader.loadAd(new AdRequest.Builder(adUnitId).build(), new RewardedAdLoadListener() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                rewardedLoading = false;
                rewardedAd = ad;
                if (showWhenLoaded && pendingRewardedShow != null) showLoadedRewarded();
            }
            @Override
            public void onAdFailedToLoad(@NonNull AdRequestError error) {
                rewardedLoading = false;
                finishRewarded(false);
            }
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        ui(() -> {
            if (pendingRewardedShow != null) { call.reject("Rewarded ad already in progress"); return; }
            pendingRewardedShow = call;
            rewardEarned = false;
            // Страховочный таймаут: промис не должен висеть вечно.
            cancelRewardedTimeout();
            rewardedTimeout = () -> finishRewarded(rewardEarned);
            mainHandler.postDelayed(rewardedTimeout, 60_000);
            if (rewardedAd != null) showLoadedRewarded();
            else loadRewarded(adUnitId, true);
        });
    }

    private void showLoadedRewarded() {
        Activity activity = getActivity();
        if (activity == null || rewardedAd == null) { finishRewarded(false); return; }
        rewardedAd.setAdEventListener(new RewardedAdEventListener() {
            @Override public void onAdShown() {}
            @Override
            public void onAdFailedToShow(@NonNull AdError adError) { finishRewarded(false); }
            @Override
            public void onAdDismissed() { finishRewarded(rewardEarned); }
            @Override public void onAdClicked() {}
            @Override public void onAdImpression(@Nullable ImpressionData impressionData) {}
            @Override
            public void onRewarded(@NonNull Reward reward) { rewardEarned = true; }
        });
        rewardedAd.show(activity);
    }

    private void cancelRewardedTimeout() {
        if (rewardedTimeout != null) mainHandler.removeCallbacks(rewardedTimeout);
        rewardedTimeout = null;
    }

    private void finishRewarded(boolean rewarded) {
        cancelRewardedTimeout();
        if (rewardedAd != null) {
            rewardedAd.setAdEventListener(null);
            rewardedAd = null;
        }
        if (pendingRewardedShow != null) {
            JSObject ret = new JSObject();
            ret.put("rewarded", rewarded);
            pendingRewardedShow.resolve(ret);
            pendingRewardedShow = null;
        }
    }

    // =========================== NATIVE ===========================
    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getContext().getResources().getDisplayMetrics()));
    }

    @PluginMethod
    public void showNative(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        int xDp = call.getInt("x", 0);
        int yDp = call.getInt("y", 0);
        int widthDp = call.getInt("width", 0);
        ui(() -> {
            Context ctx = getContext();
            Activity activity = getActivity();
            if (ctx == null || activity == null || adUnitId == null || nativeLoading) {
                JSObject ret = new JSObject();
                ret.put("shown", nativeWrapper != null);
                ret.put("height", nativeHeightDp);
                call.resolve(ret);
                return;
            }
            if (nativeWrapper != null) { // карточка уже показана — только переставить под слот
                applyNativeRect(xDp, yDp, widthDp, true);
                JSObject ret = new JSObject();
                ret.put("shown", true);
                ret.put("height", nativeHeightDp);
                call.resolve(ret);
                return;
            }
            if (nativeLoader == null) nativeLoader = new NativeAdLoader(ctx);
            nativeCancelled = false;
            nativeLoading = true;
            nativeLoader.loadAd(new AdRequest.Builder(adUnitId).build(), new NativeAdLoadListener() {
                @Override
                public void onAdLoaded(@NonNull NativeAd nativeAd) {
                    nativeLoading = false;
                    if (nativeCancelled) { // успели уйти с библиотеки — карточку не рисуем
                        JSObject ret = new JSObject();
                        ret.put("shown", false);
                        ret.put("height", 0);
                        call.resolve(ret);
                        return;
                    }
                    int heightDp = renderNative(nativeAd, xDp, yDp, widthDp);
                    JSObject ret = new JSObject();
                    ret.put("shown", heightDp > 0);
                    ret.put("height", heightDp);
                    call.resolve(ret);
                }
                @Override
                public void onAdFailedToLoad(@NonNull AdRequestError error) {
                    nativeLoading = false;
                    JSObject ret = new JSObject();
                    ret.put("shown", false);
                    ret.put("height", 0);
                    call.resolve(ret);
                }
            });
        });
    }

    @PluginMethod
    public void positionNative(PluginCall call) {
        int xDp = call.getInt("x", 0);
        int yDp = call.getInt("y", 0);
        int widthDp = call.getInt("width", 0);
        boolean visible = call.getBoolean("visible", true);
        ui(() -> applyNativeRect(xDp, yDp, widthDp, visible));
        call.resolve();
    }

    /** Начало координат контентной области WebView в системе корневого контейнера окна, px. */
    private int[] webOriginInRoot(ViewGroup root) {
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return new int[]{0, 0};
        int[] rootLoc = new int[2];
        int[] wvLoc = new int[2];
        root.getLocationInWindow(rootLoc);
        webView.getLocationInWindow(wvLoc);
        return new int[]{
            wvLoc[0] + webView.getPaddingLeft() - rootLoc[0] - root.getPaddingLeft(),
            wvLoc[1] + webView.getPaddingTop() - rootLoc[1] - root.getPaddingTop()
        };
    }

    /** Ставит карточку точно поверх JS-слота: rect приходит в dp от начала WebView. */
    private void applyNativeRect(int xDp, int yDp, int widthDp, boolean visible) {
        applyRect(nativeWrapper, xDp, yDp, widthDp, visible, hDp -> {
            if (hDp == nativeHeightDp) return;
            nativeHeightDp = hDp;
            JSObject ev = new JSObject();
            ev.put("height", hDp);
            notifyListeners("nativeResized", ev);
        });
    }

    /** Ставит произвольную рекламную вью точно поверх её JS-слота (rect — dp от начала WebView).
        onHeight (nullable) получает фактическую высоту в dp после layout — JS подгоняет слот. */
    private void applyRect(View view, int xDp, int yDp, int widthDp, boolean visible,
                           java.util.function.IntConsumer onHeight) {
        if (view == null || !(view.getParent() instanceof ViewGroup)) return;
        ViewGroup root = (ViewGroup) view.getParent();
        int[] origin = webOriginInRoot(root);
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) view.getLayoutParams();
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = origin[0] + dp(xDp);
        lp.topMargin = origin[1] + dp(yDp);
        lp.rightMargin = 0;
        lp.bottomMargin = 0;
        if (widthDp > 0) lp.width = dp(widthDp);
        view.setLayoutParams(lp);
        view.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (visible && onHeight != null) {
            // Высота могла поменяться (новая ширина) — сообщить JS, чтобы слот совпал с вью.
            view.post(() -> {
                int hPx = view.getHeight();
                if (hPx <= 0) return;
                int hDp = Math.round(hPx / getContext().getResources().getDisplayMetrics().density);
                onHeight.accept(hDp);
            });
        }
    }

    @PluginMethod
    public void hideNative(PluginCall call) {
        nativeCancelled = true;
        ui(() -> removeNative());
        call.resolve();
    }

    private void removeNative() {
        if (nativeWrapper != null && nativeWrapper.getParent() instanceof ViewGroup) {
            ((ViewGroup) nativeWrapper.getParent()).removeView(nativeWrapper);
        }
        nativeWrapper = null;
        nativeHeightDp = 0;
    }

    private TextView text(Context ctx, float sp, int color, boolean bold) {
        TextView tv = new TextView(ctx);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setMaxLines(2);
        return tv;
    }

    /** Рендер одиночной нативной карточки (легаси-API showNative). Возвращает высоту в dp. */
    private int renderNative(NativeAd nativeAd, int xDp, int yDp, int widthDp) {
        if (getActivity() == null) return 0;
        removeNative();
        FrameLayout wrapper = buildNativeCard(nativeAd, () -> {
            removeNative();
            notifyListeners("nativeClosed", new JSObject());
        });
        if (wrapper == null) return 0;
        nativeWrapper = wrapper;
        attachToRoot(wrapper, widthDp);
        applyNativeRect(xDp, yDp, widthDp, true);
        nativeHeightDp = measureHeightDp(wrapper, widthDp);
        return nativeHeightDp;
    }

    /** Добавляет рекламную вью поверх WebView в корневой контейнер окна. */
    private void attachToRoot(View view, int widthDp) {
        Activity activity = getActivity();
        if (activity == null) return;
        ViewGroup root = activity.findViewById(android.R.id.content);
        int widthPx = widthDp > 0 ? dp(widthDp) : ViewGroup.LayoutParams.MATCH_PARENT;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(widthPx, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        root.addView(view, lp);
        view.bringToFront();
    }

    /** Собственная высота вью в dp при заданной ширине слота. */
    private int measureHeightDp(View view, int widthDp) {
        Activity activity = getActivity();
        ViewGroup root = activity != null ? activity.findViewById(android.R.id.content) : null;
        int specW = widthDp > 0
            ? View.MeasureSpec.makeMeasureSpec(dp(widthDp), View.MeasureSpec.EXACTLY)
            : View.MeasureSpec.makeMeasureSpec(Math.max(root != null ? root.getWidth() : 1, 1), View.MeasureSpec.AT_MOST);
        view.measure(specW, View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        return Math.round(view.getMeasuredHeight() / getContext().getResources().getDisplayMetrics().density);
    }

    /** Шаблон нативной карточки в фирменной бежевой палитре, строится программно.
        onClose — клик по крестику (владелец убирает карточку и шлёт событие в JS). */
    private FrameLayout buildNativeCard(NativeAd nativeAd, Runnable onClose) {
        Activity activity = getActivity();
        if (activity == null) return null;
        Context ctx = activity;

        // Обёртка: сама карточка + крестик в углу (крестик — sibling NativeAdView, не перехватывает её клики).
        FrameLayout wrapper = new FrameLayout(ctx);

        NativeAdView adView = new NativeAdView(ctx);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.rgb(255, 253, 248));            // --surface
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(dp(1), Color.rgb(223, 211, 188));    // --line
        adView.setBackground(cardBg);
        adView.setElevation(dp(6));

        LinearLayout column = new LinearLayout(ctx);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(12), dp(10), dp(12), dp(10));

        // Шапка: иконка + заголовок/домен, справа возраст и кнопка фидбэка SDK
        LinearLayout header = new LinearLayout(ctx);
        header.setOrientation(LinearLayout.HORIZONTAL);
        ImageView icon = new ImageView(ctx);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(38), dp(38));
        iconLp.rightMargin = dp(9);
        header.addView(icon, iconLp);

        LinearLayout titles = new LinearLayout(ctx);
        titles.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(ctx, 14, Color.rgb(43, 38, 32), true);
        title.setMaxLines(1);
        TextView domain = text(ctx, 11, Color.rgb(138, 125, 104), false);
        domain.setMaxLines(1);
        titles.addView(title);
        titles.addView(domain);
        header.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        TextView age = text(ctx, 10, Color.rgb(138, 125, 104), true);
        header.addView(age, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ImageView feedback = new ImageView(ctx);
        LinearLayout.LayoutParams fbLp = new LinearLayout.LayoutParams(dp(18), dp(18));
        fbLp.leftMargin = dp(6);
        header.addView(feedback, fbLp);
        column.addView(header);

        MediaView media = new MediaView(ctx);
        LinearLayout.LayoutParams mediaLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(150));
        mediaLp.topMargin = dp(9);
        column.addView(media, mediaLp);

        TextView body = text(ctx, 13, Color.rgb(74, 66, 54), false);
        LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyLp.topMargin = dp(8);
        column.addView(body, bodyLp);

        TextView warning = text(ctx, 10, Color.rgb(138, 125, 104), false);
        column.addView(warning);

        // Нижний ряд: спонсор + цена/отзывы слева, CTA справа
        LinearLayout footer = new LinearLayout(ctx);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout meta = new LinearLayout(ctx);
        meta.setOrientation(LinearLayout.VERTICAL);
        TextView sponsored = text(ctx, 10, Color.rgb(138, 125, 104), true);
        TextView price = text(ctx, 12, Color.rgb(43, 38, 32), true);
        TextView reviewCount = text(ctx, 10, Color.rgb(138, 125, 104), false);
        StarRatingView rating = new StarRatingView(ctx);
        rating.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        rating.setTextColor(Color.rgb(138, 109, 75));
        rating.setTypeface(Typeface.DEFAULT_BOLD);
        meta.addView(sponsored);
        meta.addView(price);
        meta.addView(rating);
        meta.addView(reviewCount);
        footer.addView(meta, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button cta = new Button(ctx);
        cta.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        cta.setTextColor(Color.rgb(255, 253, 248));
        GradientDrawable ctaBg = new GradientDrawable();
        ctaBg.setColor(Color.rgb(138, 109, 75));              // --accent
        ctaBg.setCornerRadius(dp(10));
        cta.setBackground(ctaBg);
        cta.setPadding(dp(14), 0, dp(14), 0);
        LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38));
        ctaLp.leftMargin = dp(10);
        footer.addView(cta, ctaLp);
        column.addView(footer);

        ImageView favicon = new ImageView(ctx);
        favicon.setVisibility(View.GONE);
        column.addView(favicon, new LinearLayout.LayoutParams(1, 1));

        adView.addView(column, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        wrapper.addView(adView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView close = new TextView(ctx);
        close.setText("×");
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        close.setTextColor(Color.rgb(107, 84, 57));
        close.setGravity(Gravity.CENTER);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setShape(GradientDrawable.OVAL);
        closeBg.setColor(Color.rgb(241, 234, 219));
        closeBg.setStroke(dp(1), Color.rgb(223, 211, 188));
        close.setBackground(closeBg);
        FrameLayout.LayoutParams closeLp = new FrameLayout.LayoutParams(dp(26), dp(26), Gravity.TOP | Gravity.END);
        closeLp.topMargin = dp(6);
        closeLp.rightMargin = dp(6);
        close.setOnClickListener(v -> { if (onClose != null) onClose.run(); });
        wrapper.addView(close, closeLp);

        NativeAdViewBinder binder = new NativeAdViewBinder.Builder(adView)
                .setAgeView(age)
                .setBodyView(body)
                .setCallToActionView(cta)
                .setDomainView(domain)
                .setFaviconView(favicon)
                .setFeedbackView(feedback)
                .setIconView(icon)
                .setMediaView(media)
                .setPriceView(price)
                .setRatingView(rating)
                .setReviewCountView(reviewCount)
                .setSponsoredView(sponsored)
                .setTitleView(title)
                .setWarningView(warning)
                .build();
        nativeAd.bindNativeAd(binder);

        return wrapper;
    }

    // =========================== FEED (лента библиотеки) ===========================
    // Несколько рекламных слотов одновременно: нативная карточка (тот же шаблон, что
    // у showNative) и баннеры «Лента» BannerAdView. Каждый слот — Android-вью поверх
    // своего DOM-места между карточками историй; раскладку считает JS (Meta.planFeedAds).

    private void feedResolve(PluginCall call, boolean shown, int heightDp) {
        JSObject ret = new JSObject();
        ret.put("shown", shown);
        ret.put("height", heightDp);
        call.resolve(ret);
    }

    private void applyFeedRect(String id, View view, int xDp, int yDp, int widthDp, boolean visible) {
        applyRect(view, xDp, yDp, widthDp, visible, hDp -> {
            Integer prev = feedHeights.get(id);
            if (prev != null && prev == hDp) return;
            feedHeights.put(id, hDp);
            JSObject ev = new JSObject();
            ev.put("id", id);
            ev.put("height", hDp);
            notifyListeners("feedResized", ev);
        });
    }

    private void removeFeedView(String id) {
        View v = feedViews.remove(id);
        feedHeights.remove(id);
        if (v == null) return;
        if (v instanceof BannerAdView) ((BannerAdView) v).destroy();
        if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
    }

    @PluginMethod
    public void showFeedAd(PluginCall call) {
        String id = call.getString("id");
        String adUnitId = call.getString("adUnitId");
        String kind = call.getString("kind", "banner");
        int xDp = call.getInt("x", 0);
        int yDp = call.getInt("y", 0);
        int widthDp = call.getInt("width", 0);
        ui(() -> {
            Context ctx = getContext();
            Activity activity = getActivity();
            if (id == null || adUnitId == null || ctx == null || activity == null) {
                feedResolve(call, false, 0);
                return;
            }
            View existing = feedViews.get(id);
            if (existing != null) { // слот уже показан — только переставить под DOM-место
                applyFeedRect(id, existing, xDp, yDp, widthDp, true);
                Integer h = feedHeights.get(id);
                feedResolve(call, true, h != null ? h : 0);
                return;
            }
            if (feedLoading.contains(id)) { feedResolve(call, false, 0); return; }
            feedLoading.add(id);
            feedCancelled.remove(id);
            if ("native".equals(kind)) loadFeedNative(call, id, adUnitId, xDp, yDp, widthDp);
            else loadFeedBanner(call, id, adUnitId, xDp, yDp, widthDp);
        });
    }

    private void loadFeedNative(PluginCall call, String id, String adUnitId, int xDp, int yDp, int widthDp) {
        Context ctx = getContext();
        if (nativeLoader == null) nativeLoader = new NativeAdLoader(ctx);
        nativeLoader.loadAd(new AdRequest.Builder(adUnitId).build(), new NativeAdLoadListener() {
            @Override
            public void onAdLoaded(@NonNull NativeAd nativeAd) {
                feedLoading.remove(id);
                if (feedCancelled.contains(id)) { feedResolve(call, false, 0); return; }
                FrameLayout wrapper = buildNativeCard(nativeAd, () -> {
                    removeFeedView(id);
                    JSObject ev = new JSObject();
                    ev.put("id", id);
                    notifyListeners("feedClosed", ev);
                });
                if (wrapper == null) { feedResolve(call, false, 0); return; }
                feedViews.put(id, wrapper);
                attachToRoot(wrapper, widthDp);
                applyFeedRect(id, wrapper, xDp, yDp, widthDp, true);
                int h = measureHeightDp(wrapper, widthDp);
                feedHeights.put(id, h);
                feedResolve(call, h > 0, h);
            }
            @Override
            public void onAdFailedToLoad(@NonNull AdRequestError error) {
                feedLoading.remove(id);
                feedResolve(call, false, 0);
            }
        });
    }

    private void loadFeedBanner(PluginCall call, String id, String adUnitId, int xDp, int yDp, int widthDp) {
        Activity activity = getActivity();
        Context ctx = activity != null ? activity : getContext();
        BannerAdView banner = new BannerAdView(ctx);
        // Адаптивный inline-баннер: ширина слота, высота — не больше 260dp (SDK подберёт размер).
        banner.setAdSize(BannerAdSize.inline(ctx, widthDp > 0 ? widthDp : 320, 260));
        final boolean[] done = {false};
        banner.setBannerAdEventListener(new BannerAdEventListener() {
            @Override
            public void onAdLoaded() {
                if (done[0]) return;
                done[0] = true;
                feedLoading.remove(id);
                if (feedCancelled.contains(id)) { banner.destroy(); feedResolve(call, false, 0); return; }
                feedViews.put(id, banner);
                attachToRoot(banner, widthDp);
                applyFeedRect(id, banner, xDp, yDp, widthDp, true);
                int h = measureHeightDp(banner, widthDp);
                feedHeights.put(id, h);
                feedResolve(call, h > 0, h);
            }
            @Override
            public void onAdFailedToLoad(@NonNull AdRequestError error) {
                if (done[0]) return;
                done[0] = true;
                feedLoading.remove(id);
                banner.destroy();
                feedResolve(call, false, 0);
            }
            @Override public void onAdClicked() {}
            @Override public void onLeftApplication() {}
            @Override public void onReturnedToApplication() {}
            @Override public void onImpression(@Nullable ImpressionData impressionData) {}
        });
        banner.loadAd(new AdRequest.Builder(adUnitId).build());
    }

    @PluginMethod
    public void positionFeedAd(PluginCall call) {
        String id = call.getString("id");
        int xDp = call.getInt("x", 0);
        int yDp = call.getInt("y", 0);
        int widthDp = call.getInt("width", 0);
        boolean visible = call.getBoolean("visible", true);
        ui(() -> {
            if (id == null) return;
            View v = feedViews.get(id);
            if (v != null) applyFeedRect(id, v, xDp, yDp, widthDp, visible);
        });
        call.resolve();
    }

    @PluginMethod
    public void hideFeedAd(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            feedCancelled.add(id);
            ui(() -> removeFeedView(id));
        }
        call.resolve();
    }

    @PluginMethod
    public void hideAllFeedAds(PluginCall call) {
        feedCancelled.addAll(feedLoading);
        ui(() -> {
            for (String id : new ArrayList<>(feedViews.keySet())) removeFeedView(id);
        });
        call.resolve();
    }

    /** Рейтинг приложения для нативного шаблона: SDK ожидает View, реализующую Rating. */
    private static final class StarRatingView extends TextView implements Rating {
        private float currentRating = 0f;

        StarRatingView(Context context) { super(context); }

        @Override
        public void setRating(float value) {
            currentRating = value;
            if (value <= 0f) {
                setVisibility(GONE);
                return;
            }
            setVisibility(VISIBLE);
            setText(String.format(Locale.US, "★ %.1f", value));
        }

        @Override
        public float getRating() {
            return currentRating;
        }
    }

    @Override
    protected void handleOnDestroy() {
        cancelRewardedTimeout();
        if (interstitialAd != null) interstitialAd.setAdEventListener(null);
        if (rewardedAd != null) rewardedAd.setAdEventListener(null);
        interstitialAd = null;
        rewardedAd = null;
        interstitialLoader = null;
        rewardedLoader = null;
        nativeLoader = null;
        for (View v : feedViews.values()) {
            if (v instanceof BannerAdView) ((BannerAdView) v).destroy();
        }
        feedViews.clear();
        feedHeights.clear();
        feedLoading.clear();
        feedCancelled.clear();
        super.handleOnDestroy();
    }
}
