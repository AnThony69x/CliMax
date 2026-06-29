import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../core/api/weatherApi';
import { useCities } from '../../core/cities/CitiesContext';
import type { City } from '../../types';
import { premiumColors, premiumRadii, premiumShadow } from '../../theme/premium';

const GLASS_BG     = premiumColors.glass;
const GLASS_BORDER = premiumColors.glassBorder;
const SURFACE_DEEP = premiumColors.surface;
const ACCENT       = premiumColors.accent;
const ACCENT_SOFT  = premiumColors.accentSoft;
const DEBOUNCE_MS  = 350;
const SWIPE_HINT_KEY = '@climax/search/swipe-hint-shown';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { addCity, hasCity, savedCities, removeCity } = useCities();

  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<City[]>([]);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [loadingSug, setLoadingSug]   = useState(false);
  const [focused, setFocused]         = useState(false);
  const [justAdded, setJustAdded]     = useState<City | null>(null);
  const [swipeHintCity, setSwipeHintCity] = useState<string | null>(null);

  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintAnim          = useRef(new RNAnimated.Value(0)).current;

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
        const res = await fetch(
          `${API_URL}/search?city=${encodeURIComponent(trimmed)}&count=6`
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
      const res = await fetch(
        `${API_URL}/search?city=${encodeURIComponent(query.trim())}`
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

  const handleSelectCity = async (city: City) => {
    const wasNew = !hasCity(city.id);
    addCity(city);

    setQuery('');
    setResults([]);
    setSuggestions([]);
    setSearched(false);
    setFocused(false);

    if (wasNew) {
      setJustAdded(city);
      if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
      justAddedTimerRef.current = setTimeout(() => setJustAdded(null), 2200);

      try {
        const shown = await AsyncStorage.getItem(SWIPE_HINT_KEY);
        if (!shown) {
          setSwipeHintCity(city.id);
          await AsyncStorage.setItem(SWIPE_HINT_KEY, '1');
          if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
          hintTimerRef.current = setTimeout(() => setSwipeHintCity(null), 4500);
        }
      } catch {}
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setSearched(false);
  };

  const handleRemoveCity = (id: string) => {
    removeCity(id);
  };

  /** Pulso de la flecha animada para guiar el gesto de swipe la primera vez. */
  useEffect(() => {
    if (!swipeHintCity) {
      hintAnim.stopAnimation();
      hintAnim.setValue(0);
      return;
    }
    hintAnim.setValue(0);
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(hintAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(hintAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [swipeHintCity, hintAnim]);

  useEffect(
    () => () => {
      if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    [],
  );

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
                <Text style={styles.stateText}>No se encontraron ciudades para {query}</Text>
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

            {justAdded && (
              <View style={styles.justAddedBanner}>
                <View style={styles.justAddedIconWrap}>
                  <Ionicons name="checkmark" size={16} color="#0c1222" />
                </View>
                <Text style={styles.justAddedText} numberOfLines={1}>
                  <Text style={styles.justAddedName}>{justAdded.name}</Text>
                  {' guardada en tus ciudades'}
                </Text>
              </View>
            )}

            {savedCities.length === 0 ? (
              <View style={styles.stateBox}>
                <Ionicons name="earth-outline" size={40} color="rgba(255,255,255,0.35)" />
                <Text style={styles.stateText}>
                  Aún no tienes ciudades guardadas.{'\n'}Busca una ciudad para agregarla.
                </Text>
              </View>
            ) : (
              <View style={styles.savedList}>
                {savedCities.map((city) => {
                  const showHint = swipeHintCity === city.id;
                  return (
                    <View key={city.id} style={styles.savedRowWrapper}>
                      <ReanimatedSwipeable
                        friction={1.6}
                        rightThreshold={48}
                        overshootRight={false}
                        renderRightActions={(_progress, translation, methods) => (
                          <SwipeDeleteAction
                            translation={translation}
                            onPress={() => {
                              methods.close();
                              handleRemoveCity(city.id);
                            }}
                          />
                        )}
                        containerStyle={styles.swipeableContainer}
                      >
                        <Pressable
                          style={({ pressed }) => [
                            styles.savedRow,
                            pressed && { opacity: 0.85 },
                          ]}
                          onPress={() => handleSelectCity(city)}
                        >
                          <View style={styles.resultIconWrap}>
                            <Ionicons name="heart" size={16} color={ACCENT} />
                          </View>
                          <View style={styles.savedText}>
                            <Text style={styles.savedName}>{city.name}</Text>
                            <Text style={styles.savedCountry}>{city.country}</Text>
                          </View>
                          <Ionicons
                            name="chevron-back"
                            size={14}
                            color="rgba(255,255,255,0.25)"
                            style={{ marginRight: 4 }}
                          />
                        </Pressable>
                      </ReanimatedSwipeable>
                      {showHint && (
                        <RNAnimated.View
                          style={[
                            styles.swipeHint,
                            {
                              opacity: hintAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.55, 1],
                              }),
                              transform: [
                                {
                                  translateX: hintAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, -14],
                                  }),
                                },
                              ],
                              pointerEvents: 'none',
                            },
                          ]}
                        >
                          <Ionicons name="arrow-back" size={12} color="#f8fafc" />
                          <Text style={styles.swipeHintText}>
                            Desliza para eliminar
                          </Text>
                        </RNAnimated.View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Acción derecha del swipe: trash con escala animada según la distancia arrastrada. */
function SwipeDeleteAction({
  translation,
  onPress,
}: {
  translation: SharedValue<number>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const drag = Math.min(0, translation.value);
    const scale = Math.max(0.6, Math.min(1, -drag / 80));
    return {
      transform: [{ scale }],
      opacity: scale,
    };
  });

  return (
    <View style={styles.deleteActionWrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.deleteActionBtn,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Animated.View style={[styles.deleteActionIcon, animatedStyle]}>
          <Ionicons name="trash" size={20} color="#fff" />
        </Animated.View>
      </Pressable>
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
    backgroundColor: premiumColors.auroraAqua,
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -70,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraTeal,
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
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    ...premiumShadow('medium'),
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
  savedRowWrapper: {
    position: 'relative',
  },
  swipeableContainer: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
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

  /* ── Banner de "ciudad guardada" ── */
  justAddedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(56,189,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  justAddedIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  justAddedText: {
    flex: 1,
    fontSize: 13,
    color: '#e2e8f0',
  },
  justAddedName: {
    fontWeight: '700',
    color: '#f8fafc',
  },

  /* ── Tooltip "desliza para eliminar" ── */
  swipeHint: {
    position: 'absolute',
    top: '50%',
    right: 14,
    transform: [{ translateY: -12 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  swipeHintText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },

  /* ── Acción de borrar (al hacer swipe) ── */
  deleteActionWrap: {
    width: 84,
    paddingLeft: 8,
    justifyContent: 'center',
  },
  deleteActionBtn: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteActionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
