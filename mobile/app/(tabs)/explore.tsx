import { StyleSheet, Text, View } from 'react-native';

export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Pantalla base para evolución por módulo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#EEF3FA',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2A44',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#47556B',
    textAlign: 'center',
  },
});
