package com.tracker.app.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.telephony.SmsMessage
import android.util.Log

/**
 * SMS Receiver to handle incoming messages from tracker
 */
class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.provider.Telephony.SMS_RECEIVED") return

        val bundle = intent.extras ?: return
        val pdus = bundle.get("pdus") as? Array<*> ?: return

        for (pdu in pdus) {
            val message = SmsMessage.createFromPdu(pdu as ByteArray)
            val from = message.originatingAddress
            val body = message.messageBody

            Log.d(TAG, "SMS from: $from")
            Log.d(TAG, "SMS body: $body")

            // Process the incoming SMS
            processIncomingSms(context, from, body)
        }
    }

    private fun processIncomingSms(context: Context, from: String, body: String) {
        val prefs = context.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
        val trackerNumber = prefs.getString("tracker_number", "") ?: ""

        // Only process messages FROM the exact tracker number
        val cleanFrom = from?.replace("[^\\d]".toRegex(), "") ?: ""
        val cleanTracker = trackerNumber?.replace("[^\\d]".toRegex(), "") ?: ""

        if (cleanFrom != cleanTracker || cleanTracker.isEmpty()) {
            Log.d(TAG, "SMS ignored - not from tracker: $from")
            return
        }

        Log.d(TAG, "Processing SMS from tracker: $from")

        // Parse response based on content
        when {
            body.contains("ditu.google.cn") -> {
                // Location response
                val location = SmsParser.parseLocationResponse(body)
                if (location != null) {
                    prefs.edit()
                        .putString("last_latitude", location.latitude.toString())
                        .putString("last_longitude", location.longitude.toString())
                        .putLong("last_location_time", System.currentTimeMillis())
                        .apply()

                    Log.d(TAG, "Location: ${location.latitude}, ${location.longitude}")
                }
            }
            body.contains("*C:") && body.contains("*O:") -> {
                // Status response
                val status = SmsParser.parseStatusResponse(body)
                if (status != null) {
                    prefs.edit()
                        .putString("last_battery", status.batteryVoltage.toString())
                        .putString("last_speed", status.speed.toString())
                        .putString("last_ignition", status.ignition.toString())
                        .putString("last_relay", status.relayStatus.toString())
                        .putLong("last_status_time", System.currentTimeMillis())
                        .apply()

                    Log.d(TAG, "Status: battery=${status.batteryVoltage}, speed=${status.speed}, ignition=${status.ignition}")
                }
            }
            body.contains("successfully") -> {
                // Relay response
                val relay = SmsParser.parseRelayResponse(body)
                prefs.edit()
                    .putString("last_engine_state", relay.engineState.name)
                    .putLong("last_relay_time", System.currentTimeMillis())
                    .apply()

                Log.d(TAG, "Relay: ${relay.engineState}")
            }
        }
    }
}