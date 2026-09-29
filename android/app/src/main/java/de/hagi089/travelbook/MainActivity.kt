package de.hagi089.travelbook

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import de.hagi089.travelbook.tracking.TrackingPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Eigene Plugins müssen vor super.onCreate registriert werden.
        registerPlugin(TrackingPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
