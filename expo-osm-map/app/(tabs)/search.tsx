import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { searchPlaces, type Place } from "../../lib/api";

const DEFAULT_BBOX: [number, number, number, number] = [28.8, 40.9, 29.1, 41.1];

const CATEGORY_OPTIONS = [
  { id: "primary_school", label: "Primary" },
  { id: "high_school", label: "High School" },
  { id: "kindergarten", label: "Kindergarten" },
];

export default function SearchScreen() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_OPTIONS[0].id);

  const loadPlaces = useCallback(
    async (asRefresh = false) => {
      setError(null);
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const results = await searchPlaces({
          bbox: DEFAULT_BBOX,
          categories: [selectedCategory],
          limit: 100,
        });
        setPlaces(results);
      } catch (err) {
        setPlaces([]);
        setError(err instanceof Error ? err.message : "Search request failed.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedCategory]
  );

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search Results</Text>
        <Text style={styles.subtitle}>Filter by category and pull to refresh.</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        {CATEGORY_OPTIONS.map((option) => {
          const active = selectedCategory === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSelectedCategory(option.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Search failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => loadPlaces()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && places.length === 0 ? (
        <ActivityIndicator size="large" style={styles.loader} color="#0EA5E9" />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPlaces(true)} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.badge}>{item.type}</Text>
              </View>
              <Text style={styles.meta}>
                {item.distance_km !== undefined
                  ? `${item.distance_km.toFixed(2)} km`
                  : item.ownership || "Ownership unknown"}
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No places found in this category.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    color: "#64748B",
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: "#0EA5E9",
  },
  chipText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#991B1B",
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    color: "#B91C1C",
  },
  retryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#DC2626",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  loader: {
    marginTop: 28,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748B",
  },
  empty: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 36,
    fontSize: 14,
  },
});
