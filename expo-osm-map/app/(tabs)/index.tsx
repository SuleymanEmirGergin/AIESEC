import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { searchPlaces, type Place } from "../../lib/api";

const DEFAULT_BBOX: [number, number, number, number] = [28.8, 40.9, 29.1, 41.1];
const DEFAULT_CATEGORIES = ["primary_school", "high_school", "kindergarten"];

export default function MapScreen() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [region] = useState({
    latitude: 41.0082,
    longitude: 28.9784,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchPlaces({
        bbox: DEFAULT_BBOX,
        categories: DEFAULT_CATEGORIES,
        limit: 250,
        ref_lat: region.latitude,
        ref_lon: region.longitude,
      });
      setPlaces(results);
    } catch (err) {
      setPlaces([]);
      setError(err instanceof Error ? err.message : "Could not load places.");
    } finally {
      setLoading(false);
    }
  }, [region.latitude, region.longitude]);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <MapView
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
      >
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.coordinates.lat,
              longitude: place.coordinates.lng,
            }}
            title={place.name}
            description={`${place.type}${place.ownership ? ` | ${place.ownership}` : ""}`}
          />
        ))}
      </MapView>

      <View style={styles.overlay}>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.title}>Nearby Places</Text>
            <Pressable onPress={loadPlaces} disabled={loading} style={styles.refreshButton}>
              <Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh"}</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            {places.length > 0 ? `${places.length} place(s) visible` : "No places loaded yet"}
          </Text>
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#0EA5E9" />
              <Text style={styles.loadingText}>Fetching data from backend...</Text>
            </View>
          )}
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Data fetch failed</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error && places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Try refreshing or check backend connection.</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E2E8F0",
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    gap: 8,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
  },
  refreshButton: {
    backgroundColor: "#0EA5E9",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  refreshText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  loadingText: {
    fontSize: 12,
    color: "#475569",
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 2,
  },
  errorMessage: {
    fontSize: 12,
    color: "#B91C1C",
  },
  emptyCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  emptyText: {
    fontSize: 12,
    color: "#64748B",
  },
});
