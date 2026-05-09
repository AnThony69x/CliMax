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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCities } from '../../core/cities/CitiesContext';
import type { City } from '../../types';

const GLASS_BG     = 'rgba(255,255,255,0.08)';
const GLASS_BORDER = 'rgba(255,255,255,0.14)';
const SURFACE_DEEP = '#0c1222';
const ACCENT       = '#38bdf8';
const ACCENT_SOFT  = '#7dd3fc';
const DEBOUNCE_MS  = 350;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Encabezado ── */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="compass-outline" size={22} color={ACCENT} />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.labelCaps}>Explorar</Text>
            <Text style={styles.title}>Buscar ciudad</Text>
            <Text style={styles.headerSubtitle}>
              Añade ciudades al inicio para ver su clima al deslizar.
            </Text>
          </View>
        </View>

        {/* ── Barra de búsqueda + dropdown ── */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchRow, showSuggestions && styles.searchRowOpen]}>
            <View style={styles.searchIconBadge}>
              <Ionicons name="search" size={18} color={ACCENT_SOFT} />
            </View>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Busca una ciudad..."
              placeholderTextColor="rgba(148,163,184,0.75)"
              onSubmitEditing={searchCity}
              onFocus={handleFocus}
              onBlur={handleBlur}
              returnKeyType="search"
              selectionColor={ACCENT_SOFT}
              autoCorrect={false}
            />
            {loadingSug && (
              <ActivityIndicator size="small" color={ACCENT} style={{ marginRight: 4 }} />
            )}
            {query.length > 0 && !loadingSug && (
              <Pressable onPress={clearSearch} style={styles.clearBtn}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
              </Pressable>
            )}
          </View>

          {/* ── Dropdown de autocompletado ── */}
          {showSuggestions && (
            <View style={[styles.dropdown, showSuggestions && styles.dropdownAttached]}>
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
                    <View style={styles.suggestionIconWrap}>
                      <Ionicons name="location-outline" size={17} color={ACCENT_SOFT} />
                    </View>
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionName}>{city.name}</Text>
                      <Text style={styles.suggestionCountry}>{city.country}</Text>
                    </View>
                    {added && (
                      <View style={styles.savedCheckWrap}>
                        <Ionicons name="checkmark" size={15} color={ACCENT} />
                      </View>
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
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="list-outline" size={18} color={ACCENT} />
              <Text style={styles.sectionLabelCaps}>Resultados</Text>
            </View>

            {loading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator color={ACCENT} />
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
                      <View style={styles.resultIconWrap}>
                        <Ionicons name="pin-outline" size={18} color={ACCENT_SOFT} />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName}>{city.name}</Text>
                        <Text style={styles.resultCountry}>{city.country}</Text>
                      </View>
                      <Ionicons
                        name={added ? 'checkmark' : 'chevron-forward'}
                        size={18}
                        color={added ? ACCENT : 'rgba(255,255,255,0.28)'}
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
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="heart-outline" size={18} color={ACCENT} />
              <Text style={styles.sectionLabelCaps}>Mis ciudades</Text>
            </View>
            <Text style={styles.sectionTitle}>Guardadas en inicio</Text>

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
                      <View style={styles.resultIconWrap}>
                        <Ionicons name="heart" size={16} color={ACCENT} />
                      </View>
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
    backgroundColor: SURFACE_DEEP,
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -90,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(2,87,129,0.26)',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -70,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.08)',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 22,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: { flex: 1, gap: 4, minWidth: 0 },
  labelCaps: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: 'rgba(148,163,184,0.95)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.9)',
    lineHeight: 19,
    marginTop: 2,
  },

  /* ── Search bar ── */
  searchWrapper: {
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  searchRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'rgba(56,189,248,0.12)',
  },
  searchIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#f8fafc',
    minWidth: 0,
  },
  clearBtn: { padding: 4 },

  /* ── Dropdown autocompletado ── */
  dropdown: {
    backgroundColor: 'rgba(15,23,42,0.96)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(56,189,248,0.18)',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
  },
  dropdownAttached: {
    borderTopColor: 'transparent',
  },
  suggestionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    color: '#f8fafc',
  },
  suggestionCountry: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.9)',
    marginTop: 1,
  },

  /* ── Results ── */
  resultsSection: { gap: 12 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabelCaps: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#f1f5f9',
    textTransform: 'none',
  },
  stateBox: {
    backgroundColor: GLASS_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 3,
  },
  stateText: {
    fontSize: 14,
    color: 'rgba(148,163,184,0.95)',
    textAlign: 'center',
    lineHeight: 21,
  },
  resultsList: { gap: 10 },
  resultIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  resultInfo: { flex: 1 },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  resultCountry: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.92)',
    marginTop: 2,
  },
  resultRowAdded: {
    borderColor: 'rgba(56,189,248,0.45)',
    backgroundColor: 'rgba(56,189,248,0.08)',
  },

  /* ── Section ── */
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e8f0',
    marginTop: 2,
  },

  /* ── Saved cities ── */
  savedList: { gap: 10 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingRight: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
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
    color: '#f8fafc',
  },
  savedCountry: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.88)',
    marginTop: 2,
  },
  removeBtn: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.35)',
  },
});
