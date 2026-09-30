package de.hagi089.travelbook

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity
import de.hagi089.travelbook.tracking.TrackingPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Eigene Plugins müssen vor super.onCreate registriert werden.
        registerPlugin(TrackingPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Zurück-Taste: Zuerst die Oberfläche fragen (Sheet schließen, Unterseite verlassen, siehe src/ui/chrome.ts).
        // Nur wenn sie nichts zu tun hat, gilt die Standardaktion (App verlassen). Dieser Rückruf wurde nach dem von
        // Capacitor hinzugefügt und hat deshalb Vorrang.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView == null) {
                    passOn()
                    return
                }
                webView.evaluateJavascript(
                    "(function(){try{return typeof window.__travelbookBack==='function'&&window.__travelbookBack()===true;}catch(e){return false;}})()",
                ) { result -> if (result != "true") passOn() }
            }

            private fun passOn() {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
            }
        })
    }
}
