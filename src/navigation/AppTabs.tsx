// src/navigation/AppTabs.tsx
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import { CaptureScreen } from "../screens/CaptureScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home:     { active: "home",     inactive: "home-outline" },
  Capture:  { active: "scan",     inactive: "scan-outline" },
  Settings: { active: "settings", inactive: "settings-outline" },
};

export function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Capture"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.4 },
        tabBarIcon: ({ color, size, focused }) => {
          const pair = ICONS[route.name];
          if (!pair) return null;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="Capture"  component={CaptureScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
