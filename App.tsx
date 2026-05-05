// App.tsx
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppTabs } from "./src/navigation/AppTabs";
import { colors } from "./src/theme";
import { MwaProvider } from "./src/wallet/MwaProvider";

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <MwaProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <AppTabs />
        </NavigationContainer>
      </MwaProvider>
    </SafeAreaProvider>
  );
}
