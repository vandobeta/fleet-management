import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet';
import { geofencesAPI, vehiclesAPI } from '../services/api';
import 'leaflet/dist/leaflet.css';

const Geofences = () => {
  const [geofences, setGeofences] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    vehicle_id: '',
    coordinates: [],
    alert_on_breach: true,
    auto_cut_engine: false,
  });
  const [drawing, setDrawing] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [geofencesRes, vehiclesRes] = await Promise.all([
        geofencesAPI.getAll(),
        vehiclesAPI.getAll(),
      ]);
      setGeofences(geofencesRes.data.geofences || []);
      setVehicles(vehiclesRes.data.vehicles || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (drawing.length < 3) {
      setError('Draw at least 3 points for the geofence');
      return;
    }

    try {
      await geofencesAPI.create({
        ...formData,
        coordinates: drawing,
      });
      setShowForm(false);
      setDrawing([]);
      setFormData({
        name: '',
        vehicle_id: '',
        coordinates: [],
        alert_on_breach: true,
        auto_cut_engine: false,
      });
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create geofence');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this geofence?')) return;
    try {
      await geofencesAPI.delete(id);
      setGeofences(geofences.filter(g => g.id !== id));
    } catch (err) {
      setError('Failed to delete geofence');
    }
  };

  const handleMapClick = (e) => {
    if (showForm) {
      setDrawing([...drawing, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="geofences-page">
      <div className="page-header">
        <h1>Geofences</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : 'Draw Geofence'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <div className="geofence-form">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Geofence Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Enter name"
                required
              />
            </div>
            <div className="form-group">
              <label>Vehicle *</label>
              <select
                value={formData.vehicle_id}
                onChange={(e) => setFormData({...formData, vehicle_id: e.target.value})}
                required
              >
                <option value="">Select vehicle</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.plate_number}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.alert_on_breach}
                  onChange={(e) => setFormData({...formData, alert_on_breach: e.target.checked})}
                />
                Alert on Breach
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.auto_cut_engine}
                  onChange={(e) => setFormData({...formData, auto_cut_engine: e.target.checked})}
                />
                Auto Cut Engine on Breach
              </label>
            </div>
            <p>Click on the map to draw points ({drawing.length} points)</p>
            <button type="submit" disabled={drawing.length < 3} className="btn-primary">
              Create Geofence
            </button>
          </form>
        </div>
      )}

      <div className="map-container" style={{ height: '500px' }}>
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          onClick={handleMapClick}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          {geofences.map(g => (
            <Polygon
              key={g.id}
              positions={g.boundary?.coordinates?.map(c => [c.lat, c.lng]) || []}
              pathOptions={{ color: g.auto_cut_engine ? 'red' : 'blue', fillOpacity: 0.2 }}
            >
              <Popup>
                <strong>{g.name}</strong>
                <br />Vehicle: {g.plate_number}
                <br />Auto-cut: {g.auto_cut_engine ? 'Yes' : 'No'}
              </Popup>
            </Polygon>
          ))}
          {drawing.length >= 3 && (
            <Polygon
              positions={drawing.map(c => [c.lat, c.lng])}
              pathOptions={{ color: 'green', fillOpacity: 0.3 }}
            />
          )}
        </MapContainer>
      </div>

      <div className="geofences-list">
        <h2>Existing Geofences</h2>
        {geofences.length === 0 ? (
          <p>No geofences created</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Vehicle</th>
                <th>Alert on Breach</th>
                <th>Auto Cut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {geofences.map(g => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{g.plate_number}</td>
                  <td>{g.alert_on_breach ? 'Yes' : 'No'}</td>
                  <td>{g.auto_cut_engine ? 'Yes' : 'No'}</td>
                  <td>
                    <button onClick={() => handleDelete(g.id)} className="btn-danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Geofences;