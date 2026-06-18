import { useState, useEffect } from 'react';
import { analyticsAPI } from '../services/api';

const Analytics = () => {
  const [driverScores, setDriverScores] = useState([]);
  const [brakeWear, setBrakeWear] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [scoresRes, wearRes] = await Promise.all([
        analyticsAPI.getDriverScores(),
        analyticsAPI.getBrakeWear(),
      ]);
      setDriverScores(scoresRes.data.driver_scores || []);
      setBrakeWear(wearRes.data.brake_wear || []);
    } catch (err) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green';
    if (score >= 60) return 'text-yellow';
    return 'text-red';
  };

  const getWearColor = (percentage) => {
    if (percentage >= 50) return 'text-green';
    if (percentage >= 20) return 'text-yellow';
    return 'text-red';
  };

  if (loading) return <div className="loading">Loading analytics...</div>;

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="analytics-section">
        <h2>Driver Scores</h2>
        <p className="section-description">
          Scores based on harsh acceleration, braking, and turning events. Higher is better.
        </p>
        
        {driverScores.length === 0 ? (
          <p>No driver score data available</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Profile</th>
                <th>Score</th>
                <th>Harsh Accel</th>
                <th>Harsh Brake</th>
                <th>Harsh Turns</th>
                <th>Overspeeding</th>
                <th>Total Trips</th>
              </tr>
            </thead>
            <tbody>
              {driverScores.map(ds => (
                <tr key={ds.id}>
                  <td>{ds.plate_number}</td>
                  <td>{ds.profile_type}</td>
                  <td className={getScoreColor(ds.score)}>
                    <strong>{ds.score}</strong>
                  </td>
                  <td>{ds.harsh_acceleration_count}</td>
                  <td>{ds.harsh_braking_count}</td>
                  <td>{ds.harsh_turning_count}</td>
                  <td>{ds.overspeeding_count}</td>
                  <td>{ds.total_trips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="analytics-section">
        <h2>Predictive Brake Pad Wear</h2>
        <p className="section-description">
          Estimated remaining brake pad life based on deceleration patterns.
        </p>
        
        {brakeWear.length === 0 ? (
          <p>No brake wear data available</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Remaining</th>
                <th>Last Replacement</th>
                <th>Next Replacement</th>
                <th>Wear Rate</th>
                <th>Decel Events</th>
              </tr>
            </thead>
            <tbody>
              {brakeWear.map(bw => (
                <tr key={bw.id}>
                  <td>{bw.plate_number}</td>
                  <td className={getWearColor(bw.estimated_remaining_percentage)}>
                    <strong>{bw.estimated_remaining_percentage}%</strong>
                  </td>
                  <td>{bw.last_replacement_date || 'N/A'}</td>
                  <td>{bw.next_replacement_estimate || 'N/A'}</td>
                  <td>{bw.wear_rate?.toFixed(4) || 0}</td>
                  <td>{bw.deceleration_events_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="analytics-section">
        <h2>Understanding the Metrics</h2>
        <div className="info-box">
          <h3>Driver Score</h3>
          <ul>
            <li><strong>80-100:</strong> Excellent - Safe driving</li>
            <li><strong>60-79:</strong> Good - Minor harsh events</li>
            <li><strong>40-59:</strong> Fair - Needs improvement</li>
            <li><strong>Below 40:</strong> Poor - Aggressive driving</li>
          </ul>
          
          <h3>Brake Pad Wear</h3>
          <ul>
            <li><strong>50%+:</strong> Good condition</li>
            <li><strong>20-49%:</strong> Monitor closely</li>
            <li><strong>Below 20%:</strong> Replace soon</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Analytics;