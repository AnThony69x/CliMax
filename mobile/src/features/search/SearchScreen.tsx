import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { City } from '../../types';

const GLASS_BG     = 'rgba(255,255,255,0.12)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';

const POPULAR_CITIES = [
  { name: 'Ciudad de México', country: 'México',    icon: '⛅', high: 24, low: 16 },
  { name: 'Madrid',           country: 'España',    icon: '☀️', high: 22, low: 14 },
  { name: 'Buenos Aires',     country: 'Argentina', icon: '🌤️', high: 19, low: 12 },
  { name: 'Bogotá',           country: 'Colombia',  icon: '🌧️', high: 17, low: 10 },
  { name: 'Lima',             country: 'Perú',      icon: '🌫️', high: 20, low: 15 },
];

const TRENDS = [
  { icon: '🌡️', label: 'Ciudad más caliente',   value: 'Kuwait City', sub: '48°C sin nubes' },
  { icon: '💨', label: 'Calidad del aire',       value: 'Buena',       sub: 'Índice global' },
  { icon: '🌊', label: 'Nivel de mareas',        value: '+0.8m Alto',  sub: 'Atlántico Norte' },
];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const searchCity = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) { setResults([]); return; }
      const response = await fetch(`${apiUrl}/search?city=${encodeURIComponent(query.trim())}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.warn('Error searching city:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCity = (city: City) => {
    router.push({ pathname: '/(tabs)', params: { city: city.name, lat: city.lat, lon: city.lon } });
  };

  const showResults = searched || loading;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Encabezado ── */}
        <View style={styles.header}>
          <Text style={styles.labelCaps}>EXPLORAR</Text>
          <Text style={styles.title}>Buscar ciudad</Text>
        </View>

        {/* ── Barra de búsqueda ── */}
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Busca una ciudad..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            onSubmitEditing={searchCity}
            returnKeyType="search"
            selectionColor="#90cdfd"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => { setQuery(''); setResults([]); setSearched(false); }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* ── Resultados de búsqueda ── */}
        {showResults && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionLabelCaps}>RESULTADOS</Text>

            {loading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator color="#90cdfd" />
                <Text style={styles.stateText}>Buscando...</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.stateBox}>
                <Text style={styles.stateEmoji}>🌍</Text>
                <Text style={styles.stateText}>No se encontraron ciudades para "{query}"</Text>
              </View>
            ) : (
              <View style={styles.resultsList}>
                {results.map((city) => (
                  <Pressable
                    key={city.id}
                    style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.75 }]}
                    onPress={() => handleSelectCity(city)}
                  >
                    <Text style={styles.resultPin}>📍</Text>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{city.name}</Text>
                      <Text style={styles.resultCountry}>{city.country}</Text>
                    </View>
                    <Text style={styles.resultChevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Ciudades populares ── */}
        {!showResults && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabelCaps}>CERCA DE TI</Text>
              <Text style={styles.sectionTitle}>Ciudades populares</Text>

              <View style={styles.popularList}>
                {POPULAR_CITIES.map((city) => (
                  <Pressable
                    key={city.name}
                    style={({ pressed }) => [styles.popularRow, pressed && { opacity: 0.75 }]}
                    onPress={() => {
                      setQuery(city.name);
                      searchCity();
                    }}
                  >
                    <Text style={styles.popularPin}>📍</Text>
                    <Text style={styles.popularName}>{city.name}</Text>
                    <View style={styles.popularRight}>
                      <Text style={styles.popularTemp}>
                        {city.high}° / {city.low}°
                      </Text>
                      <Text style={styles.popularIcon}>{city.icon}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── Tendencias globales ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabelCapsAmber}>INSIGHTS</Text>
              <Text style={styles.sectionTitle}>Tendencias globales</Text>

              <View style={styles.trendsGrid}>
                {TRENDS.map((trend) => (
                  <View key={trend.label} style={styles.trendCard}>
                    <Text style={styles.trendIcon}>{trend.icon}</Text>
                    <Text style={styles.trendLabel}>{trend.label}</Text>
                    <Text style={styles.trendValue}>{trend.value}</Text>
                    <Text style={styles.trendSub}>{trend.sub}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111316',
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 24,
  },

  /* ── Header ── */
  header: { gap: 4 },
  labelCaps: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#90cdfd',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },

  /* ── Search bar ── */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  searchIcon: { fontSize: 18 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },

  /* ── Results ── */
  resultsSection: { gap: 12 },
  sectionLabelCaps: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#90cdfd',
  },
  stateBox: {
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  stateEmoji: { fontSize: 40 },
  stateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  resultsList: { gap: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  resultPin: { fontSize: 18 },
  resultInfo: { flex: 1 },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resultCountry: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  resultChevron: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.3)',
  },

  /* ── Section ── */
  section: { gap: 14 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionLabelCapsAmber: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#ffb95a',
  },

  /* ── Popular cities ── */
  popularList: { gap: 10 },
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  popularPin: { fontSize: 18 },
  popularName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  popularRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  popularTemp: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  popularIcon: { fontSize: 20 },

  /* ── Trends ── */
  trendsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  trendCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 16,
    gap: 6,
  },
  trendIcon: { fontSize: 28 },
  trendLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  trendValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trendSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
});
