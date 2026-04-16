# CliMax Backend API

API REST desarrollada con Laravel para la aplicacion CliMax.

## Stack

- Laravel 12
- PHP 8.2
- PostgreSQL (Supabase)
- Guzzle HTTP
- Docker

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

- `POST /api/auth/login`
- `POST /api/auth/register`

### Clima

- `GET /api/clima`

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
