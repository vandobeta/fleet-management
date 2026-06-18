const db = require('../config/database');

let schedulerInterval = null;

const startScheduler = () => {
  console.log('Starting payment scheduler...');
  
  // Check payments every hour
  schedulerInterval = setInterval(async () => {
    await checkPayments();
  }, 3600000);

  // Initial check
  checkPayments();
};

const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

const checkPayments = async () => {
  try {
    // Check for overdue payments
    const overduePayments = await db.query(
      `SELECT ps.*, v.id as vehicle_id, v.plate_number, v.owner_id, u.emergency_contact_1_phone, u.emergency_contact_2_phone
      FROM payment_schedules ps
      JOIN vehicles v ON ps.vehicle_id = v.id
      JOIN users u ON v.owner_id = u.id
      WHERE ps.payment_status = 'active'
      AND ps.next_payment_due < CURRENT_DATE`
    );

    for (const payment of overduePayments.rows) {
      try {
        // Mark as overdue
        await db.query(
          `UPDATE payment_schedules SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [payment.id]
        );

        await db.query(
          `UPDATE vehicles SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [payment.vehicle_id]
        );

        // Log notification
        await db.query(
          `INSERT INTO notification_logs (user_id, vehicle_id, notification_type, title, message, sent_via)
          VALUES ($1, $2, 'payment', 'Payment Overdue', 'Your vehicle payment is overdue. The vehicle may be disabled.', 'in_app')`,
          [payment.owner_id, payment.vehicle_id]
        );

        console.log(`Payment overdue for vehicle ${payment.plate_number}`);

      } catch (error) {
        console.error(`Payment check error for ${payment.plate_number}:`, error);
      }
    }

    // Check for expired subscriptions
    const expiredSubscriptions = await db.query(
      `SELECT s.*, v.id as vehicle_id, v.plate_number, v.owner_id
      FROM subscriptions s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.expires_at < CURRENT_DATE
      AND v.payment_status != 'disabled'`
    );

    for (const sub of expiredSubscriptions.rows) {
      try {
        // Disable vehicle
        await db.query(
          `UPDATE vehicles SET payment_status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sub.vehicle_id]
        );

        // Log notification
        await db.query(
          `INSERT INTO notification_logs (user_id, vehicle_id, notification_type, title, message, sent_via)
          VALUES ($1, $2, 'payment', 'Subscription Expired', 'Your tracking subscription has expired.', 'in_app')`,
          [sub.owner_id, sub.vehicle_id]
        );

        console.log(`Subscription expired for vehicle ${sub.plate_number}`);

      } catch (error) {
        console.error(`Subscription check error for ${sub.plate_number}:`, error);
      }
    }

    console.log('Payment check completed');

  } catch (error) {
    console.error('Payment scheduler error:', error);
  }
};

const checkPaymentForVehicle = async (vehicleId) => {
  const payment = await db.query(
    'SELECT * FROM payment_schedules WHERE vehicle_id = $1',
    [vehicleId]
  );

  if (payment.rows.length === 0) return null;

  return payment.rows[0];
};

const renewPayment = async (vehicleId) => {
  const payment = await db.query(
    'SELECT * FROM payment_schedules WHERE vehicle_id = $1',
    [vehicleId]
  );

  if (payment.rows.length === 0) return null;

  const ps = payment.rows[0];
  let next_payment_due = new Date();

  if (ps.payment_type === 'daily') {
    next_payment_due.setDate(next_payment_due.getDate() + 1);
  } else if (ps.payment_type === 'weekly') {
    next_payment_due.setDate(next_payment_due.getDate() + 7);
  } else {
    next_payment_due.setMonth(next_payment_due.getMonth() + 1);
  }

  await db.query(
    `UPDATE payment_schedules SET
      payment_status = 'active',
      last_payment_date = CURRENT_DATE,
      next_payment_due = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE vehicle_id = $2`,
    [next_payment_due, vehicleId]
  );

  await db.query(
    `UPDATE vehicles SET payment_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [vehicleId]
  );

  return { next_payment_due };
};

module.exports = {
  startScheduler,
  stopScheduler,
  checkPayments,
  checkPaymentForVehicle,
  renewPayment,
};