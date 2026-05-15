package com.engineering.pms.realtime;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.engineering.pms.MainActivity;
import com.engineering.pms.R;
import com.google.gson.JsonObject;

import java.util.Collections;

/**
 * Foreground Service：维持 PocketBase Realtime SSE 长连接。
 *
 * 设计要点（来自 PR 2 技术研究 §2-§3）：
 *   - foregroundServiceType = dataSync（manifest 声明 + 启动时传入）
 *   - 持久通知用 IMPORTANCE_LOW 频道，避免常驻打扰
 *   - 业务事件通过 LocalBroadcast 转给 RealtimePlugin → notifyListeners → JS
 *   - 监听 ConnectivityManager.NetworkCallback 网络恢复时即时重连
 *   - Android 15 onTimeout 时 stopSelf + AlarmManager 15min 后唤醒
 *   - onTaskRemoved（用户划掉最近任务）时 alarm 自我重启
 */
public class RealtimeService extends Service implements PbSseClient.Listener {

    private static final String TAG = "RealtimeService";

    public static final String ACTION_START = "com.engineering.pms.realtime.START";
    public static final String ACTION_STOP = "com.engineering.pms.realtime.STOP";
    public static final String ACTION_UPDATE_TOKEN = "com.engineering.pms.realtime.UPDATE_TOKEN";

    public static final String EXTRA_BASE_URL = "baseUrl";
    public static final String EXTRA_TOKEN = "token";

    public static final String BROADCAST_EVENT = "com.engineering.pms.realtime.EVENT";
    public static final String EXTRA_TOPIC = "topic";
    public static final String EXTRA_ACTION = "action";
    public static final String EXTRA_RECORD_JSON = "recordJson";
    public static final String EXTRA_STATUS = "status"; // connected | failed

    private static final String CHANNEL_ID_ONGOING = "engineering_pms_background";
    private static final String CHANNEL_ID_NOTIFICATIONS = "engineering_pms_default";
    private static final int NOTIF_ID_ONGOING = 4097;
    private static final int NOTIF_ID_BUSINESS_BASE = 5000;

