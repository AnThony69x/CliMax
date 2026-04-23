# CliMax Backend API

API REST desarrollada con Laravel para la aplicacion CliMax.

## Stack

- Laravel 12
- PHP 8.2
- PostgreSQL (Supabase)
- Guzzle HTTP
- Docker

## Autenticacion

Este backend valida el access token emitido por Supabase Auth. El cliente mobile inicia sesion con Supabase y envia el token en el header `Authorization: Bearer <token>`.

Credenciales requeridas en `backend/.env`:

- `SUPABASE_URL`: URL de tu proyecto, por ejemplo `https://tu-proyecto.supabase.co`
- `SUPABASE_ANON_KEY`: clave publica usada por el backend para validar el usuario contra Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: opcional para tareas administrativas futuras; no se expone al cliente

Configuracion de base de datos recomendada para este backend:

- `DB_CONNECTION=pgsql`
- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
- `DB_SSLMODE=require` para conexiones seguras a Supabase Postgres

## Arquitectura

El proyecto sigue una estructura orientada a Clean Architecture:

```text
app/
├── Domain/
├── Application/
├── Infrastructure/
├── Interfaces/
```

## Instalacion

1. Clonar proyecto y entrar a backend

```bash
git clone <repo>
cd backend
```

2. Instalar dependencias

```bash
composer install
```

3. Configurar entorno

```bash
cp .env.example .env
php artisan key:generate
```

4. Configurar base de datos

Editar `.env` con credenciales de Supabase.

5. Ejecutar migraciones

```bash
php artisan migrate
```

6. Ejecutar servidor

```bash
php artisan serve
```

Servidor disponible en http://localhost:8000

## Docker

```bash
docker build -t climax-backend .
docker run -p 8000:8000 climax-backend
```

## Endpoints Base

### Auth

- `GET /api/me` protegido por `supabase.auth`
- `GET /api/profile` protegido por `supabase.auth`
- `PATCH /api/profile` protegido por `supabase.auth`

### Clima

- `GET /api/clima`

## Como usar las rutas

### 1. Obtener access token en Supabase

El backend no hace login de usuario final. Primero debes autenticarte en Supabase Auth y usar el `access_token` en cada request protegida.

Ejemplo para obtener token con email y password:

```bash
curl -X POST "https://<tu-project-ref>.supabase.co/auth/v1/token?grant_type=password" \
	-H "apikey: <SUPABASE_ANON_KEY>" \
	-H "Content-Type: application/json" \
	-d '{"email":"tu-email@dominio.com","password":"tu-password"}'
```

De la respuesta, guarda el valor de `access_token`.

### 2. Probar identidad autenticada

```bash
curl -X GET "http://localhost:8000/api/me" \
	-H "Authorization: Bearer <access_token>"
```

Respuesta esperada:

- `200` con datos del usuario autenticado de Supabase
- `401` si el token falta o es invalido

### 3. Obtener perfil del usuario

```bash
curl -X GET "http://localhost:8000/api/profile" \
	-H "Authorization: Bearer <access_token>"
```

Notas:

- Si el perfil no existe, se crea automaticamente con el `id` del usuario autenticado.
- El `id` del perfil es el mismo UUID del usuario en Supabase Auth.

### 4. Actualizar perfil

```bash
curl -X PATCH "http://localhost:8000/api/profile" \
	-H "Authorization: Bearer <access_token>" \
	-H "Content-Type: application/json" \
	-d '{"name":"Tu Nombre","avatar_url":"https://example.com/avatar.png"}'
```

Validaciones:

- `name`: string opcional, maximo 120 caracteres
- `avatar_url`: URL opcional valida

Errores comunes:

- `401`: token ausente, invalido o expirado
- `422`: payload invalido

## Estructura

```text
backend/
├── app/
├── bootstrap/
├── config/
├── database/
├── public/
├── routes/
├── storage/
├── vendor/
├── .env
├── .env.example
├── Dockerfile
├── README.md
├── artisan
└── composer.json
```

## Testing

Las pruebas fueron removidas temporalmente durante la fase de limpieza API-only.

## Licencia

MIT
