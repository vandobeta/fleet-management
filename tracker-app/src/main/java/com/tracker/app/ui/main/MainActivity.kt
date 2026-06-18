package com.tracker.app.ui.main

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
import com.tracker.app.ui.setup.SetupActivity
import com.tracker.app.utils.SmsManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var smsManager: SmsManager
    private lateinit var statusText: TextView
    private lateinit var trackerNumberText: TextView
    private lateinit var lastUpdateText: TextView
    private lateinit var statusDot: View
    private lateinit var btnGetLocation: Button
    private lateinit var btnGetStatus: Button
    private lateinit var btnEngineOn: Button
    private lateinit var btnEngineOff: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check if setup is complete
        val prefs = getSharedPreferences("tracker_prefs", MODE_PRIVATE)
        if (!prefs.getBoolean("setup_complete", false)) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        
        setContentView(R.layout.activity_main)
        
        smsManager = SmsManager(this)
        
        initViews()
        checkPermissions()
        loadCurrentStatus()
    }

    private fun initViews() {
        statusText = findViewById(R.id.status_text)
        trackerNumberText = findViewById(R.id.tracker_number_text)
        lastUpdateText = findViewById(R.id.last_update_text)
        statusDot = findViewById(R.id.status_dot)
        
        btnGetLocation = findViewById(R.id.btn_get_location)
        btnGetStatus = findViewById(R.id.btn_get_status)
        btnEngineOn = findViewById(R.id.btn_engine_on)
        btnEngineOff = findViewById(R.id.btn_engine_off)
        
        btnGetLocation.setOnClickListener { requestLocation() }
        btnGetStatus.setOnClickListener { requestStatus() }
        btnEngineOn.setOnClickListener { engineOn() }
        btnEngineOff.setOnClickListener { engineOff() }
        
        findViewById<Button>(R.id.btn_navigate).setOnClickListener { navigateToCar() }
        
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
        val phone = smsManager.getTrackerNumber()
        trackerNumberText.text = phone
        
        if (phone.isEmpty()) {
            statusText.text = "● Not Connected"
            statusDot.setBackgroundColor(ContextCompat.getColor(this, R.color.red))
        } else {
            statusText.text = "● Connected"
            statusDot.setBackgroundColor(ContextCompat.getColor(this, R.color.green))
        }
        
        // Load last update time
        val prefs = getSharedPreferences("tracker_prefs", MODE_PRIVATE)
        val lastTime = prefs.getLong("last_location_time", 0)
        if (lastTime > 0) {
            val sdf = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
            lastUpdateText.text = "Last update: ${sdf.format(Date(lastTime))}"
        }
    }

    private fun requestLocation() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        btnGetLocation.isEnabled = false
        btnGetLocation.text = "Sending..."
        
        smsManager.getLocation { success, message, _ ->
            runOnUiThread {
                btnGetLocation.isEnabled = true
                btnGetLocation.text = "GET LOCATION"
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
                if (success) {
                    lastUpdateText.text = "Last update: Just now"
                }
            }
        }
    }

    private fun requestStatus() {
        if (smsManager.getTrackerNumber().isEmpty()) {
            Toast.makeText(this, "Configure tracker number first", Toast.LENGTH_SHORT).show()
            return
        }
        
        btnGetStatus.isEnabled = false
        btnGetStatus.text = "Sending..."
        
        smsManager.getStatus { success, message, _ ->
            runOnUiThread {
                btnGetStatus.isEnabled = true
                btnGetStatus.text = "GET STATUS"
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
            }
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
                        Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
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
                        Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun navigateToCar() {
        val prefs = getSharedPreferences("tracker_prefs", MODE_PRIVATE)
        
        // Try to get last known location
        var lat = prefs.getString("last_latitude", "") ?: ""
        var lng = prefs.getString("last_longitude", "") ?: ""
        
        // If no location, use default (Kampala)
        if (lat.isEmpty() || lng.isEmpty()) {
            lat = prefs.getString("default_lat", "0.3476") ?: "0.3476"
            lng = prefs.getString("default_lng", "32.5825") ?: "32.5825"
        }
        
        // Open Google Maps for navigation
        val gmmIntentUri = Uri.parse("google.navigation:q=$lat,$lng")
        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
        mapIntent.setPackage("com.google.android.apps.maps")
        
        if (mapIntent.resolveActivity(packageManager) != null) {
            startActivity(mapIntent)
        } else {
            // Open in browser
            val browserUri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")
            val browserIntent = Intent(Intent.ACTION_VIEW, browserUri)
            startActivity(browserIntent)
        }
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
}
