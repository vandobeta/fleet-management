package com.tracker.app.ui.settings

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.tracker.app.R
import com.tracker.app.utils.SmsManager

/**
 * Settings Activity - Configure tracker phone number
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var smsManager: SmsManager
    private lateinit var phoneInput: EditText
    private lateinit var savedNumberText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        
        smsManager = SmsManager(this)
        
        initViews()
    }

    private fun initViews() {
        phoneInput = findViewById(R.id.phone_input)
        savedNumberText = findViewById(R.id.saved_number_text)
        
        // Load saved number
        val savedNumber = smsManager.getTrackerNumber()
        if (savedNumber.isNotEmpty()) {
            phoneInput.setText(savedNumber)
            savedNumberText.text = "Saved: $savedNumber"
        } else {
            savedNumberText.text = "No tracker configured"
        }
        
        findViewById<Button>(R.id.btn_save).setOnClickListener {
            saveNumber()
        }
        
        findViewById<Button>(R.id.btn_clear).setOnClickListener {
            clearNumber()
        }
    }

    private fun saveNumber() {
        val phone = phoneInput.text.toString().trim()
        
        if (phone.isEmpty()) {
            Toast.makeText(this, "Enter phone number", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Basic validation
        val cleanPhone = phone.replace("[^\\d+]".toRegex(), "")
        if (cleanPhone.length < 8) {
            Toast.makeText(this, "Invalid phone number", Toast.LENGTH_SHORT).show()
            return
        }
        
        smsManager.saveTrackerNumber(phone)
        savedNumberText.text = "Saved: $phone"
        Toast.makeText(this, "Tracker number saved", Toast.LENGTH_SHORT).show()
    }

    private fun clearNumber() {
        smsManager.clearTrackerNumber()
        phoneInput.setText("")
        savedNumberText.text = "No tracker configured"
        Toast.makeText(this, "Tracker number cleared", Toast.LENGTH_SHORT).show()
    }
}