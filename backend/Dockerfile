FROM php:8.2-cli

WORKDIR /app

# Dependencias del sistema para Laravel y PostgreSQL
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Extensiones necesarias para PostgreSQL
RUN docker-php-ext-install pdo pdo_pgsql

# Composer desde la imagen oficial
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Copiar proyecto e instalar dependencias
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/cache storage/framework/sessions storage/framework/views
RUN composer install --no-interaction --prefer-dist --optimize-autoloader

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
