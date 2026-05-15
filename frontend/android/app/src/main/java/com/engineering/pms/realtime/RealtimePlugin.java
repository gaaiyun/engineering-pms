package com.engineering.pms.realtime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor Plugin — 暴露 start/stop/updateToken 给 JS，
 * 接收 Service 的 LocalBroadcast 事件并通过 notifyListeners 推给 JS。
 *
 * 注意：Plugin lifecycle 跟 Activity 走，Service 独立运行；
 *      Plugin 销毁后 Service 仍能继续，只是事件没有 JS 监听者。
 */
@CapacitorPlugin(name = "Realtime")
public class RealtimePlugin extends Plugin {

    private static final String TAG = "RealtimePlugin";

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            JSObject data = new JSObject();
            String status = intent.getStringExtra(RealtimeService.EXTRA_STATUS);
            if (status != null) {
                data.put("type", status); // "connected" | "failed"
                if ("failed".equals(status)) {
                    data.put("reason", intent.getStringExtra("reason"));
                }
                notifyListeners("status", data);
                return;
            }
            data.put("type", "message");
            data.put("topic", intent.getStringExtra(RealtimeService.EXTRA_TOPIC));
            data.put("action", intent.getStringExtra(RealtimeService.EXTRA_ACTION));
            data.put("record", intent.getStringExtra(RealtimeService.EXTRA_RECORD_JSON));
            notifyListeners("notification", data);
        }
    };

    @Override
    public void load() {
        LocalBroadcastManager.getInstance(getContext())
                .registerReceiver(receiver, new IntentFilter(RealtimeService.BROADCAST_EVENT));
    }

    @Override
    protected void handleOnDestroy() {
        try {
            LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {}
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String token = call.getString("token");
        if (baseUrl == null || token == null) {
            call.reject("baseUrl and token are required");
            return;
        }
        Intent svc = new Intent(getContext(), RealtimeService.class)
                .setAction(RealtimeService.ACTION_START)
                .putExtra(RealtimeService.EXTRA_BASE_URL, baseUrl)
                .putExtra(RealtimeService.EXTRA_TOKEN, token);
        try {
            ContextCompat.startForegroundService(getContext(), svc);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "startForegroundService failed", e);
            call.reject("startForegroundService failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent svc = new Intent(getContext(), RealtimeService.class)
                .setAction(RealtimeService.ACTION_STOP);
        try {
            // ContextCompat.startForegroundService is required pre-O to deliver intent;
            // post-O stop via the same Service action is fine
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(svc);
            } else {
                getContext().startService(svc);
            }
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "stop failed", e);
            call.reject("stop failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }
        Intent svc = new Intent(getContext(), RealtimeService.class)
                .setAction(RealtimeService.ACTION_UPDATE_TOKEN)
                .putExtra(RealtimeService.EXTRA_TOKEN, token);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(svc);
            } else {
                getContext().startService(svc);
            }
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "updateToken failed", e);
            call.reject("updateToken failed: " + e.getMessage());
        }
    }
}
