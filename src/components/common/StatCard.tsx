import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';

interface StatCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}

/** Half-width rounded stat card — Profile screen shows two side by side. */
export const StatCard: React.FC<StatCardProps> = ({ icon, value, label }) => {
  return (
    <View style={styles.card}>
      {icon}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.lg,
    padding: SIZES.md,
    gap: SIZES.xs,
  },
  value: {
    fontFamily: FONTS.extrabold,
    fontSize: 28,
    color: COLORS.text.primary,
    marginTop: SIZES.sm,
  },
  label: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
});
