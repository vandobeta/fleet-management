package com.tracker.app.ui.setup

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.tracker.app.R
import com.tracker.app.ui.main.MainActivity
import com.tracker.app.utils.SmsManager

class SetupActivity : AppCompatActivity() {

    private lateinit var phoneInput: EditText
    private lateinit var continueBtn: Button
    private lateinit var statusText: TextView
    
    private val REQUIRED_PERMISSIONS = arrayOf(
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_SMS,
        Manifest.permission.RECEIVE_SMS
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        
        initViews()
        checkPermissions()
    }

    private fun initViews() {
        phoneInput = findViewById(R.id.phone_input)
        continueBtn = findViewById(R.id.btn_continue)
        statusText = findViewById(R.id.status_text)
        
        continueBtn.setOnClickListener {
            saveAndContinue()
        }
    }

    private fun checkPermissions() {
        val missing = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missing.isNotEmpty()) {
            statusText.text = "Permissions required"
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), 100)
        } else {
            statusText.text = "✓ Permissions granted"
            statusText.setTextColor(ContextCompat.getColor(this, R.color.green))
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
            if (allGranted) {
                statusText.text = "✓ Permissions granted"
                statusText.setTextColor(ContextCompat.getColor(this, R.color.green))
            } else {
                statusText.text = "Permissions required - please grant"
                statusText.setTextColor(ContextCompat.getColor(this, R.color.red))
                Toast.makeText(this, "Permissions required for SMS", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun saveAndContinue() {
        val phone = phoneInput.text.toString().trim()
        
        if (phone.isEmpty()) {
            Toast.makeText(this, "Enter tracker phone number", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Save tracker number
        val smsManager = SmsManager(this)
        smsManager.saveTrackerNumber(phone)
        
        // Save default location (Kampala)
        val prefs = getSharedPreferences("tracker_prefs", MODE_PRIVATE)
        prefs.edit()
            .putString("default_lat", "0.3476")
            .putString("default_lng", "32.5825")
            .putBoolean("setup_complete", true)
            .apply()
        
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
