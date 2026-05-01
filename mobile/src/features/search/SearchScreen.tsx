import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useCities } from '../../core/cities/CitiesContext';
import type { City } from '../../types';

const GLASS_BG     = 'rgba(255,255,255,0.12)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';
const DEBOUNCE_MS  = 350;

export default function SearchScreen() {
  const router = useRouter();
  const { addCity, hasCity, savedCities, removeCity } = useCities();

  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<City[]>([]);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [loadingSug, setLoadingSug]   = useState(false);
  const [focused, setFocused]         = useState(false);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Autocompletado con debounce ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoadingSug(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!apiUrl) { setLoadingSug(false); return; }
        const res = await fetch(
          `${apiUrl}/search?city=${encodeURIComponent(trimmed)}&count=6`
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results ?? []);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSug(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  /* ── Búsqueda completa (submit) ── */
  const searchCity = async () => {
    if (!query.trim()) return;
    setSuggestions([]);
    setLoading(true);
    setSearched(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) { setResults([]); return; }
      const res = await fetch(
        `${apiUrl}/search?city=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCity = (city: City) => {
    addCity(city);
    router.push('/(tabs)');
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setSearched(false);
  };

  const handleFocus = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    setFocused(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setFocused(false), 150);
  };

  const showSuggestions = focused && (suggestions.length > 0 || loadingSug);
  const showResults     = (searched || loading) && !showSuggestions;

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

        {/* ── Barra de búsqueda + dropdown ── */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchRow, showSuggestions && styles.searchRowOpen]}>
            <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.5)" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Busca una ciudad..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              onSubmitEditing={searchCity}
              onFocus={handleFocus}
              onBlur={handleBlur}
              returnKeyType="search"
              selectionColor="#90cdfd"
              autoCorrect={false}
            />
            {loadingSug && (
              <ActivityIndicator size="small" color="#90cdfd" style={{ marginRight: 4 }} />
            )}
            {query.length > 0 && !loadingSug && (
              <Pressable onPress={clearSearch} style={styles.clearBtn}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
              </Pressable>
            )}
          </View>

          {/* ── Dropdown de autocompletado ── */}
          {showSuggestions && (
            <View style={styles.dropdown}>
              {suggestions.map((city, i) => {
                const added  = hasCity(city.id);
                const isLast = i === suggestions.length - 1;
                return (
                  <Pressable
                    key={city.id}
                    style={({ pressed }) => [
                      styles.suggestionRow,
                      !isLast && styles.suggestionDivider,
                      pressed && { backgroundColor: 'rgba(255,255,255,0.08)' },
                    ]}
                    onPress={() => handleSelectCity(city)}
                  >
                    <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.55)" />
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionName}>{city.name}</Text>
                      <Text style={styles.suggestionCountry}>{city.country}</Text>
                    </View>
                    {added && (
                      <Ionicons name="checkmark" size={16} color="#90cdfd" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Resultados completos (tras submit) ── */}
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
                <Ionicons name="earth-outline" size={40} color="rgba(255,255,255,0.35)" />
                <Text style={styles.stateText}>No se encontraron ciudades para "{query}"</Text>
              </View>
            ) : (
              <View style={styles.resultsList}>
                {results.map((city) => {
                  const added = hasCity(city.id);
                  return (
                    <Pressable
                      key={city.id}
                      style={({ pressed }) => [
                        styles.resultRow,
                        added && styles.resultRowAdded,
                        pressed && { opacity: 0.75 },
                      ]}
                      onPress={() => handleSelectCity(city)}
                    >
                      <Ionicons name="location-outline" size={18} color="rgba(255,255,255,0.55)" />
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName}>{city.name}</Text>
                        <Text style={styles.resultCountry}>{city.country}</Text>
                      </View>
                      <Ionicons
                        name={added ? 'checkmark' : 'chevron-forward'}
                        size={18}
                        color={added ? '#90cdfd' : 'rgba(255,255,255,0.3)'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Ciudades guardadas ── */}
        {!showResults && !showSuggestions && (
          <View style={styles.section}>
            <Text style={styles.sectionLabelCaps}>MIS CIUDADES</Text>
            <Text style={styles.sectionTitle}>Ciudades guardadas</Text>

            {savedCities.length === 0 ? (
              <View style={styles.stateBox}>
                <Ionicons name="earth-outline" size={40} color="rgba(255,255,255,0.35)" />
                <Text style={styles.stateText}>
                  Aún no tienes ciudades guardadas.{'\n'}Busca una ciudad para agregarla.
                </Text>
              </View>
            ) : (
              <View style={styles.savedList}>
                {savedCities.map((city) => (
                  <View key={city.id} style={styles.savedRow}>
                    <Pressable
                      style={({ pressed }) => [styles.savedInfo, pressed && { opacity: 0.75 }]}
                      onPress={() => handleSelectCity(city)}
                    >
                      <Ionicons name="location-outline" size={18} color="rgba(255,255,255,0.55)" />
                      <View style={styles.savedText}>
                        <Text style={styles.savedName}>{city.name}</Text>
                        <Text style={styles.savedCountry}>{city.country}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => removeCity(city.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={14} color="#ffb4ab" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
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
  searchWrapper: {
    zIndex: 10,
  },
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
  searchRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'transparent',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  clearBtn: { padding: 4 },

  /* ── Dropdown autocompletado ── */
  dropdown: {
    backgroundColor: '#1c2026',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GLASS_BORDER,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
  },
  suggestionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  suggestionText: { flex: 1 },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  suggestionCountry: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
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
  resultRowAdded: {
    borderColor: 'rgba(144,205,253,0.4)',
    backgroundColor: 'rgba(144,205,253,0.08)',
  },

  /* ── Section ── */
  section: { gap: 14 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* ── Saved cities ── */
  savedList: { gap: 10 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingRight: 12,
    overflow: 'hidden',
  },
  savedInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  savedText: { flex: 1 },
  savedName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  savedCountry: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  removeBtn: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,100,100,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.3)',
  },
});
