import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { premiumColors, premiumRadii } from '../theme/premium';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function Input({ label, error, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor="rgba(27,32,39,0.4)"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: premiumColors.inkSubtle,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  input: {
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    borderRadius: premiumRadii.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: premiumColors.ink,
    backgroundColor: premiumColors.glass,
  },
  inputFocused: {
    borderColor: premiumColors.glassBorderStrong,
    backgroundColor: premiumColors.glassStrong,
  },
  inputError: {
    borderColor: 'rgba(182,67,44,0.72)',
  },
  error: {
    fontSize: 12,
    color: premiumColors.danger,
  },
});
