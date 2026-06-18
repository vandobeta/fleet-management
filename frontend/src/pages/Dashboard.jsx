import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { analyticsAPI, telemetryAPI } from '../services/api';
import { useAuth } from '../store/authContext';
import 'leaflet/dist/leaflet.css';

const Dashboard = () => {
  const [overview, setOverview] = useState(null);
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [overviewRes, telemetryRes] = await Promise.all([
        analyticsAPI.getFleetOverview(),
        telemetryAPI.getLatest(),
      ]);
      setOverview(overviewRes.data.overview);
      setTelemetry(telemetryRes.data.telemetry || []);
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const activeVehicles = telemetry.filter(t => t.latitude && t.longitude);

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.name}</h1>
      
      <div className="overview-cards">
        <div className="overview-card">
          <h3>Total Vehicles</h3>
          <p className="overview-value">{overview?.total_vehicles || 0}</p>
        </div>
        <div className="overview-card">
          <h3>Active</h3>
          <p className="overview-value">{overview?.active_vehicles || 0}</p>
        </div>
        <div className="overview-card">
          <h3>Overdue Payments</h3>
          <p className="overview-value">{overview?.overdue_payments || 0}</p>
        </div>
        <div className="overview-card">
          <h3>Geofence Breaches Today</h3>
          <p className="overview-value">{overview?.today_breaches || 0}</p>
        </div>
        <div className="overview-card">
          <h3>Avg Driver Score</h3>
          <p className="overview-value">{overview?.average_driver_score || 0}</p>
        </div>
      </div>

      <div className="vehicles-by-profile">
        <h2>Vehicles by Profile</h2>
        <div className="profile-stats">
          {overview?.by_profile && Object.entries(overview.by_profile).map(([type, count]) => (
            <div key={type} className={`profile-badge profile-${type}`}>
              {type}: {count}
            </div>
          ))}
        </div>
      </div>

      <div className="map-section">
        <h2>Vehicle Locations</h2>
        <div className="map-container">
          <MapContainer 
            center={[0, 0]} 
            zoom={2} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            {activeVehicles.map(vehicle => (
              <Marker 
                key={vehicle.vehicle_id} 
                position={[vehicle.latitude, vehicle.longitude]}
              >
                <Popup>
                  <strong>{vehicle.plate_number}</strong>
                  <br />Speed: {vehicle.speed || 0} km/h
                  <br />Ignition: {vehicle.ignition ? 'On' : 'Off'}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <Link to="/vehicles/new" className="btn-primary">Add Vehicle</Link>
          <Link to="/geofences" className="btn-secondary">Manage Geofences</Link>
          <Link to="/commands" className="btn-secondary">Send Commands</Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;