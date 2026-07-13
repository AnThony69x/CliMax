import { TransitionPresets } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  Home,
  Search,
  Users,
  Bell,
  ChartLine,
  ShieldUser,
  Sliders,
  User,
} from 'reicon-react-native';

import LiquidGlassFloatingTabBar from '../../src/components/LiquidGlassFloatingTabBar';
import { useAccess } from '../../src/core/access/AccessContext';
import { premiumColors } from '../../src/theme/premium';

const ADMIN_ROUTES = ['index', 'community', 'admin', 'operator', 'explore'];
const OPERATOR_ROUTES = ['index', 'community', 'operator', 'explore'];

export default function TabLayout() {
  const { loading, isAdmin, isOperator, hasEntitlement } = useAccess();
  const communityEnabled = hasEntitlement('community.basic');
  const alertsEnabled = hasEntitlement('alerts.basic');
  const professionalEnabled = hasEntitlement('weather.history.extended');
  const showUserSearch = !isAdmin && !isOperator;
  const showUserCommunity = communityEnabled || isAdmin || isOperator;
  const showUserAlerts = alertsEnabled && !isAdmin && !isOperator;
  const showProfessional = professionalEnabled && !isAdmin && !isOperator;
  const showOperatorTab = isOperator;
  const userRoutes = [
    'index',
    'search',
    communityEnabled ? 'community' : null,
    alertsEnabled ? 'alerts' : null,
    professionalEnabled ? 'professional' : null,
    'explore',
  ].filter((route): route is string => Boolean(route));
  const visibleRouteNames = isAdmin
    ? ADMIN_ROUTES
    : isOperator
      ? OPERATOR_ROUTES
      : userRoutes;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: premiumColors.surface }}>
        <ActivityIndicator color={premiumColors.accentSoft} />
      </View>
    );
  }

  return (
    <Tabs
      tabBar={(props) => <LiquidGlassFloatingTabBar {...props} visibleRouteNames={visibleRouteNames} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        sceneStyle: {
          backgroundColor: premiumColors.surface,
        },
        ...TransitionPresets.ShiftTransition,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Home size={size} color={color} weight="Filled" />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Buscar',
          href: showUserSearch ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Search size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Comunidad',
          href: showUserCommunity ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alertas',
          href: showUserAlerts ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Bell size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="professional"
        options={{
          title: 'Pro',
          href: showProfessional ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <ChartLine size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="operator"
        options={{
          title: 'Moderar',
          href: showOperatorTab ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <ShieldUser size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Sliders size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
