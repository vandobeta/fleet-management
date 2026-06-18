package com.tracker.app.ui.map

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.MapStyleOptions
import com.tracker.app.R

class MapActivity : AppCompatActivity(), OnMapReadyCallback {

    private lateinit var googleMap: GoogleMap
    private lateinit var locationText: TextView
    private lateinit var statusText: TextView
    
    private var lastLatitude: Double = 0.0
    private var lastLongitude: Double = 0.0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_map)
        
        locationText = findViewById(R.id.location_text)
        statusText = findViewById(R.id.status_text)
        
        val mapFragment = supportFragmentManager
            .findFragmentById(R.id.map) as SupportMapFragment
        mapFragment.getMapAsync(this)
        
        loadLastLocation()
    }

    override fun onMapReady(map: GoogleMap) {
        googleMap = map
        
        // Set satellite view by default
        googleMap.mapType = GoogleMap.MAP_TYPE_SATELLITE
        
        // Enable zoom controls
        googleMap.uiSettings.isZoomControlsEnabled = true
        googleMap.uiSettings.isCompassEnabled = true
        googleMap.uiSettings.isMapToolbarEnabled = true
        
        if (lastLatitude != 0.0 && lastLongitude != 0.0) {
            showLocation(lastLatitude, lastLongitude)
        }
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED) {
            googleMap.isMyLocationEnabled = true
        }
    }

    private fun loadLastLocation() {
        val prefs = getSharedPreferences("tracker_prefs", MODE_PRIVATE)
        val lat = prefs.getString("last_latitude", "") ?: ""
        val lng = prefs.getString("last_longitude", "") ?: ""
        
        if (lat.isNotEmpty() && lng.isNotEmpty()) {
            lastLatitude = lat.toDoubleOrNull() ?: 0.0
            lastLongitude = lng.toDoubleOrNull() ?: 0.0
            
            locationText.text = "Last known: ${lastLatitude}, ${lastLongitude}"
        } else {
            locationText.text = "No location data. Request location first."
        }
    }

    private fun showLocation(latitude: Double, longitude: Double) {
        val location = LatLng(latitude, longitude)
        
        googleMap.clear()
        googleMap.addMarker(
            MarkerOptions()
                .position(location)
                .title("Tracker Location")
                .snippet("$latitude, $longitude")
        )
        
        googleMap.animateCamera(
            CameraUpdateFactory.newLatLngZoom(location, 15f)
        )
    }
}