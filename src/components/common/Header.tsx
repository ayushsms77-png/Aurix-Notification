import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../../constants/theme';

interface HeaderProps {
  title: string;
  rightIcon?: React.ReactNode;
  onRightPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, rightIcon, onRightPress }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + SIZES.lg }]}>
      <Text style={styles.title}>{title}</Text>
      {rightIcon && (
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onRightPress}
          style={styles.iconButton}
        >
          {rightIcon}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.xl,
    marginTop: SIZES.md, // Extra breathing space from top
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 34,
    color: COLORS.text.primary,
    letterSpacing: -0.5,
  },
  iconButton: {
    marginTop: 10, // Pushes icon down so it isn't stuck to the top
  },
});
