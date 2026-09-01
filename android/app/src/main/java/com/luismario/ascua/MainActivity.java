package com.luismario.ascua;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PageSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
