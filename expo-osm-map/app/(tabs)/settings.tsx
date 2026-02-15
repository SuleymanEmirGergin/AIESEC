import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL, getHealthStatus } from "../../lib/api";

type HealthState = "idle" | "checking" | "ok" | "error";

export default function SettingsScreen() {
  const [darkMode, setDarkMode] = useState(false);
  const [showDistance, setShowDistance] = useState(true);
  const [healthState, setHealthState] = useState<HealthState>("idle");
  const [healthDetail, setHealthDetail] = useState("Not checked yet.");

  const checkHealth = useCallback(async () => {
    setHealthState("checking");
    setHealthDetail("Checking backend health...");
    try {
      const data = await getHealthStatus();
      setHealthState("ok");
      setHealthDetail(`Backend status: ${data.status}`);
    } catch (err) {
      setHealthState("error");
      setHealthDetail(err instanceof Error ? err.message : "Health check failed.");
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const healthColor = useMemo(() => {
    if (healthState === "ok") return "#166534";
    if (healthState === "error") return "#B91C1C";
    return "#475569";
  }, [healthState]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Dark Mode</Text>
            <Text style={styles.helper}>UI switch placeholder for next iteration.</Text>
          </View>
          <Switch value={darkMode} onValueChange={setDarkMode} />
        </View>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Show Distance</Text>
            <Text style={styles.helper}>Display distance in search cards when available.</Text>
          </View>
          <Switch value={showDistance} onValueChange={setShowDistance} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.healthHeader}>
          <Text style={styles.sectionTitle}>Backend</Text>
          <Pressable onPress={checkHealth} style={styles.healthButton}>
            <Text style={styles.healthButtonText}>Check</Text>
          </Pressable>
        </View>
        <Text style={styles.apiLabel}>API URL</Text>
        <Text style={styles.apiValue}>{API_BASE_URL}</Text>
        <Text style={[styles.healthText, { color: healthColor }]}>{healthDetail}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.info}>POI Finder Mobile v1.0.0</Text>
        <Text style={styles.info}>Built with Expo + React Native</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    color: "#0F172A",
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  label: {
    fontSize: 16,
    color: "#0F172A",
  },
  helper: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  healthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  healthButton: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  healthButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  apiLabel: {
    color: "#64748B",
    fontSize: 11,
    marginBottom: 2,
  },
  apiValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  healthText: {
    fontSize: 12,
    fontWeight: "600",
  },
  info: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 4,
  },
});
