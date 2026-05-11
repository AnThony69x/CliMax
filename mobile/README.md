# CliMax Mobile

Aplicacion movil de alertas climaticas en tiempo real.

## Stack

- React Native con Expo
- Expo Router
- TypeScript
- Supabase (autenticacion y datos)
- API backend Laravel

## Requisitos

- Node.js 18 o superior
- npm 9 o superior
- Expo Go en dispositivo o emulador

## Instalacion

1. Instalar dependencias:

```bash
npm install
```

2. Configurar variables de entorno:

```bash
cp .env.example .env
```

3. Editar .env con credenciales reales.

## Ejecucion

```bash
npm run start
```

Para forzar el puerto 9000:

```bash
npm run start -- --port 9000
```

Comandos utiles:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## Estructura

src/
- core/
   - api/
   - config/
   - utils/
- features/
   - auth/
   - weather/
   - alerts/
   - profile/
   - settings/
- navigation/
- store/
- components/
- theme/

assets/
- iconos/
- imagenes/
- fuentes/

## Backend

La app consume el backend Laravel en la URL definida por EXPO_PUBLIC_API_URL.

Para pruebas en celular fisico, usa la IP local de tu equipo en .env.

## Docker

Este proyecto ya incluye Docker para mobile.

Levantar solo mobile desde la raiz del repo:

```bash
docker compose up --build mobile
```

Levantar todo (backend + mobile):

```bash
docker compose up --build
```

Mobile queda publicado en http://localhost:9000

## Push Notifications

La app integra `expo-notifications` con Expo Push Service. Para habilitarlas en tu device de desarrollo:

1. Inicializa EAS dentro del proyecto mobile (la primera vez):

```bash
cd mobile
eas init
```

Esto rellena `extra.eas.projectId` en `app.json`. Sin ese projectId el cliente no puede pedir un `ExpoPushToken`.

2. Build de desarrollo nativo (Expo Go **no** soporta push remoto en SDK 53+):

```bash
eas build --profile development --platform android
```

Instala el .apk resultante en tu dispositivo y abrelo en lugar de Expo Go.

3. Ya en la app, al iniciar sesion el cliente solicita permisos, obtiene el `ExpoPushToken` y lo registra contra el backend (`POST /api/push-tokens`). Al cerrar sesion lo elimina (`DELETE /api/push-tokens/{token}`).

> En Expo Go la integracion queda como no-op silencioso (`isExpoGo()` corta la inicializacion) para no romper el bundler. Necesitas un build nativo para probar push remoto.

## Estado

- Base de Expo Router limpia
- Arquitectura por features creada
- Archivos externos de entorno y control listos
- Push notifications con Expo + backend Laravel listas (Fase 3)

## Licencia

MIT
