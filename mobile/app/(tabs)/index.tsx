import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CliMax</Text>
      <Text style={styles.subtitle}>Base móvil lista</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F8F3',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F3D2E',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#486757',
    textAlign: 'center',
  },
});
