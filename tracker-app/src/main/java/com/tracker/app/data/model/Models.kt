package com.tracker.app.data.model

/**
 * Response from WHERE# command - Google Maps link
 * Example: http://ditu.google.cn/?q=N1.339798,E34.297729
 */
data class LocationResponse(
    val latitude: Double,
    val longitude: Double,
    val mapsUrl: String
)

/**
 * Response from PARAM# command
 * Example: <*C:30*O:300*C2:30*O2:300*H:180*CS:0*1H:1*2A:1*3U:0*3Z:0*GP:NO*60:0*5Y:10.0*3H:1*9E:00:00*1H:1*68:1*>
 */
data class StatusResponse(
    val batteryVoltage: Double,      // C: Battery (divide by 10)
    val backupBattery: Double,       // O: Backup battery
    val gsmSignal: Int,            // H: GSM signal strength
    val ignition: Boolean,         // 1H: Ignition status
    val speed: Double,            // 5Y: Speed
    val relayStatus: Int,            // 68: Relay status (0=normal, 1=cut)
    val gpsValid: Boolean           // GP: GPS status (YES/NO)
)

/**
 * Response from KIP# or network status command
 * Example: <CKIP*T:185.213.2.30,32085*C:30/300*D:0.0.0.0,0*V:30/300*E:120.25.232.237,1234*LIP:120.76.67.69,4540>
 */
data class NetworkStatusResponse(
    val serverIp: String,          // T: Server IP,port
    val batteryPercent: Int,       // C: Battery percent
    val externalPower: Int,        // V: External voltage (mV)
    val serverExternalIp: String,   // E: External IP,port
    val localIp: String,           // LIP: Local IP,port
    val deviceStatus: Int         // D: Device status
)

/**
 * Response from RELAY commands
 * RELAY,0# -> "supply fuel successfully"
 * RELAY,1# -> "cut off fuel successfully"
 */
data class RelayResponse(
    val success: Boolean,
    val message: String,
    val engineState: EngineState
)

enum class EngineState {
    ON,   // fuel supplied
    OFF    // fuel cut
}

/**
 * Tracker configuration
 */
data class TrackerConfig(
    val phoneNumber: String,
    val name: String = "",
    val vehiclePlate: String = ""
)