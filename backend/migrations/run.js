require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fleet_management',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const runMigrations = async () => {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migrations...');
    
    // Enable PostGIS extension
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;
    `);
    console.log('✓ PostGIS extension enabled');

    // Create vehicle_profiles enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE vehicle_profiles AS ENUM ('leasing', 'renting', 'normal', 'recovery');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ vehicle_profiles enum created');

    // Create payment_status enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_status AS ENUM ('active', 'overdue', 'disabled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ payment_status enum created');

    // Create payment_type enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_type AS ENUM ('daily', 'weekly', 'monthly');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ payment_type enum created');

    // Create subscription_plan_type enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE subscription_plan_type AS ENUM ('monthly', 'yearly');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ subscription_plan_type enum created');

    // Create command_status enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE command_status AS ENUM ('queued', 'pending', 'sent', 'executed', 'failed', 'expired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ command_status enum created');

    // Create alert_type enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE alert_type AS ENUM ('shock', 'movement', 'ignition_unauthorized', 'tampering', 'geofence_breach', 'speed_limit', 'battery_low');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ alert_type enum created');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        place_of_residence TEXT,
        emergency_contact_1_name VARCHAR(255),
        emergency_contact_1_phone VARCHAR(50),
        emergency_contact_2_name VARCHAR(255),
        emergency_contact_2_phone VARCHAR(50),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ users table created');

    // Create vehicles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plate_number VARCHAR(50) UNIQUE NOT NULL,
        VIN VARCHAR(50),
        profile_type vehicle_profiles NOT NULL,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        flespi_device_id VARCHAR(100),
        IMEI VARCHAR(100),
        tracker_phone_number VARCHAR(50),
        device_status VARCHAR(50) DEFAULT 'active',
        payment_status payment_status DEFAULT 'active',
        lost_mode BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ vehicles table created');

    // Create geofences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS geofences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        boundary GEOMETRY(POLYGON, 4326) NOT NULL,
        center_point GEOMETRY(POINT, 4326),
        radius_meters INTEGER,
        alert_on_breach BOOLEAN DEFAULT TRUE,
        auto_cut_engine BOOLEAN DEFAULT FALSE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ geofences table created');

    // Create geofence_alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS geofence_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        geofence_id UUID REFERENCES geofences(id) ON DELETE SET NULL,
        alert_type VARCHAR(50) NOT NULL,
        entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        exited_at TIMESTAMP,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ geofence_alerts table created');

    // Create payment_schedules table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE UNIQUE,
        payment_type payment_type NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        account_reference VARCHAR(100) UNIQUE NOT NULL,
        next_payment_due DATE NOT NULL,
        payment_status payment_status DEFAULT 'active',
        last_payment_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ payment_schedules table created');

    // Create subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE UNIQUE,
        plan_type subscription_plan_type NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        starts_at DATE NOT NULL,
        expires_at DATE NOT NULL,
        auto_renew BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ subscriptions table created');

    // Create telemetry_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        flespi_device_id VARCHAR(100),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location GEOMETRY(POINT, 4326),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        altitude DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        heading DOUBLE PRECISION,
        ignition BOOLEAN,
        external_voltage DOUBLE PRECISION,
        backup_battery_voltage DOUBLE PRECISION,
        gsm_signal INTEGER,
        gps_signal BOOLEAN,
        heading_quality VARCHAR(20),
        hdop DOUBLE PRECISION,
        satellites INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ telemetry_logs table created');

    // Create driver_scores table
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        score INTEGER DEFAULT 100,
        harsh_acceleration_count INTEGER DEFAULT 0,
        harsh_braking_count INTEGER DEFAULT 0,
        harsh_turning_count INTEGER DEFAULT 0,
        overspeeding_count INTEGER DEFAULT 0,
        total_trips INTEGER DEFAULT 0,
        last_trip_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ driver_scores table created');

    // Create acceleration_events table (for driver scoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS acceleration_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        g_force DOUBLE PRECISION,
        speed_at_event DOUBLE PRECISION,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ acceleration_events table created');

    // Create brake_pad_wear table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brake_pad_wear (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE UNIQUE,
        estimated_remaining_percentage INTEGER DEFAULT 100,
        last_replacement_date DATE,
        next_replacement_estimate DATE,
        wear_rate DOUBLE PRECISION DEFAULT 0,
        deceleration_events_count INTEGER DEFAULT 0,
        total_deceleration_force DOUBLE PRECISION DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ brake_pad_wear table created');

    // Create command_pipeline table
    await client.query(`
      CREATE TABLE IF NOT EXISTS command_pipeline (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        command_type VARCHAR(50) NOT NULL,
        command_payload JSONB,
        status command_status DEFAULT 'queued',
        priority INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 5,
        sent_at TIMESTAMP,
        executed_at TIMESTAMP,
        failure_reason TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ command_pipeline table created');

    // Create anti_theft_alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS anti_theft_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
        alert_type alert_type NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium',
        description TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        ignition_status BOOLEAN,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by UUID REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ anti_theft_alerts table created');

    // Create notification_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        message TEXT,
        sent_via VARCHAR(50),
        delivered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ notification_logs table created');

    // Create notification_preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        servicing_due_alerts BOOLEAN DEFAULT TRUE,
        servicing_threshold INTEGER DEFAULT 1000,
        brake_wear_alerts BOOLEAN DEFAULT TRUE,
        brake_wear_threshold INTEGER DEFAULT 20,
        battery_low_alerts BOOLEAN DEFAULT TRUE,
        geofence_breach_alerts BOOLEAN DEFAULT TRUE,
        payment_due_alerts BOOLEAN DEFAULT TRUE,
        payment_overdue_alerts BOOLEAN DEFAULT TRUE,
        device_offline_alerts BOOLEAN DEFAULT TRUE,
        speed_limit_alerts BOOLEAN DEFAULT TRUE,
        anti_theft_alerts BOOLEAN DEFAULT TRUE,
        dnd_override_alerts VARCHAR(255) DEFAULT 'anti_theft,payment_overdue',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ notification_preferences table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_time ON telemetry_logs(vehicle_id, timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_location ON telemetry_logs USING GIST(location);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_geofences_vehicle ON geofences(vehicle_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_geofence_alerts_vehicle ON geofence_alerts(vehicle_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_anti_theft_alerts_vehicle ON anti_theft_alerts(vehicle_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_command_pipeline_status ON command_pipeline(status);
    `);
    console.log('✓ Indexes created');

    console.log('\nDatabase migrations completed successfully!');
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations().catch(console.error);