import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { vehiclesAPI, telemetryAPI, geofencesAPI, commandsAPI } from '../services/api';
import 'leaflet/dist/leaflet.css';

const VehicleDetail = () => {
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [location, setLocation] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commandLoading, setCommandLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadVehicle();
  }, [id]);

  const loadVehicle = async () => {
    try {
      const [vehicleRes, locationRes, geofencesRes] = await Promise.all([
        vehiclesAPI.getOne(id),
        telemetryAPI.getLocation(id).catch(() => ({ data: {} })),
        geofencesAPI.getAll({ vehicle_id: id }).catch(() => ({ data: {} })),
      ]);
      setVehicle(vehicleRes.data.vehicle);
      setLocation(locationRes.data.location);
      setGeofences(geofencesRes.data.geofences || []);
    } catch (err) {
      setError('Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = async (commandType) => {
    setCommandLoading(true);
    try {
      await commandsAPI.send({ vehicle_id: id, command_type: commandType });
      alert(`Command ${commandType} sent successfully`);
    } catch (err) {
      alert(err.response?.data?.error || 'Command failed');
    } finally {
      setCommandLoading(false);
    }
  };

  const handleLostMode = async (enable) => {
    try {
      if (enable) {
        await vehiclesAPI.activateLostMode(id);
      } else {
        await vehiclesAPI.deactivateLostMode(id);
      }
      loadVehicle();
    } catch (err) {
      setError(`Failed to ${enable ? 'activate' : 'deactivate'} lost mode`);
    }
  };

  if (loading) {
    return <div className="loading">Loading vehicle...</div>;
  }

  if (!vehicle) {
    return <div className="error-message">Vehicle not found</div>;
  }

  return (
    <div className="vehicle-detail">
      <div className="page-header">
        <div>
          <Link to="/vehicles" className="back-link">← Back to Vehicles</Link>
          <h1>{vehicle.plate_number}</h1>
        </div>
        <span className={`profile-badge profile-${vehicle.profile_type}`}>
          {vehicle.profile_type}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="detail-grid">
        <div className="detail-section">
          <h2>Vehicle Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>VIN</label>
              <span>{vehicle.VIN || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Tracker Phone</label>
              <span>{vehicle.tracker_phone_number || 'Not configured'}</span>
            </div>
            <div className="info-item">
              <label>Flespi Device ID</label>
              <span>{vehicle.flespi_device_id || 'Not configured'}</span>
            </div>
            <div className="info-item">
              <label>IMEI</label>
              <span>{vehicle.IMEI || 'N/A'}</span>
            </div>
            <div className="info-item">
              <label>Payment Status</label>
              <span className={`status-${vehicle.payment_status}`}>
                {vehicle.payment_status}
              </span>
            </div>
            <div className="info-item">
              <label>Lost Mode</label>
              <span>{vehicle.lost_mode ? 'Active ⚠️' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h2>Location</h2>
          {location ? (
            <div className="map-container">
              <MapContainer 
                center={[location.latitude, location.longitude]} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap'
                />
                <Marker position={[location.latitude, location.longitude]}>
                  <Popup>
                    <strong>{vehicle.plate_number}</strong>
                    <br />Speed: {location.speed || 0} km/h
                    <br />Heading: {location.heading || 0}°
                    <br />Ignition: {location.ignition ? 'On' : 'Off'}
                  </Popup>
                </Marker>
                {geofences.map(g => (
                  <Circle
                    key={g.id}
                    center={[g.center_point?.lat || 0, g.center_point?.lng || 0]}
                    radius={g.radius_meters || 500}
                    pathOptions={{ color: 'red', fillOpacity: 0.2 }}
                  />
                ))}
              </MapContainer>
            </div>
          ) : (
            <p>No location data available</p>
          )}
        </div>

        <div className="detail-section">
          <h2>Payment Information</h2>
          {vehicle.ps_status ? (
            <div className="info-grid">
              <div className="info-item">
                <label>Payment Type</label>
                <span>{vehicle.payment_type}</span>
              </div>
              <div className="info-item">
                <label>Amount</label>
                <span>${vehicle.amount}</span>
              </div>
              <div className="info-item">
                <label>Account Reference</label>
                <span>{vehicle.account_reference}</span>
              </div>
              <div className="info-item">
                <label>Next Payment Due</label>
                <span>{vehicle.next_payment_due}</span>
              </div>
            </div>
          ) : (
            <p>No payment schedule</p>
          )}
        </div>

        <div className="detail-section">
          <h2>Command Controls</h2>
          <div className="command-buttons">
            <button 
              onClick={() => handleCommand('RELAY,1')}
              disabled={commandLoading}
              className="btn-danger"
            >
              Cut Fuel (Engine Off)
            </button>
            <button 
              onClick={() => handleCommand('RELAY,0')}
              disabled={commandLoading}
              className="btn-success"
            >
              Restore Fuel (Engine On)
            </button>
            <button 
              onClick={() => handleCommand('WHERE')}
              disabled={commandLoading}
              className="btn-secondary"
            >
              Get Location
            </button>
            <button 
              onClick={() => handleCommand('PARAM')}
              disabled={commandLoading}
              className="btn-secondary"
            >
              Get Status
            </button>
          </div>
          <p className="command-info">
            Safety: Engine cutoff only allowed when speed &lt; 20 km/h
          </p>
        </div>

        <div className="detail-section">
          <h2>Lost Mode</h2>
          <div className="lost-mode-controls">
            {vehicle.lost_mode ? (
              <button 
                onClick={() => handleLostMode(false)}
                className="btn-warning"
              >
                Deactivate Lost Mode
              </button>
            ) : (
              <button 
                onClick={() => handleLostMode(true)}
                className="btn-danger"
              >
                Activate Lost Mode
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;