# 📚 Glosario de Términos

Explicación de conceptos clave del sistema de alertas inteligentes.

---

## A

### Alert (Alerta)
Notificación enviada al usuario cuando se detecta un riesgo climático. Puede ser de nivel bajo, medio, alto o severo.

**Ejemplo**: "🔴 Tormenta severa detectada en Bogotá"

---

### API Key
Clave de autenticación para acceder a la API de Groq. Se obtiene en https://console.groq.com

**Formato**: `gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

### Accuracy (Precisión)
Porcentaje de alertas que fueron correctas según feedback del usuario.

**Fórmula**: (Alertas precisas / Total alertas) × 100

---

## C

### Command (Comando)
Tarea que se ejecuta en línea de comandos Laravel. En nuestro caso: `php artisan alerts:process-intelligent`

---

### Confidence (Confianza)
Nivel de seguridad que tiene el modelo sobre su análisis (0-100%).

**Ejemplo**: "Groq tiene 87% de confianza en este análisis"

---

### Context (Contexto)
Información combinada sobre usuario, clima, ubicación e historial que se envía a Groq para análisis.

Incluye:
- Temperatura actual
- Histórico 48h
- Hora del día
- Ubicaciones típicas
- Patrones históricos

---

## D

### Database (Base de Datos)
Sistema de almacenamiento donde se guardan todas las alertas, logs y datos de usuario.

En CliMax: **PostgreSQL en Supabase**

---

### Detection (Detección)
Proceso de identificar un patrón de riesgo analizando datos.

**Proceso**:
1. Lee histórico de 48h
2. Compara con promedio
3. Identifica anomalías
4. Genera alerta

---

## E

### Endpoint
Dirección HTTP de la API que retorna información específica.

**Ejemplo**: `GET /api/intelligent-alerts` → Retorna todas las alertas

---

### Extreme Event (Evento Extremo)
Condición climática inusual o peligrosa.

**Ejemplos**: Tormentas, granizo, nieve, vientos >40 km/h

---

## F

### Feedback (Retroalimentación)
Información del usuario sobre si una alerta fue precisa o falsa alarma.

**Valores**: `accurate` o `false_positive`

---

### False Positive (Falsa Alarma)
Alerta generada que no resultó en un evento real.

**Ejemplo**: "Alerta de tormenta pero no llovió"

---

### Forecast (Pronóstico)
Predicción de condiciones climáticas futuras.

En CliMax: Usamos Open-Meteo API + Groq para análisis

---

## G

### Groq
Proveedor de IA especializado en procesamiento rápido. Usamos su modelo `mixtral-8x7b-32768`.

**Características**:
- ⚡ Muy rápido (850ms promedio)
- 💰 Muy económico (~$1/mes)
- 🎯 Optimizado para análisis

---

### Geocoding
Proceso de convertir coordenadas (lat/lon) en dirección legible.

**Ejemplo**: (4.7110, -74.0721) → "Bogotá, Colombia"

---

## H

### Historical Pattern (Patrón Histórico)
Análisis estadístico de datos climáticos de los últimos 48 horas.

Incluye:
- Promedio de temperatura
- Tendencia (subiendo/bajando/estable)
- Eventos extremos detectados
- Velocidades de viento

---

## J

### JWT (JSON Web Token)
Token de autenticación que emite Supabase y se usa en cada request a la API.

**Formato**: `eyJhbGc...` (muy largo)

**Cómo se usa**:
```bash
curl -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:8000/api/intelligent-alerts
```

---

## L

### Latency (Latencia)
Tiempo de respuesta. En nuestro caso, cuánto tarda Groq en analizar y responder.

**Promedio CliMax**: 850ms

---

## M

### Migration (Migración)
Archivo que define cambios a la estructura de la base de datos.

**Archivo**: `database/migrations/2026_05_06_000000_create_intelligent_alerts_table.php`

---

### Model (Modelo)
1. **Groq Model**: El algoritmo IA que usamos (`mixtral-8x7b`)
2. **Eloquent Model**: Clase PHP que representa la tabla `intelligent_alerts`

---

## N

### Notification (Notificación)
Alerta enviada al usuario (push, in-app, etc.).

En CliMax: **In-app por ahora**, push notifications en el futuro

---

## P

### Pattern Recognition (Reconocimiento de Patrones)
Análisis de tendencias en datos para identificar comportamientos.

**Ejemplo**: Temperatura bajando + viento subiendo = Posible tormenta

---

### Payload (Carga)
Datos JSON enviados en un request.

**Ejemplo**:
```json
{
  "latitude": 4.7110,
  "longitude": -74.0721,
  "temperature": 18,
  "weather_code": 2
}
```

---

## R

### Real-time (Tiempo Real)
Procesamiento inmediato sin demoras significativas.

En CliMax: Alertas se generan cada 30-60 minutos, no son 100% tiempo real

---

### Risk Level (Nivel de Riesgo)
Evaluación de peligro: **low**, **medium**, **high**, **severe**

| Nivel | Riesgo | Color |
|-------|--------|-------|
| low | Bajo | 🟢 |
| medium | Medio | 🟡 |
| high | Alto | 🟠 |
| severe | Severo | 🔴 |

---

## S

### Scheduler (Programador)
Sistema que ejecuta tareas automáticamente según cronograma.

En CliMax: Se ejecuta cada 30 minutos para procesar alertas

---

### Supabase
Proveedor de base de datos y autenticación que usamos.

**Servicios**: PostgreSQL, Auth, Storage

---

## T

### Token (Ficha de Autenticación)
Cadena de caracteres que valida tu identidad.

**Tipos en CliMax**:
- JWT de Supabase (para API)
- Refresh token (para renovar JWT)

---

### Trend (Tendencia)
Dirección del cambio en datos.

**Valores**: `increasing` ↗️, `decreasing` ↘️, `stable` →

---

## U

### User Context (Contexto del Usuario)
Información sobre el usuario para personalizar alertas.

Incluye:
- Hora del día
- Ubicaciones típicas
- Actividades históricas
- Preferencias

---

## W

### Weather Code (Código de Clima)
Número estándar WMO que representa una condición climática.

**Ejemplos**:
- 0 = Despejado ☀️
- 2 = Parcialmente nublado ⛅
- 80 = Chubascos 🌧️
- 95 = Tormenta ⛈️

---

### WMO (World Meteorological Organization)
Estándar internacional para códigos de clima.

Usamos: Open-Meteo API (que implementa WMO)

---

## Z

### Zone (Zona)
Área geográfica que el usuario monitorea.

En CliMax: Basado en GPS + ciudades guardadas

---

## 🔄 Relaciones Clave

```
Usuario
  ├── JWT Token (autenticación)
  ├── Weather Logs (histórico clima)
  ├── Profile (datos perfil)
  └── Intelligent Alerts (alertas generadas)

