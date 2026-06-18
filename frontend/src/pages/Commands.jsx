import { useState, useEffect } from 'react';
import { commandsAPI, vehiclesAPI } from '../services/api';

const Commands = () => {
  const [commands, setCommands] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [commandType, setCommandType] = useState('RELAY,0');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [commandsRes, vehiclesRes] = await Promise.all([
        commandsAPI.getHistory({}),
        vehiclesAPI.getAll(),
      ]);
      setCommands(commandsRes.data.commands || []);
      setVehicles(vehiclesRes.data.vehicles || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');

    try {
      await commandsAPI.send({
        vehicle_id: selectedVehicle,
        command_type: commandType,
      });
      setSelectedVehicle('');
      loadData();
      alert('Command sent successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send command');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this command?')) return;
    try {
      await commandsAPI.cancel(id);
      loadData();
    } catch (err) {
      setError('Failed to cancel command');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'executed': return 'status-active';
      case 'failed': return 'status-disabled';
      case 'sent': return 'status-overdue';
      default: return '';
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="commands-page">
      <div className="page-header">
        <h1>Command Controls</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="command-form">
        <h2>Send Command</h2>
        <form onSubmit={handleSend}>
          <div className="form-group">
            <label>Vehicle *</label>
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              required
            >
              <option value="">Select vehicle</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Command *</label>
            <select
              value={commandType}
              onChange={(e) => setCommandType(e.target.value)}
              required
            >
              <option value="RELAY,0">Restore Fuel (Engine On)</option>
              <option value="RELAY,1">Cut Fuel (Engine Off)</option>
              <option value="WHERE">Get Location</option>
              <option value="PARAM">Get Status</option>
            </select>
          </div>
          <p className="command-info">
            ⚠️ Engine cutoff only works when vehicle speed &lt; 20 km/h
          </p>
          <button type="submit" disabled={sending || !selectedVehicle} className="btn-primary">
            {sending ? 'Sending...' : 'Send Command'}
          </button>
        </form>
      </div>

      <div className="commands-history">
        <h2>Command History</h2>
        {commands.length === 0 ? (
          <p>No commands sent yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Vehicle</th>
                <th>Command</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commands.map(cmd => (
                <tr key={cmd.id}>
                  <td>{new Date(cmd.created_at).toLocaleString()}</td>
                  <td>{cmd.plate_number}</td>
                  <td>{cmd.command_type}</td>
                  <td>
                    <span className={getStatusColor(cmd.status)}>
                      {cmd.status}
                    </span>
                  </td>
                  <td>
                    {['queued', 'pending'].includes(cmd.status) && (
                      <button 
                        onClick={() => handleCancel(cmd.id)}
                        className="btn-link"
                      >
                        Cancel
                      </button>
                    )}
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

export default Commands;