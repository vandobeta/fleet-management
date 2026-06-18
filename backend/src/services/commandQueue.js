const db = require('../config/database');
const mqtt = require('../services/mqtt');

let processorInterval = null;

const startProcessor = () => {
  console.log('Starting command queue processor...');
  
  // Process queue every 30 seconds
  processorInterval = setInterval(async () => {
    await processQueue();
  }, 30000);

  // Initial processing
  processQueue();
};

const stopProcessor = () => {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }
};

const processQueue = async () => {
  try {
    // Get pending commands
    const commands = await db.query(
      `SELECT cp.*, v.flespi_device_id, v.tracker_phone_number, v.plate_number
      FROM command_pipeline cp
      JOIN vehicles v ON cp.vehicle_id = v.id
      WHERE cp.status IN ('queued', 'pending')
      AND (cp.created_at > NOW() - INTERVAL '1 hour')
      ORDER BY cp.priority DESC, cp.created_at ASC
      LIMIT 10`
    );

    for (const cmd of commands.rows) {
      try {
        await processCommand(cmd);
      } catch (error) {
        console.error(`Command ${cmd.id} error:`, error);
        
        // Increment retry count
        await db.query(
          `UPDATE command_pipeline SET
            retry_count = retry_count + 1,
            failure_reason = $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
          [error.message, cmd.id]
        );

        // Check if max retries reached
        if (cmd.retry_count + 1 >= cmd.max_retries) {
          await db.query(
            `UPDATE command_pipeline SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [cmd.id]
          );
        }
      }
    }
  } catch (error) {
    console.error('Process queue error:', error);
  }
};

const processCommand = async (cmd) => {
  const { id, command_type, flespi_device_id, tracker_phone_number, vehicle_id } = cmd;

  // Update status to pending
  await db.query(
    `UPDATE command_pipeline SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );

  // Try flespi first if device is configured
  if (flespi_device_id) {
    try {
      // Send via MQTT to flespi
      const topic = `flespi/${flespi_device_id}/commands`;
      const payload = JSON.stringify({
        command: command_type,
        timestamp: Date.now(),
      });

      mqtt.publish(topic, payload);

      // Mark as sent
      await db.query(
        `UPDATE command_pipeline SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      console.log(`Command ${command_type} sent to flespi device ${flespi_device_id}`);
      return;
    } catch (error) {
      console.error('Flespi command error:', error);
    }
  }

  // Fallback to SMS if no flespi device
  if (tracker_phone_number) {
    // In production, would send SMS via Twilio
    console.log(`SMS Command to ${tracker_phone_number}: ${command_type}#`);

    // Mark as sent
    await db.query(
      `UPDATE command_pipeline SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    return;
  }

  // No method available
  throw new Error('No command method available (no flespi device or tracker phone)');
};

// Manual command execution (for receiving ACK from device)
const markExecuted = async (commandId) => {
  await db.query(
    `UPDATE command_pipeline SET
      status = 'executed',
      executed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`,
    [commandId]
  );
};

const markFailed = async (commandId, reason) => {
  await db.query(
    `UPDATE command_pipeline SET
      status = 'failed',
      failure_reason = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`,
    [reason, commandId]
  );
};

module.exports = {
  startProcessor,
  stopProcessor,
  processQueue,
  markExecuted,
  markFailed,
};