Intelligent Alert
  ├── Risk Level (bajo/medio/alto/severo)
  ├── Analysis Reason (explicación IA)
  ├── Recommended Actions (acciones sugeridas)
  ├── Historical Pattern (patrón detectado)
  ├── User Feedback (usuario dice si fue precisa)
  └── Created At (cuándo se generó)
```

---

## 📊 Flujo de Términos

```
Usuario Autorizado (JWT Token)
        ↓
Captura Clima (Coordinates + Weather Code)
        ↓
Se Guarda en Weather Logs (Historical Pattern)
        ↓
Scheduler Ejecuta Comando
        ↓
Se Construye Context (Weather Data + User Data)
        ↓
Se Envía a Groq (IA Analysis)
        ↓
Se Genera Alert (Risk Level + Recommendations)
        ↓
Usuario Consume Alert (API Endpoint)
        ↓
Usuario Lee Alert (UI Mobile)
        ↓
Usuario Proporciona Feedback (accurate/false_positive)
        ↓
Sistema Aprende (mejora modelos)
```

---

## 🎓 Acrónimos

| Acrónimo | Significado |
|----------|------------|
| IA / AI | Artificial Intelligence (Inteligencia Artificial) |
| API | Application Programming Interface |
| JWT | JSON Web Token |
| WMO | World Meteorological Organization |
| GPS | Global Positioning System |
| REST | Representational State Transfer |
| HTTP | HyperText Transfer Protocol |
| JSON | JavaScript Object Notation |
| SQL | Structured Query Language |
| UI | User Interface |
| UX | User Experience |

---

## 💡 Preguntas Frecuentes (Usando Glosario)

**P: ¿Qué es Risk Level?**
R: Evaluación de peligro climático (low/medium/high/severe) generada por Groq

**P: ¿Qué es Historical Pattern?**
R: Análisis estadístico de los últimos 48h de Weather Logs del usuario

**P: ¿Cómo se autoriza un usuario?**
R: Con JWT Token emitido por Supabase tras login exitoso

**P: ¿Qué es Feedback?**
R: Información del usuario sobre si la alerta fue precisa (accurate) o falsa alarma (false_positive)

---

## 🔗 Referencias

- [WMO Weather Codes](https://www.wmo.int/)
- [Open-Meteo API](https://open-meteo.com/)
- [Groq API Docs](https://console.groq.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [JWT.io](https://jwt.io/)

---

**Última actualización:** 2026-05-06  
**Versión:** 1.0.0
