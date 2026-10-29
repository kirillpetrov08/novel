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
import android.widget.RatingBar;
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

/**
 * Локальный Capacitor-плагин Yandex Mobile Ads SDK (com.yandex.android:mobileads).
 * SDK в актуальной версии инициализируется автоматически при старте приложения.
 *
 * Методы из JS (Capacitor.Plugins.YandexAds):
 *   initialize()                                  -> { ready: true } (автоинициализация SDK)
 *   preloadInterstitial({adUnitId}) / preloadRewarded({adUnitId})
 *   showInterstitial({adUnitId})                  -> { shown } резолвится при закрытии/ошибке/неготовности
 *   showRewarded({adUnitId})                      -> { rewarded } резолвится при закрытии; rewarded=true только после onRewarded
 *   showNative({adUnitId, bottomMarginDp})        -> { shown } карточка поверх WebView снизу (в библиотеке)
 *   hideNative()                                  -> {}
 * Событие в JS: "nativeClosed" — пользователь закрыл нативную карточку крестиком.
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
        int bottomMarginDp = call.getInt("bottomMarginDp", 68);
        ui(() -> {
            Context ctx = getContext();
            Activity activity = getActivity();
            if (ctx == null || activity == null || adUnitId == null || nativeWrapper != null || nativeLoading) {
                JSObject ret = new JSObject();
                ret.put("shown", nativeWrapper != null);
                call.resolve(ret);
                return;
            }
            if (nativeLoader == null) nativeLoader = new NativeAdLoader(ctx);
            nativeLoading = true;
            nativeLoader.loadAd(new AdRequest.Builder(adUnitId).build(), new NativeAdLoadListener() {
                @Override
                public void onAdLoaded(@NonNull NativeAd nativeAd) {
                    nativeLoading = false;
                    boolean ok = renderNative(nativeAd, bottomMarginDp);
                    JSObject ret = new JSObject();
                    ret.put("shown", ok);
                    call.resolve(ret);
                }
                @Override
                public void onAdFailedToLoad(@NonNull AdRequestError error) {
                    nativeLoading = false;
                    JSObject ret = new JSObject();
                    ret.put("shown", false);
                    call.resolve(ret);
                }
            });
        });
    }

    @PluginMethod
    public void hideNative(PluginCall call) {
        ui(() -> removeNative());
        call.resolve();
    }

    private void removeNative() {
        if (nativeWrapper != null && nativeWrapper.getParent() instanceof ViewGroup) {
            ((ViewGroup) nativeWrapper.getParent()).removeView(nativeWrapper);
        }
        nativeWrapper = null;
    }

    private TextView text(Context ctx, float sp, int color, boolean bold) {
        TextView tv = new TextView(ctx);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setMaxLines(2);
        return tv;
    }

    /** Шаблон нативной карточки в фирменной бежевой палитре, строится программно. */
    private boolean renderNative(NativeAd nativeAd, int bottomMarginDp) {
        Activity activity = getActivity();
        if (activity == null) return false;
        Context ctx = activity;
        removeNative();

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
        RatingBar rating = new RatingBar(ctx, null, android.R.attr.ratingBarStyleSmall);
        rating.setNumStars(5);
        rating.setIsIndicator(true);
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
        close.setOnClickListener(v -> {
            removeNative();
            notifyListeners("nativeClosed", new JSObject());
        });
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

        ViewGroup root = activity.findViewById(android.R.id.content);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        lp.leftMargin = dp(12);
        lp.rightMargin = dp(12);
        lp.bottomMargin = dp(bottomMarginDp);
        root.addView(wrapper, lp);
        wrapper.bringToFront();
        nativeWrapper = wrapper;
        return true;
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
        super.handleOnDestroy();
    }
}
