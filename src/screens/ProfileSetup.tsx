import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { Gender } from '../services/LibraryService';
import { useLibrary } from '../hooks/useLibrary';

type RootStackParamList = { Main: undefined };

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

/**
 * One-time profile capture, shown after the app's own logo/splash for a
 * first-time user (the old separate "N Ø T E" branded intro screen was
 * removed from this flow entirely — this is the very first screen now).
 *
 * Restyled to use Aurix's own accent (red, COLORS.accent.green) for active
 * states and the primary button, instead of the previous neutral
 * white/grey treatment. Three fields, all optional and local-only: name,
 * gender, age.
 */
export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { saveProfile } = useLibrary();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');
  const [age, setAge] = useState('');

  const finish = () => {
    Keyboard.dismiss();
    const parsedAge = parseInt(age, 10);
    saveProfile({
      name: name.trim(),
      gender,
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : undefined,
      completed: true,
    });
    navigation.replace('Main');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { paddingTop: insets.top + SIZES.xxl }]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>ONE LAST THING</Text>
          <Text style={styles.title}>Who's listening?</Text>
          <Text style={styles.subtitle}>
            Stays on this device. You can leave anything blank.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.muted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            maxLength={40}
          />

          <Text style={[styles.label, styles.labelSpaced]}>AGE</Text>
          <TextInput
            style={[styles.input, styles.ageInput]}
            value={age}
            onChangeText={(v) => setAge(v.replace(/[^0-9]/g, '').slice(0, 3))}
            placeholder="Your age"
            placeholderTextColor={COLORS.text.muted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={finish}
            maxLength={3}
          />

          <Text style={[styles.label, styles.labelSpaced]}>GENDER</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((option) => {
              const active = gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.genderPill, active && styles.genderPillActive]}
                  activeOpacity={0.8}
                  onPress={() => setGender(option.value)}
                >
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + SIZES.xl }]}>
          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={finish}>
            <Text style={styles.buttonText}>
              {name.trim() ? `Continue as ${name.trim()}` : 'Continue'}
            </Text>
            <View style={styles.iconCircle}>
              <ArrowRight color={COLORS.background} size={20} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SIZES.lg,
  },
  header: {
    marginBottom: SIZES.xxl,
  },
  kicker: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 3,
    color: COLORS.accent.green,
    marginBottom: SIZES.md,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 34,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
  form: {
    flex: 1,
  },
  label: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.text.muted,
    marginBottom: SIZES.sm,
  },
  labelSpaced: {
    marginTop: SIZES.xl,
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.md,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.md,
  },
  ageInput: {
    width: 140,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  genderPill: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
    borderRadius: SIZES.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceLight,
  },
  genderPillActive: {
    backgroundColor: COLORS.accent.green,
    borderColor: COLORS.accent.green,
  },
  genderText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  genderTextActive: {
    color: COLORS.text.primary,
  },
  footer: {
    paddingTop: SIZES.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.accent.green,
    borderRadius: SIZES.radius.pill,
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.lg,
  },
  buttonText: {
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: COLORS.background,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
