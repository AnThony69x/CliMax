import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../core/api/weatherApi';
import { useCities } from '../../core/cities/CitiesContext';
import { fetchWeatherForCoords } from '../../core/weather/weatherDataCache';
import type { City } from '../../types';
import { premiumColors, premiumRadii, premiumShadow } from '../../theme/premium';
import { useWeatherScene } from '../../core/weather/WeatherSceneContext';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';
import { useAccountPreferences } from '../../core/preferences/accountPreferences';
import { getWeatherScene, WEATHER_SCENES } from '../../theme/weatherScenes';
import { weatherIconInfo } from '../../theme/weatherIcons';

const SURFACE_DEEP = premiumColors.surface;
const ACCENT       = premiumColors.accent;
const DEBOUNCE_MS  = 350;
const SWIPE_HINT_KEY = '@climax/search/swipe-hint-shown';
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const SEARCH_SURFACE = '#F8FAFC';
const SEARCH_BORDER = '#E2E8F0';
const SEARCH_INK = '#111827';
const SEARCH_MUTED = '#64748B';
const SEARCH_ICON_GRADIENT = ['#64748B', '#334155'] as const;

type CityWeather = {
  temp: number;
  code: number;
  tempMax: number | null;
  tempMin: number | null;
} | null;

async function fetchCityWeather(city: City): Promise<CityWeather> {
  try {
    const data = await fetchWeatherForCoords<{
      current?: { temperature_2m: number; weather_code: number };
      daily?: Record<string, number[] | undefined>;
    }>({ latitude: city.lat, longitude: city.lon });
    const current = data?.current;
    if (!current) return null;
    const daily = data?.daily as Record<string, number[] | undefined> | undefined;
    return {
      temp: current.temperature_2m,
      code: current.weather_code,
      tempMax: typeof daily?.temperature_2m_max?.[0] === 'number' ? daily.temperature_2m_max[0] : null,
      tempMin: typeof daily?.temperature_2m_min?.[0] === 'number' ? daily.temperature_2m_min[0] : null,
    };
  } catch {
    return null;
  }
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { addCity, hasCity, savedCities, removeCity } = useCities();
  const { code: weatherCode, isNight, scene } = useWeatherScene();
  const preferences = useAccountPreferences();
  const ACCENT = scene.accent;
  const headerInk = scene.ink === 'dark' ? '#1b2027' : '#fdf9f3';
  const headerMuted = scene.ink === 'dark' ? 'rgba(27,32,39,0.75)' : 'rgba(253,249,243,0.78)';

  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<City[]>([]);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [loadingSug, setLoadingSug]   = useState(false);
  const [focused, setFocused]         = useState(false);
  const [justAdded, setJustAdded]     = useState<City | null>(null);
  const [swipeHintCity, setSwipeHintCity] = useState<string | null>(null);
  const [cityWeather, setCityWeather] = useState<Record<string, CityWeather>>({});

  const weatherFetchedRef = useRef<Set<string>>(new Set());

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

  /* ── Clima por ciudad para las tarjetas (guardadas + resultados) ── */
  useEffect(() => {
    const cities = [...savedCities, ...results];
    const pending = cities.filter((c) => !weatherFetchedRef.current.has(c.id));
    if (pending.length === 0) return;
    pending.forEach((c) => weatherFetchedRef.current.add(c.id));
    pending.forEach(async (city) => {
      const weather = await fetchCityWeather(city);
      setCityWeather((prev) => ({ ...prev, [city.id]: weather }));
    });
  }, [savedCities, results]);

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
      <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />

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
          <LinearGradient
            colors={[ACCENT, scene.accentSoft]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.headerIconWrap}
          >
            <Ionicons name="compass-outline" size={22} color="#fff" />
          </LinearGradient>
          <View style={styles.headerTextCol}>
            <Text style={[styles.labelCaps, { color: ACCENT }]}>Explorar</Text>
            <Text style={[styles.title, { color: headerInk }]}>Buscar ciudad</Text>
            <Text style={[styles.headerSubtitle, { color: headerMuted }]}>
              Añade ciudades al inicio para ver su clima al deslizar.
            </Text>
          </View>
        </View>

        {/* ── Barra de búsqueda + dropdown ── */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchRow, showSuggestions && styles.searchRowOpen]}>
            <LinearGradient
              colors={SEARCH_ICON_GRADIENT}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchIconBadge}
            >
              <Ionicons name="search" size={17} color="#fff" />
            </LinearGradient>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Busca una ciudad..."
              placeholderTextColor={SEARCH_MUTED}
              onSubmitEditing={searchCity}
              onFocus={handleFocus}
              onBlur={handleBlur}
              returnKeyType="search"
              selectionColor={ACCENT}
              autoCorrect={false}
              underlineColorAndroid="transparent"
              textAlignVertical="center"
            />
            {loadingSug && (
              <ActivityIndicator size="small" color={ACCENT} style={{ marginRight: 4 }} />
            )}
            {query.length > 0 && !loadingSug && (
              <Pressable onPress={clearSearch} style={styles.clearBtn}>
                <Ionicons name="close" size={16} color={SEARCH_MUTED} />
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
                      pressed && { backgroundColor: 'rgba(27,32,39,0.05)' },
                    ]}
                    onPress={() => handleSelectCity(city)}
                  >
                    <View style={styles.suggestionIconWrap}>
                      <Ionicons name="location-outline" size={17} color={ACCENT} />
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
                <Ionicons name="earth-outline" size={40} color="rgba(27,32,39,0.3)" />
                <Text style={styles.stateText}>No se encontraron ciudades para {query}</Text>
              </View>
            ) : (
              <View style={styles.resultsList}>
                {results.map((city) => (
                  <CityWeatherCard
                    key={city.id}
                    city={city}
                    weather={cityWeather[city.id]}
                    added={hasCity(city.id)}
                    onPress={() => handleSelectCity(city)}
                  />
                ))}
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
                <View style={styles.justAddedDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.justAddedLabel}>Añadida a favoritos</Text>
                  <Text style={styles.justAddedText} numberOfLines={1}>
                    <Text style={styles.justAddedName}>{justAdded.name}</Text>
                    {`, ${justAdded.country}`}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
              </View>
            )}

            {savedCities.length === 0 ? (
              <View style={styles.stateBox}>
                <Ionicons name="earth-outline" size={40} color="rgba(27,32,39,0.3)" />
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
                        <CityWeatherCard
                          city={city}
                          weather={cityWeather[city.id]}
                          added
                          onPress={() => handleSelectCity(city)}
                        />
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

/** Tarjeta de ciudad con gradiente según su condición climática (clima en vivo). */
function CityWeatherCard({
  city,
  weather,
  onPress,
  added,
}: {
  city: City;
  weather: CityWeather | undefined;
  onPress: () => void;
  added?: boolean;
}) {
  const sceneKey = getWeatherScene(weather?.code, false);
  const tokens = WEATHER_SCENES[sceneKey];
  const info = weatherIconInfo(weather?.code ?? undefined);
  const isLight = tokens.ink === 'light';
  const textColor = isLight ? '#fff' : premiumColors.ink;
  const subColor = isLight ? 'rgba(255,255,255,0.78)' : 'rgba(27,32,39,0.6)';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
      <LinearGradient
        colors={tokens.sky}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.weatherCard}
      >
        {added && (
          <View style={[styles.weatherCardBadge, isLight && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Ionicons name="heart" size={12} color={textColor} />
          </View>
        )}
        <View style={styles.weatherCardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.weatherCardName, { color: textColor }]} numberOfLines={1}>
              {city.name}
            </Text>
            <View style={styles.weatherCardSubRow}>
              <Ionicons name="location-outline" size={11} color={subColor} />
              <Text style={[styles.weatherCardSub, { color: subColor }]} numberOfLines={1}>
                {city.country}
              </Text>
            </View>
          </View>
          {weather === undefined ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : weather ? (
            <Text style={[styles.weatherCardTemp, { color: textColor }]}>{Math.round(weather.temp)}°</Text>
          ) : (
            <MaterialCommunityIcons name="cloud-off-outline" size={22} color={subColor} />
          )}
        </View>
        <View style={styles.weatherCardBottom}>
          <Text style={[styles.weatherCardCondition, { color: subColor }]} numberOfLines={1}>
            {weather ? info.label : weather === null ? 'Sin datos' : 'Cargando...'}
          </Text>
          {weather?.tempMax != null && weather?.tempMin != null && (
            <Text style={[styles.weatherCardMinMax, { color: subColor }]}>
              Máx {Math.round(weather.tempMax)}°  Mín {Math.round(weather.tempMin)}°
            </Text>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
    overflow: 'hidden',
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
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    ...Platform.select<ViewStyle>({
      ios: { elevation: 3 },
      android: { elevation: 0 },
    }),
  },
  headerTextCol: { flex: 1, gap: 4, minWidth: 0 },
  labelCaps: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(148,163,184,0.95)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: premiumColors.ink,
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
    backgroundColor: SEARCH_SURFACE,
    borderWidth: 1,
    borderColor: SEARCH_BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    ...Platform.select<ViewStyle>({
      ios: { elevation: 4 },
      android: { elevation: 0 },
    }),
  },
  searchRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  searchIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: SEARCH_INK,
    minWidth: 0,
  },
  clearBtn: { padding: 4 },

  /* ── Dropdown autocompletado ── */
  dropdown: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: `${ACCENT}2e`,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  dropdownAttached: {
    borderTopColor: 'transparent',
  },
  suggestionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${ACCENT}1a`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: `${ACCENT}26`,
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
    borderBottomColor: 'rgba(27,32,39,0.08)',
  },
  suggestionText: { flex: 1 },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: premiumColors.ink,
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
    color: premiumColors.ink,
    textTransform: 'none',
  },
  stateBox: {
    backgroundColor: SEARCH_SURFACE,
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: SEARCH_BORDER,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    ...premiumShadow('medium'),
    ...Platform.select<ViewStyle>({
      android: { elevation: 0 },
    }),
  },
  stateText: {
    fontSize: 14,
    color: SEARCH_MUTED,
    textAlign: 'center',
    lineHeight: 21,
  },
  resultsList: { gap: 10 },

  /* ── Tarjeta de ciudad con clima (resultados + guardadas) ── */
  weatherCard: {
    borderRadius: 22,
    padding: 18,
    gap: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    ...Platform.select<ViewStyle>({
      ios: { elevation: 3 },
      android: { elevation: 0 },
    }),
  },
  weatherCardBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(27,32,39,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  weatherCardName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  weatherCardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  weatherCardSub: {
    fontSize: 12,
  },
  weatherCardTemp: {
    fontFamily: MONO_FONT,
    fontSize: 34,
    fontWeight: '600',
    lineHeight: 36,
  },
  weatherCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  weatherCardCondition: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  weatherCardMinMax: {
    fontFamily: MONO_FONT,
    fontSize: 11,
  },

  /* ── Section ── */
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: premiumColors.inkMuted,
    marginTop: 2,
  },

  /* ── Saved cities ── */
  savedList: { gap: 10 },
  savedRowWrapper: {
    position: 'relative',
  },
  swipeableContainer: {
    borderRadius: 22,
    overflow: 'hidden',
  },

  /* ── Banner de "ciudad guardada" (estilo alerta del mockup) ── */
  justAddedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${ACCENT}16`,
    borderWidth: 1,
    borderColor: `${ACCENT}40`,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  justAddedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  justAddedLabel: {
    fontFamily: MONO_FONT,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: ACCENT,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  justAddedText: {
    fontSize: 13.5,
    color: premiumColors.inkMuted,
  },
  justAddedName: {
    fontWeight: '700',
    color: premiumColors.ink,
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
    borderColor: `${ACCENT}73`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  swipeHintText: {
    color: '#fdf9f3',
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
    backgroundColor: premiumColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    ...Platform.select<ViewStyle>({
      ios: { elevation: 4 },
      android: { elevation: 0 },
    }),
  },
  deleteActionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
