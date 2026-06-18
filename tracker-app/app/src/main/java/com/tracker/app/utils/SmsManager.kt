package com.tracker.app.utils

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.tracker.app.data.model.LocationResponse
import com.tracker.app.data.model.RelayResponse
import com.tracker.app.data.model.StatusResponse

/**
 * SMS Manager for sending commands to tracker and receiving responses
 */
class SmsManager(private val context: Context) {

    companion object {
        private const val TAG = "SmsManager"
    }

    private val trackerPhoneNumber: String by lazy {
        getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
            .getString("tracker_number", "") ?: ""
    }

    /**
     * Send SMS command to tracker
     */
    fun sendCommand(command: String, callback: (Boolean, String) -> Unit) {
        if (trackerPhoneNumber.isEmpty()) {
            callback(false, "Tracker phone number not configured")
            return
        }

        if (!hasSmsPermission()) {
            callback(false, "SMS permission not granted")
            return
        }

        try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(command)
            
            smsManager.sendMultipartTextMessage(
                trackerPhoneNumber,
                null,
                parts,
                null,
                object : SmsManager.SendMultipartTextCallback() {
                    override fun onSuccess(sentMessageUri: Uri?) {
                        Log.d(TAG, "Command sent: $command")
                        callback(true, "Command sent successfully")
                    }

                    override fun onError(sentMessageUri: Uri?, error: Int) {
                        Log.e(TAG, "Send error: $error")
                        callback(false, "Failed to send command. Error: $error")
                    }
                },
                null
            )
        } catch (e: Exception) {
            Log.e(TAG, "Exception sending SMS", e)
            callback(false, "Error: ${e.message}")
        }
    }

    /**
     * Get location using WHERE# command
     */
    fun getLocation(callback: (Boolean, String, LocationResponse?) -> Unit) {
        sendCommand(SmsCommands.WHERE) { success, message ->
            if (success) {
                callback(true, "Location request sent. Waiting for response...", null)
            } else {
                callback(false, message, null)
            }
        }
    }

    /**
     * Get status using PARAM# command
     */
    fun getStatus(callback: (Boolean, String, StatusResponse?) -> Unit) {
        sendCommand(SmsCommands.PARAM) { success, message ->
            if (success) {
                callback(true, "Status request sent. Waiting for response...", null)
            } else {
                callback(false, message, null)
            }
        }
    }

    /**
     * Turn engine ON (supply fuel)
     */
    fun engineOn(callback: (Boolean, String) -> Unit) {
        sendCommand(SmsCommands.RELAY_ON) { success, message ->
            callback(success, message)
        }
    }

    /**
     * Turn engine OFF (cut fuel)
     */
    fun engineOff(callback: (Boolean, String) -> Unit) {
        sendCommand(SmsCommands.RELAY_OFF) { success, message ->
            callback(success, message)
        }
    }

    /**
     * Process incoming SMS response - Only from tracker number
     */
    fun processIncomingSms(from: String, body: String): SmsResponse? {
        // Only process messages FROM the tracker number
        val cleanFrom = from?.replace("[^\\d]".toRegex(), "") ?: ""
        val cleanTracker = trackerPhoneNumber?.replace("[^\\d]".toRegex(), "") ?: ""
        
        // Check if from exact tracker number
        if (cleanFrom != cleanTracker || cleanTracker.isEmpty()) {
            Log.d(TAG, "SMS ignored - not from tracker: $from")
            return null
        }
        
        return when {
            body.contains("ditu.google.cn") -> {
                val location = SmsParser.parseLocationResponse(body)
                SmsResponse.Location(location)
            }
            body.contains("*C:") && body.contains("*O:") -> {
                val status = SmsParser.parseStatusResponse(body)
                SmsResponse.Status(status)
            }
            body.contains("successfully") -> {
                val relay = SmsParser.parseRelayResponse(body)
                SmsResponse.Relay(relay)
            }
            else -> SmsResponse.Unknown(body)
        }
    }

    /**
     * Check SMS permission
     */
    private fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Save tracker phone number
     */
    fun saveTrackerNumber(phoneNumber: String) {
        context.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("tracker_number", phoneNumber)
            .apply()
    }

    /**
     * Get tracker phone number
     */
    fun getTrackerNumber(): String = trackerPhoneNumber

    /**
     * Clear tracker number
     */
    fun clearTrackerNumber() {
        context.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
            .edit()
            .remove("tracker_number")
            .apply()
    }
}

/**
 * SMS Response types
 */
sealed class SmsResponse {
    data class Location(val location: LocationResponse?) : SmsResponse()
    data class Status(val status: StatusResponse?) : SmsResponse()
    data class Relay(val relay: RelayResponse) : SmsResponse()
    data class Unknown(val raw: String) : SmsResponse()
}