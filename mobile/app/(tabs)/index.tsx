import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function ExploreTab() {
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.header}>Explore</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Map coming next</Text>
        <Text style={styles.body}>
          This is the Expo mobile app. Next step is to add the map view (react-native-maps) and show
          people markers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: "100%",
    padding: 16,
    backgroundColor: "#0b141a",
    gap: 10,
  },
  header: { fontSize: 26, fontWeight: "900", color: "#e9edef" },
  card: {
    borderRadius: 18,
    backgroundColor: "rgba(17,27,33,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
  },
  title: { color: "#e9edef", fontSize: 16, fontWeight: "900" },
  body: { color: "rgba(233,237,239,0.65)", marginTop: 6, lineHeight: 20 },
});
