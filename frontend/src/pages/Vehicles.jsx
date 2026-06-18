import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { vehiclesAPI } from '../services/api';

const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const response = await vehiclesAPI.getAll();
      setVehicles(response.data.vehicles || []);
    } catch (err) {
      setError('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;
    
    try {
      await vehiclesAPI.delete(id);
      setVehicles(vehicles.filter(v => v.id !== id));
    } catch (err) {
      setError('Failed to delete vehicle');
    }
  };

  const handleLostMode = async (id, enable) => {
    try {
      if (enable) {
        await vehiclesAPI.activateLostMode(id);
      } else {
        await vehiclesAPI.deactivateLostMode(id);
      }
      loadVehicles();
    } catch (err) {
      setError(`Failed to ${enable ? 'activate' : 'deactivate'} lost mode`);
    }
  };

  if (loading) {
    return <div className="loading">Loading vehicles...</div>;
  }

  return (
    <div className="vehicles-page">
      <div className="page-header">
        <h1>My Vehicles</h1>
        <Link to="/vehicles/new" className="btn-primary">Add Vehicle</Link>
      </div>

      {error && <div className="error-message">{error}</div>}

      {vehicles.length === 0 ? (
        <div className="empty-state">
          <p>No vehicles found. Add your first vehicle to get started.</p>
          <Link to="/vehicles/new" className="btn-primary">Add Vehicle</Link>
        </div>
      ) : (
        <div className="vehicles-grid">
          {vehicles.map(vehicle => (
            <div key={vehicle.id} className="vehicle-card">
              <div className="vehicle-header">
                <h3>{vehicle.plate_number}</h3>
                <span className={`profile-badge profile-${vehicle.profile_type}`}>
                  {vehicle.profile_type}
                </span>
              </div>
              
              <div className="vehicle-details">
                <p><strong>VIN:</strong> {vehicle.VIN || 'N/A'}</p>
                <p><strong>Tracker:</strong> {vehicle.tracker_phone_number || 'Not configured'}</p>
                <p><strong>Flespi Device:</strong> {vehicle.flespi_device_id || 'Not configured'}</p>
                <p><strong>Payment Status:</strong> 
                  <span className={`status-${vehicle.payment_status}`}>
                    {vehicle.payment_status}
                  </span>
                </p>
                {vehicle.lost_mode && (
                  <p className="lost-mode-alert">⚠️ LOST MODE ACTIVE</p>
                )}
              </div>

              <div className="vehicle-actions">
                <Link to={`/vehicles/${vehicle.id}`} className="btn-link">View Details</Link>
                <button 
                  onClick={() => handleLostMode(vehicle.id, !vehicle.lost_mode)}
                  className={`btn-link ${vehicle.lost_mode ? 'btn-warning' : ''}`}
                >
                  {vehicle.lost_mode ? 'Deactivate Lost Mode' : 'Activate Lost Mode'}
                </button>
                <button 
                  onClick={() => handleDelete(vehicle.id)}
                  className="btn-link btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Vehicles;