# Fleet Management Platform

A complete fleet management platform with backend, web frontend, and mobile app support.

## Project Structure

```
/workspace/project/
├── backend/               # Node.js Backend API
│   ├── migrations/        # Database migrations
│   ├── src/
│   │   ├── config/       # Database configuration
│   │   ├── controllers/  # Route controllers
│   │   ├── middleware/   # Auth middleware
│   │   ├── routes/      # API routes
│   │   └── services/    # MQTT, command queue, payment scheduler
│   └── package.json
│
├── frontend/             # React Web Dashboard
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/      # Page components
│   │   ├── services/   # API services
│   │   └── store/     # Auth context
│   └── package.json
│
└── mobile/              # React Native Mobile App
    └── (to be implemented with Expo)
```

## Features Implemented

### Backend (Node.js/Express)

1. **PostgreSQL Database** with PostGIS
   - Users, Vehicles, Geofences
   - Telemetry logs with geospatial data
   - Driver scores, brake pad wear
   - Command pipeline, anti-theft alerts
   - Payment schedules, subscriptions

2. **flespi API Integration**
   - MQTT client for real-time telemetry
   - Webhook endpoint for HTTP push
   - Device command via MQTT

3. **Profile-Specific Logic**
   - Leasing: Auto-disable on payment overdue
   - Renting: Geofence breach auto-shut engine
   - Normal: Lost mode for theft recovery
   - Recovery: Enhanced monitoring

4. **Analytics Engine**
   - Driver scoring algorithm
   - Predictive brake pad wear
   - Geofence breach detection

5. **Anti-Theft Detection**
   - Shock/impact alerts
   - Movement alerts (ignition OFF + movement)
   - SMS notification to emergency contacts
   - Push notification with DND override

6. **Offline/SMS Mode**
   - Direct SMS commands to tracker
   - WHERE#, PARAM#, RELAY commands
   - Google Maps link parsing
   - Automatic fallback when flespi offline

7. **Command Pipeline**
   - Queue with retry logic
   - Speed validation (< 20 km/h for safe cutoff)
   - Status tracking (queued → sent → executed → failed)

### Frontend (React)

1. **Authentication**
   - Registration with emergency contacts
   - Login with phone/email

2. **Dashboard**
   - Fleet overview
   - Vehicle map with real-time positions
   - Quick actions

3. **Vehicle Management**
   - Register by profile type
   - View/edit vehicles
   - Lost mode activation

4. **Geofence Management**
   - Draw geofences on map
   - Auto-cut engine setting
   - Breach alerts

5. **Command Controls**
   - Fuel pump on/off
   - Location request
   - Command history

6. **Analytics**
   - Driver scores
   - Brake pad wear predictions

7. **Anti-Theft Alerts**
   - Alert history
   - Test alert system

## To Run

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run migrate  # Run database migrations
npm start        # Start server on port 3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # Start on port 5173
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get profile

### Vehicles
- `POST /api/vehicles/register` - Register vehicle
- `GET /api/vehicles` - List vehicles
- `GET /api/vehicles/:id` - Get vehicle
- `POST /api/vehicles/:id/lost-mode` - Activate lost mode

### Geofences
- `POST /api/geofences` - Create geofence
- `GET /api/geofences` - List geofences
- `DELETE /api/geofences/:id` - Delete geofence

### Telemetry
- `GET /api/telemetry/latest` - Latest positions
- `GET /api/telemetry/history/:vehicleId` - History

### Commands
- `POST /api/commands/send` - Send command
- `GET /api/commands/history` - Command history

### Analytics
- `GET /api/analytics/driver-scores` - Driver scores
- `GET /api/analytics/brake-wear` - Brake wear

### Alerts
- `GET /api/alerts` - Alert history
- `POST /api/alerts/test` - Test alert

### Devices (SMS Mode)
- `GET /api/devices/:id/config` - Get tracker config
- `POST /api/devices/:id/sms-command` - Send SMS command
- `POST /api/devices/:id/sms-location` - Request location

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments/pay` - Make payment

### Subscriptions
- `GET /api/subscriptions` - List subscriptions
- `POST /api/subscriptions/renew` - Renew subscription

## Vehicle Profiles

1. **Leasing** - Auto-disable engine if payments not met
2. **Renting** - Geofence auto-shuts engine on breach
3. **Normal** - Basic tracking + lost mode for theft recovery
4. **Recovery** - Enhanced monitoring

## SMS Commands (Lynkworld LW2G-4C)

- `WHERE#` → Returns Google Maps link
- `PARAM#` → Returns status (battery, speed, ignition)
- `RELAY,1#` → Cut fuel (engine off)
- `RELAY,0#` → Restore fuel (engine on)
- `APN,internet#` → Set APN

## Hardware

- Lynkworld LW2G-4C GPS tracker
- 5-pin automotive relay for fuel pump control
- flespi platform for telemetry

## Mobile App

To be implemented with Expo - see mobile directory for structure.