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

## Push Notifications (Expo) — setup local

### 1. Esquema en Supabase

Las tablas `push_tokens` y `push_notifications_log` se crean con migraciones Laravel clasicas:

```bash
php artisan migrate
```

Esto aplica las migraciones `2026_05_10_180000_create_push_tokens_table.php` y `2026_05_10_181000_create_push_notifications_log_table.php`, que incluyen FK a `auth.users` (tolerante a permisos), enable RLS y crean las policies. Si tu usuario de DB no tiene privilegio sobre `auth.users` la migracion deja un `RAISE NOTICE` y sigue.

### 2. Variables `.env`

```env
EXPO_ACCESS_TOKEN=             # opcional pero recomendado en prod
PUSH_QUIET_HOURS_START=22      # no se manda push entre 22:00 y 07:00 hora local del usuario
PUSH_QUIET_HOURS_END=7         # excepcion: severe (alerts) y storm (weather) ignoran la ventana
PUSH_TIMEZONE=America/Lima     # timezone usado para evaluar quiet hours
```

### 3. Levantar el scheduler en local

Para que los push se disparen automaticamente, **abre una terminal aparte** (con el server `php artisan serve` en otra) y deja corriendo:

```bash
php artisan schedule:work
```

Esto evalua todos los cron registrados en `App\Console\Kernel`:

| Comando | Frecuencia |
|---|---|
| `alerts:process-intelligent` | cada 30 min |
| `weather:monitor` | cada 15 min |
| `push:check-receipts` | cada 30 min |
| `push:cleanup-tokens` | semanal, lunes 03:00 |

Verifica con `php artisan schedule:list` que no haya duplicados.

### 4. Comandos manuales utiles

```bash
# Procesar alertas Groq y disparar push high/severe (puedes filtrar por usuario)
php artisan alerts:process-intelligent --user-id=<uuid>

# Detectar cambios bruscos del clima y disparar push proactivos
php artisan weather:monitor --user-id=<uuid>

# Consultar receipts asincronos de Expo y purgar tokens invalidos
php artisan push:check-receipts

# Borrar tokens sin actividad reciente
php artisan push:cleanup-tokens --days=30
```

### 5. Test manual con tinker

```bash
php artisan tinker
```

```php
app(App\Services\ExpoPushService::class)->sendToUsers(
    ['<user-uuid>'],
    'Hola desde tinker',
    'Body de prueba',
    ['debug' => true],
    'default',
    bypassQuietHours: true,
    logMeta: ['kind' => 'manual']
);
```

Despues revisa la fila en `push_notifications_log` con `status='sent'` y `ticket_ids` lleno.

## Testing

Las pruebas fueron removidas temporalmente durante la fase de limpieza API-only.

## Licencia

MIT
