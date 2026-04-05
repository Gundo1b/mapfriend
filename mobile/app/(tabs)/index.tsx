import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { apiFetchJson } from "@/lib/api";
import { AuthForm } from "@/components/AuthForm";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Profile = {
  username: string | null;
  purpose: string | null;
  avatar_url: string | null;
  bio: string | null;
  lat: number;
  lng: number;
};

export default function ExploreTab() {
  const { token, user, isHydrated } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const fetchProfiles = async () => {
    if (!token) return;
    try {
      const res = await apiFetchJson<{ ok: true; locations: Profile[] }>("/api/locations", {
        token,
      });
      if (res.ok) {
        setProfiles(res.locations.filter((p) => p.username));
      }
    } catch (e) {
      console.error("Failed to fetch profiles:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isHydrated && token) {
      fetchProfiles();
    } else if (isHydrated && !token) {
      setLoading(false);
    }
  }, [isHydrated, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfiles();
  };

  if (!isHydrated || (loading && !refreshing)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00a884" size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>MapFriend</Text>
        <Text style={styles.authSub}>Find friends near you.</Text>
        <AuthForm onAuthSuccess={() => {}} />
      </View>
    );
  }

  const CARD_HEIGHT = height - insets.bottom - insets.top - 60; // Adjusted for tab bar

  const renderItem = ({ item }: { item: Profile }) => {
    return (
      <View style={[styles.card, { height: CARD_HEIGHT, width: width }]}>
        <View style={styles.cardInner}>
          <View style={styles.imageContainer}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.placeholderImage]}>
                <SymbolView name="person.fill" size={120} tintColor="rgba(255,255,255,0.15)" />
              </View>
            )}
            <View style={styles.overlay}>
              <View style={styles.overlayContent}>
                <View style={styles.nameRow}>
                  <Text style={styles.nameText}>{item.username}</Text>
                  <View style={styles.activeDot} />
                </View>
                <View style={styles.purposeBadge}>
                  <Text style={styles.purposeText}>{item.purpose || "social"}</Text>
                </View>
                <Text style={styles.bioText} numberOfLines={2}>
                  {item.bio || "Connecting through MapFriend..."}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/chat/${item.username}`)}
            >
              <SymbolView name="bubble.left.fill" size={24} tintColor="white" />
              <Text style={styles.actionButtonText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={profiles}
        renderItem={renderItem}
        keyExtractor={(item) => item.username || Math.random().toString()}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00a884" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No one nearby yet.</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>Try Refreshing</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  authContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#0b141a",
  },
  authTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#e9edef",
    textAlign: "center",
  },
  authSub: {
    fontSize: 16,
    color: "rgba(233,237,239,0.6)",
    textAlign: "center",
    marginBottom: 32,
  },
  card: {
    padding: 10,
  },
  cardInner: {
    flex: 1,
    backgroundColor: "#111b21",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  imageContainer: {
    flex: 1,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1c2c35",
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    justifyContent: "flex-end",
    backgroundColor: "transparent", // Use a real gradient if possible, but opacity works
    // Mimicking a gradient with a background color that fades (not really possible without a library, but we can use a semi-opaque black)
  },
  overlayContent: {
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameText: {
    fontSize: 32,
    fontWeight: "800",
    color: "white",
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#00a884",
    borderWidth: 2,
    borderColor: "white",
  },
  purposeBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  purposeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bioText: {
    fontSize: 17,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 24,
    fontWeight: "400",
  },
  actionsRow: {
    padding: 16,
    backgroundColor: "#111b21",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  actionButton: {
    backgroundColor: "#00a884",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    gap: 10,
  },
  actionButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    color: "rgba(233,237,239,0.5)",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  refreshButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 99,
    backgroundColor: "#202c33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  refreshButtonText: {
    color: "#00a884",
    fontWeight: "600",
  },
});
