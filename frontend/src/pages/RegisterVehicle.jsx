import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { vehiclesAPI } from '../services/api';

const RegisterVehicle = () => {
  const [formData, setFormData] = useState({
    plate_number: '',
    VIN: '',
    profile_type: 'normal',
    flespi_device_id: '',
    IMEI: '',
    tracker_phone_number: '',
    // Leasing/Renting
    payment_type: 'monthly',
    amount: '',
    // Normal tracking
    subscription_plan_type: 'monthly',
    subscription_amount: '50',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = { ...formData };
      
      if (data.profile_type === 'normal') {
        data.subscription_amount = parseFloat(data.subscription_amount);
      } else {
        data.amount = parseFloat(data.amount);
      }
      
      await vehiclesAPI.register(data);
      navigate('/vehicles');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const requiresVIN = ['leasing', 'renting', 'recovery'].includes(formData.profile_type);
  const requiresPayment = ['leasing', 'renting'].includes(formData.profile_type);

  return (
    <div className="register-vehicle">
      <div className="page-header">
        <Link to="/vehicles" className="back-link">← Back to Vehicles</Link>
        <h1>Register Vehicle</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="vehicle-form">
        <div className="form-section">
          <h2>Basic Information</h2>
          
          <div className="form-group">
            <label>Plate Number *</label>
            <input
              type="text"
              name="plate_number"
              value={formData.plate_number}
              onChange={handleChange}
              placeholder="Enter plate number"
              required
            />
          </div>

          <div className="form-group">
            <label>Profile Type *</label>
            <select
              name="profile_type"
              value={formData.profile_type}
              onChange={handleChange}
              required
            >
              <option value="normal">Normal Tracking</option>
              <option value="leasing">Leasing</option>
              <option value="renting">Renting</option>
              <option value="recovery">Recovery</option>
            </select>
          </div>

          {requiresVIN && (
            <div className="form-group">
              <label>VIN *</label>
              <input
                type="text"
                name="VIN"
                value={formData.VIN}
                onChange={handleChange}
                placeholder="Enter VIN"
                required
              />
            </div>
          )}
        </div>

        <div className="form-section">
          <h2>Tracker Configuration</h2>
          
          <div className="form-group">
            <label>Tracker Phone Number</label>
            <input
              type="tel"
              name="tracker_phone_number"
              value={formData.tracker_phone_number}
              onChange={handleChange}
              placeholder="+1234567890"
            />
          </div>

          <div className="form-group">
            <label>Flespi Device ID</label>
            <input
              type="text"
              name="flespi_device_id"
              value={formData.flespi_device_id}
              onChange={handleChange}
              placeholder="Flespi device ID"
            />
          </div>

          <div className="form-group">
            <label>IMEI</label>
            <input
              type="text"
              name="IMEI"
              value={formData.IMEI}
              onChange={handleChange}
              placeholder="Device IMEI"
            />
          </div>
        </div>

        {requiresPayment && (
          <div className="form-section">
            <h2>Payment Details</h2>
            
            <div className="form-group">
              <label>Payment Type *</label>
              <select
                name="payment_type"
                value={formData.payment_type}
                onChange={handleChange}
                required
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="form-group">
              <label>Amount *</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Payment amount"
                step="0.01"
                required
              />
            </div>
          </div>
        )}

        {formData.profile_type === 'normal' && (
          <div className="form-section">
            <h2>Subscription Details</h2>
            
            <div className="form-group">
              <label>Plan Type *</label>
              <select
                name="subscription_plan_type"
                value={formData.subscription_plan_type}
                onChange={handleChange}
                required
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="form-group">
              <label>Amount *</label>
              <input
                type="number"
                name="subscription_amount"
                value={formData.subscription_amount}
                onChange={handleChange}
                placeholder="Subscription amount"
                step="0.01"
                required
              />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Registering...' : 'Register Vehicle'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterVehicle;