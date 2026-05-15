package com.engineering.pms;

import android.os.Bundle;

import com.engineering.pms.realtime.RealtimePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RealtimePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
