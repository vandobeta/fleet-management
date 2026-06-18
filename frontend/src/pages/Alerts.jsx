import { useState, useEffect } from 'react';
import { alertsAPI, vehiclesAPI } from '../services/api';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [alertsRes, vehiclesRes] = await Promise.all([
        alertsAPI.getAll({}),
        vehiclesAPI.getAll(),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setVehicles(vehiclesRes.data.vehicles || []);
    } catch (err) {
      setError('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (id) => {
    try {
      await alertsAPI.acknowledge(id);
      loadData();
    } catch (err) {
      setError('Failed to acknowledge alert');
    }
  };

  const handleTest = async (vehicleId) => {
    setTesting(true);
    try {
      await alertsAPI.test({ vehicle_id: vehicleId });
      alert('Test alert sent successfully');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send test alert');
    } finally {
      setTesting(false);
    }
  };

  const getAlertTypeColor = (type) => {
    switch (type) {
      case 'shock': return 'alert-red';
      case 'movement': return 'alert-yellow';
      case 'geofence_breach': return 'alert-blue';
      default: return 'alert-gray';
    }
  };

  if (loading) return <div className="loading">Loading alerts...</div>;

  return (
    <div className="alerts-page">
      <div className="page-header">
        <h1>Anti-Theft Alerts</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="test-alerts">
        <h2>Test Alert System</h2>
        <p>Send a test alert to verify notifications are working.</p>
        <select id="test-vehicle">
          <option value="">Select vehicle</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.plate_number}</option>
          ))}
        </select>
        <button 
          onClick={() => handleTest(document.getElementById('test-vehicle').value)}
          disabled={testing}
          className="btn-primary"
        >
          {testing ? 'Sending...' : 'Send Test Alert'}
        </button>
      </div>

      <div className="alerts-list">
        <h2>Alert History</h2>
        {alerts.length === 0 ? (
          <p>No alerts recorded</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Vehicle</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert.id}>
                  <td>{new Date(alert.created_at).toLocaleString()}</td>
                  <td>{alert.plate_number}</td>
                  <td>
                    <span className={getAlertTypeColor(alert.alert_type)}>
                      {alert.alert_type}
                    </span>
                  </td>
                  <td>{alert.severity}</td>
                  <td>{alert.description || '-'}</td>
                  <td>{alert.acknowledged ? 'Acknowledged' : 'New'}</td>
                  <td>
                    {!alert.acknowledged && (
                      <button 
                        onClick={() => handleAcknowledge(alert.id)}
                        className="btn-link"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="alert-info">
        <h2>Alert Types</h2>
        <div className="info-box">
          <h3>Shock/Impact</h3>
          <p>Triggered when sudden impact detected via accelerometer. SMS sent to emergency contacts.</p>
          
          <h3>Movement</h3>
          <p>Triggered when vehicle moves while ignition is OFF.</p>
          
          <h3>Ignition Unauthorized</h3>
          <p>Triggered when ignition turned on without authorization.</p>
          
          <h3>Tampering</h3>
          <p>Triggered when device tampering detected.</p>
        </div>
      </div>
    </div>
  );
};

export default Alerts;