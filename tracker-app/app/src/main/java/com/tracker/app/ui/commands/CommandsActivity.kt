package com.tracker.app.ui.commands

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.tracker.app.R
import com.tracker.app.utils.SmsCommands
import com.tracker.app.utils.SmsManager

/**
 * Developer Commands Activity - For testing custom SMS commands
 */
class CommandsActivity : AppCompatActivity() {

    private lateinit var smsManager: SmsManager
    private lateinit var commandSpinner: Spinner
    private lateinit var customCommandInput: EditText
    private lateinit var responseText: TextView
    
    private val presetCommands = arrayOf(
        SmsCommands.WHERE,
        SmsCommands.PARAM,
        SmsCommands.RELAY_ON,
        SmsCommands.RELAY_OFF,
        SmsCommands.SET_APN,
        "CUSTOM"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_commands)
        
        smsManager = SmsManager(this)
        
        initViews()
    }

    private fun initViews() {
        commandSpinner = findViewById(R.id.command_spinner)
        customCommandInput = findViewById(R.id.custom_command_input)
        responseText = findViewById(R.id.response_text)
        
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, presetCommands)
        commandSpinner.adapter = adapter
        
        findViewById<Button>(R.id.btn_send).setOnClickListener {
            sendCommand()
        }
        
        findViewById<Button>(R.id.btn_clear).setOnClickListener {
            responseText.text = ""
        }
    }

    private fun sendCommand() {
        val selectedCommand = commandSpinner.selectedItem as String
        val command: String
        
        if (selectedCommand == "CUSTOM") {
            command = customCommandInput.text.toString().trim()
            if (command.isEmpty()) {
                Toast.makeText(this, "Enter custom command", Toast.LENGTH_SHORT).show()
                return
            }
        } else {
            command = selectedCommand
        }
        
        // Add # if not present
        val finalCommand = if (!command.endsWith("#")) "$command#" else command
        
        responseText.text = "Sending: $finalCommand\n"
        
        smsManager.sendCommand(finalCommand) { success, message ->
            runOnUiThread {
                responseText.append("$message\n")
                if (success) {
                    responseText.append("Waiting for response...\n")
                }
            }
        }
    }
}