package com.tracker.app.utils

import com.tracker.app.data.model.EngineState
import com.tracker.app.data.model.LocationResponse
import com.tracker.app.data.model.RelayResponse
import com.tracker.app.data.model.StatusResponse

/**
 * SMS Parser for Lynkworld LW2G-4C GPS Tracker
 */
object SmsParser {

    /**
     * Parse WHERE# response
     * Returns Google Maps link: http://ditu.google.cn/?q=N1.339798,E34.297729
     */
    fun parseLocationResponse(smsBody: String): LocationResponse? {
        val urlPattern = "http://ditu\\.google\\.cn/\\?q=([^\\s]+)".toRegex()
        val match = urlPattern.find(smsBody) ?: return null
        
        val coords = match.groupValues[1]
        val latLngPattern = "N([-\\d.]+),E([-\\d.]+)".toRegex()
        val latLngMatch = latLngPattern.find(coords) ?: return null
        
        val latitude = latLngMatch.groupValues[1].toDoubleOrNull() ?: return null
        val longitude = latLngMatch.groupValues[2].toDoubleOrNull() ?: return null
        
        return LocationResponse(
            latitude = latitude,
            longitude = longitude,
            mapsUrl = "http://ditu.google.cn/?q=N$latitude,E$longitude"
        )
    }

    /**
     * Parse PARAM# response
     * Example: <*C:30*O:300*C2:30*O2:300*H:180*CS:0*1H:1*2A:1*3U:0*3Z:0*GP:NO*60:0*5Y:10.0*3H:1*9E:00:00*1H:1*68:1*>
     */
    fun parseStatusResponse(smsBody: String): StatusResponse? {
        try {
            // Extract values from encoded response
            val battery = extractValue(smsBody, "C")?.toIntOrNull()?.let { it / 10.0 } ?: 0.0
            val backupBattery = extractValue(smsBody, "O")?.toIntOrNull()?.let { it / 10.0 } ?: 0.0
            val gsmSignal = extractValue(smsBody, "H")?.toIntOrNull() ?: 0
            val ignition = extractValue(smsBody, "1H") == "1"
            val speed = extractValue(smsBody, "5Y")?.toDoubleOrNull() ?: 0.0
            val relayStatus = extractValue(smsBody, "68")?.toIntOrNull() ?: 0
            val gpsValid = extractValue(smsBody, "GP") == "YES"
            
            return StatusResponse(
                batteryVoltage = battery,
                backupBattery = backupBattery,
                gsmSignal = gsmSignal,
                ignition = ignition,
                speed = speed,
                relayStatus = relayStatus,
                gpsValid = gpsValid
            )
        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Parse RELAY command response
     * RELAY,0# -> "supply fuel successfully"
     * RELAY,1# -> "cut off fuel successfully"
     */
    fun parseRelayResponse(smsBody: String): RelayResponse {
        val success = smsBody.contains("successfully", ignoreCase = true)
        val engineState = when {
            smsBody.contains("supply", ignoreCase = true) -> EngineState.ON
            smsBody.contains("cut off", ignoreCase = true) -> EngineState.OFF
            else -> EngineState.ON // default
        }
        
        return RelayResponse(
            success = success,
            message = smsBody.trim(),
            engineState = engineState
        )
    }

    private fun extractValue(response: String, key: String): String? {
        val pattern = "\\*$key:([^*]+)\\*".toRegex()
        return pattern.find(response)?.groupValues?.get(1)
    }
}

/**
 * SMS Commands for Lynkworld LW2G-4C
 */
object SmsCommands {
    const val WHERE = "WHERE#"
    const val PARAM = "PARAM#"
    const val RELAY_ON = "RELAY,0#"      // Supply fuel (engine on)
    const val RELAY_OFF = "RELAY,1#"     // Cut fuel (engine off)
    const val SET_APN = "APN,internet#" // Set APN
    
    fun buildCommand(command: String): String = command
}