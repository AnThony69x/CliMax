# CliMax

Aplicacion movil de alertas climaticas en tiempo real.

---

## Descripcion

CliMax es una aplicacion movil que proporciona alertas climaticas en tiempo real, permitiendo a los usuarios consultar condiciones meteorologicas en su ubicacion actual o en cualquier ciudad.

El sistema esta disenado para evolucionar hacia un asistente climatico inteligente, capaz de anticipar eventos y notificar al usuario de manera oportuna.

---

## Objetivo

- Mostrar clima en tiempo real
- Detectar eventos climaticos
- Enviar notificaciones inteligentes
- Mejorar la toma de decisiones del usuario

---

## Estructura del Proyecto

```text
CliMax/
├── backend/
├── mobile/
├── database/
├── docker/
├── docs/
├── .gitignore
├── README.md
├── LICENSE
├── docker-compose.yml
└── .env.example
```

---

## Pantallas de la Aplicacion

1. LoginScreen
2. RegisterScreen
3. HomeScreen
4. SearchScreen
5. AlertsScreen
6. AlertDetailScreen
7. ProfileScreen
8. SettingsScreen (opcional)

---

## Modulos

### Autenticacion

- Login y registro con Supabase
- Manejo de sesion

### Clima

- Temperatura
- Estado del clima
- Datos en tiempo real

### Busqueda

- Consulta por ciudad

### Alertas

- CRUD completo
- Marcado como leidas

### Notificaciones

- Push en tiempo real

---

## Base de Datos

| Tabla | Descripcion |
|------|-------------|
| profiles | Datos del usuario |
| ubicaciones | Ubicacion |
| alertas | Alertas |
| eventos_climaticos | Eventos |
| notificaciones | Registro |

---

## Flujo

Usuario inicia sesion

↓

Obtiene ubicacion

↓

Consulta backend

↓

Backend consume API de clima

↓

Se generan alertas

↓

Se envian notificaciones

---

## Instalacion

### Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan serve
```

### Frontend

```bash
cd mobile
npm install
npx expo start
```

### Docker

```bash
docker-compose up -d
```

---

## Supabase

1. Crear proyecto
2. Obtener URL y KEY
3. Crear tablas
4. Configurar variables

---

## Documentacion

- backend/README.md
- mobile/README.md
- database/README.md

---

## Equipo

- Backend Developer
- Frontend Developer
- DevOps
- QA

---

## Licencia

MIT License
