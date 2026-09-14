import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
}

export interface CityInfo {
  name: string;
  districts: string[];
  center: UserCoordinates;
}

export const TURKEY_CITIES: Record<string, CityInfo> = {
  'İstanbul': {
    name: 'İstanbul',
    districts: ['Tüm İlçeler', 'Sarıyer', 'Kadıköy', 'Eyüpsultan', 'Ataşehir', 'Beşiktaş', 'Beykoz', 'Bakırköy', 'Çekmeköy', 'Beylikdüzü', 'Üsküdar'],
    center: { latitude: 41.0082, longitude: 28.9784 }
  },
  'Ankara': {
    name: 'Ankara',
    districts: ['Tüm İlçeler', 'Çankaya', 'Gölbaşı', 'Yenimahalle', 'Etimesgut'],
    center: { latitude: 39.9334, longitude: 32.8597 }
  },
  'İzmir': {
    name: 'İzmir',
    districts: ['Tüm İlçeler', 'Urla', 'Çeşme', 'Karşıyaka', 'Bornova', 'Alsancak', 'Güzelbahçe'],
    center: { latitude: 38.4237, longitude: 27.1428 }
  },
  'Antalya': {
    name: 'Antalya',
    districts: ['Tüm İlçeler', 'Muratpaşa', 'Konyaaltı', 'Serik (Belek)', 'Alanya'],
    center: { latitude: 36.8969, longitude: 30.7133 }
  },
  'Muğla': {
    name: 'Muğla',
    districts: ['Tüm İlçeler', 'Bodrum', 'Fethiye', 'Marmaris'],
    center: { latitude: 37.1042, longitude: 27.2954 }
  },
  'Bursa': {
    name: 'Bursa',
    districts: ['Tüm İlçeler', 'Nilüfer', 'Osmangazi', 'Yıldırım'],
    center: { latitude: 40.1885, longitude: 29.0610 }
  }
};

export type LocationPermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

interface LocationContextType {
  coords: UserCoordinates | null;
  selectedCity: string;
  selectedDistrict: string;
  status: LocationPermissionStatus;
  isLocationModalOpen: boolean;
  hasLocationPermission: boolean;
  detectedCityName: string | null;
  requestLocation: () => Promise<boolean>;
  setSelectedCity: (city: string) => void;
  setSelectedDistrict: (district: string) => void;
  openLocationModal: () => void;
  closeLocationModal: () => void;
  calculateDistance: (lat?: number, lng?: number) => number | null;
  formatDistance: (lat?: number, lng?: number) => string | null;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// Haversine formula
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestCity(coords: UserCoordinates): string {
  let closestCity = 'Tüm Türkiye';
  let minDistance = Infinity;

  Object.entries(TURKEY_CITIES).forEach(([cityName, info]) => {
    const dist = getDistanceKm(coords.latitude, coords.longitude, info.center.latitude, info.center.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closestCity = cityName;
    }
  });

  return closestCity;
}

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [coords, setCoords] = useState<UserCoordinates | null>(() => {
    try {
      const savedLat = localStorage.getItem('arenamate_lat');
      const savedLng = localStorage.getItem('arenamate_lng');
      if (savedLat && savedLng) {
        return { latitude: parseFloat(savedLat), longitude: parseFloat(savedLng) };
      }
    } catch {}
    return null;
  });

  const [selectedCity, setSelectedCityState] = useState<string>(() => {
    try {
      return localStorage.getItem('arenamate_city') || 'Tüm Türkiye';
    } catch {}
    return 'Tüm Türkiye';
  });

  const [selectedDistrict, setSelectedDistrict] = useState<string>('ALL');
  const [status, setStatus] = useState<LocationPermissionStatus>('idle');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [detectedCityName, setDetectedCityName] = useState<string | null>(null);

  const setSelectedCity = useCallback((city: string) => {
    setSelectedCityState(city);
    setSelectedDistrict('ALL');
    try {
      localStorage.setItem('arenamate_city', city);
    } catch {}
  }, []);

  const requestLocation = useCallback(async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return false;
    }

    setStatus('requesting');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newCoords: UserCoordinates = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };
          setCoords(newCoords);
          setStatus('granted');

          const nearest = findNearestCity(newCoords);
          setDetectedCityName(nearest);
          setSelectedCity(nearest);

          try {
            localStorage.setItem('arenamate_lat', String(newCoords.latitude));
            localStorage.setItem('arenamate_lng', String(newCoords.longitude));
            localStorage.setItem('arenamate_location_prompt_seen', 'true');
          } catch {}

          resolve(true);
        },
        (err) => {
          console.warn('Geolocation permission or lookup failed:', err.message);
          setStatus('denied');
          try {
            localStorage.setItem('arenamate_location_prompt_seen', 'true');
          } catch {}
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 120000
        }
      );
    });
  }, [setSelectedCity]);

  // Check initial permission status if available
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((perm) => {
        if (perm.state === 'granted') {
          requestLocation();
        } else if (perm.state === 'prompt') {
          // If never asked before, prompt user politely after a short delay
          const hasSeenPrompt = localStorage.getItem('arenamate_location_prompt_seen');
          if (!hasSeenPrompt) {
            const timer = setTimeout(() => {
              setIsLocationModalOpen(true);
            }, 1200);
            return () => clearTimeout(timer);
          }
        }
      }).catch(() => {
        // Fallback for browsers with restricted permissions API
      });
    } else {
      const hasSeenPrompt = localStorage.getItem('arenamate_location_prompt_seen');
      if (!hasSeenPrompt && !coords) {
        const timer = setTimeout(() => {
          setIsLocationModalOpen(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [coords, requestLocation]);

  const calculateDistance = useCallback((lat?: number, lng?: number): number | null => {
    if (!coords || lat === undefined || lng === undefined) return null;
    const d = getDistanceKm(coords.latitude, coords.longitude, lat, lng);
    return Math.round(d * 10) / 10;
  }, [coords]);

  const formatDistance = useCallback((lat?: number, lng?: number): string | null => {
    const dist = calculateDistance(lat, lng);
    if (dist === null) return null;
    if (dist < 1) {
      return `${Math.round(dist * 1000)} m`;
    }
    return `${dist.toFixed(1)} km`;
  }, [calculateDistance]);

  return (
    <LocationContext.Provider
      value={{
        coords,
        selectedCity,
        selectedDistrict,
        status,
        isLocationModalOpen,
        hasLocationPermission: !!coords,
        detectedCityName,
        requestLocation,
        setSelectedCity,
        setSelectedDistrict,
        openLocationModal: () => setIsLocationModalOpen(true),
        closeLocationModal: () => setIsLocationModalOpen(false),
        calculateDistance,
        formatDistance
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
