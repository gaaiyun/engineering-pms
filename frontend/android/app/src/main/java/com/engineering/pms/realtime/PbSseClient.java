package com.engineering.pms.realtime;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.util.List;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.sse.EventSource;
import okhttp3.sse.EventSourceListener;
import okhttp3.sse.EventSources;

/**
 * PocketBase Realtime SSE 客户端
 *
 * 协议（来自 docs/superpowers/research/2026-05-16-pr2-tech-reference.md §1）：
 *   1) GET /api/realtime  → 服务端立即推 PB_CONNECT 事件含 clientId
 *   2) POST /api/realtime { clientId, subscriptions } 提交订阅
 *   3) 服务端按订阅 push  event: <topic>\n data: { action, record }
 *
 * 关键设计：
 *   - readTimeout=0（SSE 不允许 read timeout，否则 5 分钟必断）
 *   - 重连：指数退避 1→2→4→8→16→30s + ±20% jitter
 *   - 重连后调用方需自己拉差集（PB 不带 Last-Event-ID）
 */
public class PbSseClient {

    private static final String TAG = "PbSseClient";
    private static final MediaType JSON_MEDIA = MediaType.get("application/json; charset=utf-8");

    public interface Listener {
        /** 收到业务事件（已剥离 PB_CONNECT 等元事件） */
        void onMessage(@NonNull String topic, @NonNull String action, @NonNull JsonObject record);
        /** 连接建立完成（已成功 POST 订阅） */
        void onConnected();
        /** 永久失败：重连 ≥10 次仍然不通，调用方应停止 Service 或弹通知 */
        void onPermanentFailure(@NonNull String reason);
    }

    private final String baseUrl;
    private final String authToken;
    private final List<String> subscriptions;
    private final Listener listener;
    private final OkHttpClient httpClient;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Random jitter = new Random();

    private volatile EventSource currentSource;
    private volatile boolean stopped = false;
    private volatile String clientId;
    private int reconnectAttempts = 0;
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private static final long[] BACKOFF_SEC = { 1, 2, 4, 8, 16, 30 };

    public PbSseClient(@NonNull String baseUrl,
                       @NonNull String authToken,
                       @NonNull List<String> subscriptions,
                       @NonNull Listener listener) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.authToken = authToken;
        this.subscriptions = subscriptions;
        this.listener = listener;
        this.httpClient = new OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .connectTimeout(15, TimeUnit.SECONDS)
                .pingInterval(0, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
    }

    public void start() {
        stopped = false;
        connect();
    }

    public void stop() {
        stopped = true;
        EventSource src = currentSource;
        if (src != null) {
            src.cancel();
            currentSource = null;
        }
    }

    public boolean isStopped() {
        return stopped;
    }

    private void connect() {
        if (stopped) return;
        Request req = new Request.Builder()
                .url(baseUrl + "/api/realtime")
                .header("Accept", "text/event-stream")
                .header("Authorization", authToken)
                .build();
        currentSource = EventSources.createFactory(httpClient).newEventSource(req, sseListener);
        Log.i(TAG, "SSE connecting to " + baseUrl + "/api/realtime");
    }

    private final EventSourceListener sseListener = new EventSourceListener() {
        @Override
        public void onOpen(@NonNull EventSource es, @NonNull Response response) {
            Log.i(TAG, "SSE onOpen: " + response.code());
            reconnectAttempts = 0;
        }

        @Override
        public void onEvent(@NonNull EventSource es, @Nullable String id, @Nullable String type, @NonNull String data) {
            try {
                JsonObject json = JsonParser.parseString(data).getAsJsonObject();
                if ("PB_CONNECT".equals(type)) {
                    clientId = json.has("clientId") ? json.get("clientId").getAsString() : null;
                    Log.i(TAG, "PB_CONNECT clientId=" + clientId);
                    submitSubscriptions();
                } else {
                    String topic = type != null ? type : "";
                    String action = json.has("action") ? json.get("action").getAsString() : "";
                    JsonObject record = json.has("record") && json.get("record").isJsonObject()
                            ? json.getAsJsonObject("record")
                            : new JsonObject();
                    listener.onMessage(topic, action, record);
                }
            } catch (Exception e) {
                Log.w(TAG, "parse SSE event failed", e);
            }
        }

        @Override
        public void onClosed(@NonNull EventSource es) {
            Log.i(TAG, "SSE onClosed");
            scheduleReconnect("closed");
        }

        @Override
        public void onFailure(@NonNull EventSource es, @Nullable Throwable t, @Nullable Response response) {
            String reason = (response != null ? "http " + response.code() : "") +
                    (t != null ? " " + t.getClass().getSimpleName() + ": " + t.getMessage() : "");
            Log.w(TAG, "SSE onFailure: " + reason);
            scheduleReconnect(reason);
        }
    };

    private void submitSubscriptions() {
        if (clientId == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("clientId", clientId);
        JsonArray arr = new JsonArray();
        for (String s : subscriptions) arr.add(s);
        body.add("subscriptions", arr);

        Request req = new Request.Builder()
                .url(baseUrl + "/api/realtime")
                .header("Authorization", authToken)
                .post(RequestBody.create(body.toString(), JSON_MEDIA))
                .build();

        httpClient.newCall(req).enqueue(new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                Log.w(TAG, "submit subscriptions failed", e);
                scheduleReconnect("subscribe-failed");
            }
            @Override public void onResponse(@NonNull Call call, @NonNull Response response) {
                try (ResponseBody b = response.body()) {
                    if (response.isSuccessful()) {
                        Log.i(TAG, "subscriptions submitted: " + subscriptions);
                        listener.onConnected();
                    } else {
                        Log.w(TAG, "submit subscriptions http " + response.code());
                        scheduleReconnect("subscribe-http-" + response.code());
                    }
                }
            }
        });
    }

    private void scheduleReconnect(@NonNull String reason) {
        if (stopped) return;
        reconnectAttempts++;
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "max reconnect attempts reached, giving up");
            listener.onPermanentFailure(reason);
            return;
        }
        long baseSec = BACKOFF_SEC[Math.min(reconnectAttempts - 1, BACKOFF_SEC.length - 1)];
        long jitterMs = (long) (baseSec * 1000 * 0.2 * (jitter.nextDouble() * 2 - 1));
        long delayMs = baseSec * 1000 + jitterMs;
        Log.i(TAG, "reconnect attempt " + reconnectAttempts + " in " + delayMs + "ms (reason: " + reason + ")");
        mainHandler.postDelayed(this::connect, delayMs);
    }

    /** 外部触发即时重连（如 NetworkCallback 收到 onAvailable） */
    public void reconnectNow() {
        if (stopped) return;
        Log.i(TAG, "reconnect-now triggered");
        EventSource src = currentSource;
        if (src != null) src.cancel();
        reconnectAttempts = 0;
        mainHandler.post(this::connect);
    }
}