    private PbSseClient client;
    private String currentBaseUrl;
    private String currentToken;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private int businessNotifSerial = 0;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "onCreate");
        createNotificationChannels();
        registerNetworkCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            Log.w(TAG, "intent is null, ignoring");
            return START_STICKY;
        }
        String action = intent.getAction();
        Log.i(TAG, "onStartCommand action=" + action);

        if (ACTION_STOP.equals(action)) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE_TOKEN.equals(action)) {
            String token = intent.getStringExtra(EXTRA_TOKEN);
            if (token != null && !token.equals(currentToken)) {
                currentToken = token;
                if (client != null) {
                    client.stop();
                    client = null;
                }
                startSseClient();
            }
            return START_STICKY;
        }

        // ACTION_START（默认）
        String baseUrl = intent.getStringExtra(EXTRA_BASE_URL);
        String token = intent.getStringExtra(EXTRA_TOKEN);
        if (baseUrl == null || token == null) {
            Log.w(TAG, "missing baseUrl/token, stopping");
            stopSelf();
            return START_NOT_STICKY;
        }
        currentBaseUrl = baseUrl;
        currentToken = token;

        startForegroundCompat();
        if (client == null) {
            startSseClient();
        }
        return START_STICKY;
    }

    private void startSseClient() {
        client = new PbSseClient(
                currentBaseUrl,
                currentToken,
                Collections.singletonList("notifications/*"),
                this
        );
        client.start();
    }

    private void startForegroundCompat() {
        Notification notif = buildOngoingNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34+ 必须传 type
            startForeground(NOTIF_ID_ONGOING, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID_ONGOING, notif);
        }
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        if (client != null) {
            client.stop();
            client = null;
        }
    }

    private Notification buildOngoingNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID_ONGOING)
                .setContentTitle("工程结算管理")
                .setContentText("消息接收中（点击打开应用）")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // 持久通知频道（低优先级，无声）
        NotificationChannel ongoing = new NotificationChannel(
                CHANNEL_ID_ONGOING, "后台保活", NotificationManager.IMPORTANCE_LOW);
        ongoing.setDescription("保持消息长连接所需的常驻通知");
        ongoing.setShowBadge(false);
        nm.createNotificationChannel(ongoing);

        // 业务消息频道（高优先级，与 nativeNotifications.ts 一致）
        if (nm.getNotificationChannel(CHANNEL_ID_NOTIFICATIONS) == null) {
            NotificationChannel biz = new NotificationChannel(
                    CHANNEL_ID_NOTIFICATIONS, "工程结算管理", NotificationManager.IMPORTANCE_HIGH);
            biz.setDescription("任务与消息提醒");
            biz.enableVibration(true);
            nm.createNotificationChannel(biz);
        }
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        NetworkRequest req = new NetworkRequest.Builder()
                .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                Log.i(TAG, "network available, trigger immediate reconnect");
                if (client != null && !client.isStopped()) {
                    client.reconnectNow();
                }
            }
        };
        try {
            connectivityManager.registerNetworkCallback(req, networkCallback);
        } catch (SecurityException e) {
            Log.w(TAG, "registerNetworkCallback denied", e);
        }
    }

    private void unregisterNetworkCallback() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (IllegalArgumentException e) {
                // already unregistered
            }
            networkCallback = null;
        }
    }

    // ----- PbSseClient.Listener -----

    @Override
    public void onConnected() {
        Intent i = new Intent(BROADCAST_EVENT);
        i.putExtra(EXTRA_STATUS, "connected");
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);
    }

    @Override
    public void onMessage(@NonNull String topic, @NonNull String action, @NonNull JsonObject record) {
        // 转发给 RealtimePlugin（如果 plugin 活着；否则 Service 自己 schedule LocalNotification）
        Intent i = new Intent(BROADCAST_EVENT);
        i.putExtra(EXTRA_TOPIC, topic);
        i.putExtra(EXTRA_ACTION, action);
        i.putExtra(EXTRA_RECORD_JSON, record.toString());
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);

        // 后台兜底：直接 post 系统通知
        if ("create".equals(action)) {
            postBusinessNotification(record);
        }
    }

    @Override
    public void onPermanentFailure(@NonNull String reason) {
        Log.w(TAG, "permanent failure: " + reason);
        Intent i = new Intent(BROADCAST_EVENT);
        i.putExtra(EXTRA_STATUS, "failed");
        i.putExtra("reason", reason);
        LocalBroadcastManager.getInstance(this).sendBroadcast(i);

        // 弹一条通知告知用户连接异常
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID_NOTIFICATIONS)
                .setContentTitle("工程结算管理")
                .setContentText("消息连接异常，请重启应用")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID_BUSINESS_BASE - 1, notif);
    }

    private void postBusinessNotification(@NonNull JsonObject record) {
        String title = record.has("title") ? record.get("title").getAsString() : "工程结算管理";
        String body = record.has("content") ? record.get("content").getAsString() : "您有一条新消息";
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID_NOTIFICATIONS)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVibrate(new long[]{0, 200, 100, 200, 100, 200})
                .build();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID_BUSINESS_BASE + (businessNotifSerial++ % 100), notif);
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // Android 15+ dataSync 6 小时超时
        Log.w(TAG, "service onTimeout, scheduling alarm restart in 15 min");
        scheduleAlarmRestart(15 * 60 * 1000);
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 用户从最近任务列表划掉 — 国产 ROM 杀后台路径之一
        Log.i(TAG, "onTaskRemoved, scheduling alarm restart in 1 second");
        scheduleAlarmRestart(1000);
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleAlarmRestart(long delayMs) {
        if (currentBaseUrl == null || currentToken == null) return;
        Intent restartIntent = new Intent(this, RealtimeService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_BASE_URL, currentBaseUrl)
                .putExtra(EXTRA_TOKEN, currentToken);
        PendingIntent pi = PendingIntent.getService(this, 0, restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.set(AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + delayMs, pi);
        }
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "onDestroy");
        if (client != null) {
            client.stop();
            client = null;
        }
        unregisterNetworkCallback();
        super.onDestroy();
    }
}
