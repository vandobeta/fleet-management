package com.tracker.app.ui.main

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.tracker.app.R
import com.tracker.app.ui.commands.CommandsActivity
import com.tracker.app.ui.map.MapActivity
import com.tracker.app.ui.settings.SettingsActivity
import com.tracker.app.utils.SmsManager
import com.tracker.app.utils.SmsParser

class MainActivity : AppCompatActivity() {

    private lateinit var smsManager: SmsManager
    
    private lateinit var statusText: TextView
    private lateinit var locationText: TextView
    private lateinit var engineStatusText: TextView
    private lateinit var btnGetLocation: Button
    private lateinit var btnGetStatus: Button
    private lateinit var btnEngineOn: Button
    private lateinit var btnEngineOff: Button
    
    private var pendingCommand: PendingCommand? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        smsManager = SmsManager(this)
        
        initViews()
        checkPermissions()
        loadCurrentStatus()
    }

    private fun initViews() {
        statusText = findViewById(R.id.status_text)
        locationText = findViewById(R.id.location_text)
        engineStatusText = findViewById(R.id.engine_status_text)
        
        btnGetLocation = findViewById(R.id.btn_get_location)
        btnGetStatus = findViewById(R.id.btn_get_status)
        btnEngineOn = findViewById(R.id.btn_engine_on)
        btnEngineOff = findViewById(R.id.btn_engine_off)
        
        btnGetLocation.setOnClickListener { requestLocation() }
        btnGetStatus.setOnClickListener { requestStatus() }
        btnEngineOn.setOnClickListener { engineOn() }
        btnEngineOff.setOnClickListener { engineOff() }
        
        findViewById<Button>(R.id.btn_commands).setOnClickListener {
            startActivity(Intent(this, CommandsActivity::class.java))
        }
        
        findViewById<Button>(R.id.btn_map).setOnClickListener {
            startActivity(Intent(this, MapActivity::class.java))
        }
        
        findViewById<Button>(R.id.btn_settings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    private fun checkPermissions() {
        val permissions = arrayOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
        
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 100)
        }
    }

    private fun loadCurrentStatus() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            locationText.text = "Configure tracker number in Settings"
            statusText.text = "Status: Not configured"
        } else {
            locationText.text = "Tracker: ${smsManager.getTrackerNumber()}"
            statusText.text = "Status: Ready"
        }
    }

    private fun requestLocation() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        pendingCommand = PendingCommand.LOCATION
        btnGetLocation.isEnabled = false
        btnGetLocation.text = "Waiting..."
        
        smsManager.getLocation { success, message ->
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    private fun requestStatus() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        pendingCommand = PendingCommand.STATUS
        btnGetStatus.isEnabled = false
        btnGetStatus.text = "Waiting..."
        
        smsManager.getStatus { success, message ->
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    private fun engineOn() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        AlertDialog.Builder(this)
            .setTitle("Engine On")
            .setMessage("Are you sure you want to supply fuel (engine on)?")
            .setPositiveButton("Yes") { _, _ ->
                btnEngineOn.isEnabled = false
                smsManager.engineOn { success, message ->
                    runOnUiThread {
                        btnEngineOn.isEnabled = true
                        if (success) {
                            engineStatusText.text = "Engine: ON"
                            engineStatusText.setTextColor(
                                ContextCompat.getColor(this, R.color.green)
                            )
                        }
                        }
                    }
                }
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun engineOff() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        AlertDialog.Builder(this)
            .setTitle("Engine Off")
            .setMessage("Are you sure you want to cut fuel (engine off)?")
            .setPositiveButton("Yes") { _, _ ->
                btnEngineOff.isEnabled = false
                smsManager.engineOff { success, message ->
                    runOnUiThread {
                        btnEngineOff.isEnabled = true
                        if (success) {
                            engineStatusText.text = "Engine: OFF"
                            engineStatusText.setTextColor(
                                ContextCompat.getColor(this, R.color.red)
                            )
                        }
                    }
                }
            }
            .setNegativeButton("No", null)
            .show()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 100) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (!allGranted) {
                Toast.makeText(this, "Permissions required for SMS functionality", Toast.LENGTH_LONG).show()
            }
        }
    }

    enum class PendingCommand {
        LOCATION, STATUS, ENGINE_ON, ENGINE_OFF
    }
}