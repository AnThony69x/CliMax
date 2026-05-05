import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const GHOST_ITEMS = Array.from({ length: 6 });

export default function CommunityScreen() {
  const router = useRouter();
  const feedOffset = useRef(new Animated.Value(0)).current;

  const goToLogin = () => {
    router.push('/login?force=1');
  };

  useEffect(() => {
    feedOffset.setValue(0);
    const feedLoop = Animated.loop(
      Animated.timing(feedOffset, {
        toValue: -612,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    feedLoop.start();

    return () => {
      feedLoop.stop();
    };
  }, [feedOffset]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Comunidad</Text>
      <Text style={styles.subtitle}>Espacio de publicaciones y reportes ciudadanos.</Text>

      <View style={styles.skeletonWrap}>
        <Animated.View style={{ transform: [{ translateY: feedOffset }] }}>
          {[...GHOST_ITEMS, ...GHOST_ITEMS].map((_, index) => (
            <View key={index} style={styles.skeletonCard}>
              <View style={styles.thumb} />
              <View style={styles.body}>
                <View style={styles.lineLg} />
                <View style={styles.lineMd} />
                <View style={styles.lineSm} />
              </View>
            </View>
          ))}
        </Animated.View>

        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Inicia sesion para utilizar esta seccion</Text>
          <Pressable
            style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
            onPress={goToLogin}
          >
            <Text style={styles.loginBtnText}>Ir a login</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0c0e11',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 16,
  },
  skeletonWrap: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(9,12,18,0.95)',
    padding: 14,
    gap: 10,
    overflow: 'hidden',
    minHeight: 650,
  },
  skeletonCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    minHeight: 92,
    marginBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 7,
  },
  lineLg: {
    width: '86%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  lineMd: {
    width: '72%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lineSm: {
    width: '54%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: '#2A7A4B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
