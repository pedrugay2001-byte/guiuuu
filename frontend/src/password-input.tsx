import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useState } from "react";
import { Ionicons } from "./icons";
import { theme } from "./theme";

export function PasswordInput({
  value, onChangeText, placeholder, testID, style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  testID?: string;
  style?: any;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || "••••••••"}
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={() => setVisible((v) => !v)} style={styles.eye} testID={`${testID}-eye`}>
        <Ionicons
          name={visible ? "eye-off" : "eye"}
          size={18}
          color={theme.colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
    minHeight: 48,
  },
  input: {
    flex: 1, paddingHorizontal: 15, paddingVertical: 14,
    color: theme.colors.text, fontSize: 15,
  },
  eye: { paddingHorizontal: 14, paddingVertical: 14 },
});
