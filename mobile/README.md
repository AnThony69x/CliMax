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

## Estado

- Base de Expo Router limpia
- Arquitectura por features creada
- Archivos externos de entorno y control listos

## Licencia

MIT
