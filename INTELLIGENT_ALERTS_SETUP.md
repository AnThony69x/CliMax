# CliMax - Alertas Inteligentes con Groq 🤖

Documentación completa para implementar el sistema de alertas inteligentes personalizadas usando Groq AI.

## 📋 Tabla de Contenidos

1. [Configuración Inicial](#configuración-inicial)
2. [Instalación](#instalación)
3. [Arquitectura](#arquitectura)
4. [Endpoints API](#endpoints-api)
5. [Flujo de Datos](#flujo-de-datos)
6. [Ejemplos de Uso](#ejemplos-de-uso)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Configuración Inicial

### 1. Obtener API Key de Groq

1. Ve a [console.groq.com](https://console.groq.com)
2. Crea una cuenta o inicia sesión
3. Navega a "API Keys"
4. Crea una nueva clave y cópiala

### 2. Actualizar archivo `.env`

Agrega estas variables a tu archivo `.env` en la carpeta `backend/`:

```env
# Groq AI Configuration
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=mixtral-8x7b-32768
```

**Modelos disponibles en Groq:**
- `mixtral-8x7b-32768` (recomendado - más rápido y económico)
- `llama-3-70b-8192`
- `llama-3-8b-8192`

### 3. Ejecutar migraciones

```bash
cd backend
php artisan migrate
```

Esto creará la tabla `intelligent_alerts` con la estructura necesaria.

---

## 📦 Instalación

### Backend

Ya está todo incluido en los archivos. Solo necesitas:

```bash
# En carpeta backend/
composer install

# Copiar .env y configurar
cp .env.example .env

# Generar key
php artisan key:generate

# Ejecutar migraciones
php artisan migrate

# Probar el comando (opcional)
php artisan alerts:process-intelligent
```

### Scheduler

Para que las alertas se generen automáticamente, Laravel necesita ejecutar el scheduler. Agrega a tu crontab:

```bash
# Ejecutar cada minuto (Laravel ejecutará comandos según schedule)
* * * * * cd /home/mintriago/Escritorio/CliMax/backend && php artisan schedule:run >> /dev/null 2>&1
```

O en Docker, el scheduler se ejecuta automáticamente.

---

## 🏗️ Arquitectura

### Flujo Completo

```
1. Mobile captura clima
   ↓
2. POST /api/location → Backend guarda en weather_logs
   ↓
3. Scheduler ejecuta cada 30 min / 1 hora
   ↓
4. ProcessIntelligentAlerts command:
   - Lee último log de usuario
   - Obtiene histórico 48h
   - Lee perfil del usuario
   ↓
5. GroqAnalyzerService:
   - Construye contexto con datos climáticos + usuario
   - Envía prompt a Groq API
   - Recibe análisis de riesgo
   ↓
6. Crea registro en intelligent_alerts
   ↓
7. Mobile consume /api/intelligent-alerts
```

### Tablas de Base de Datos

#### `weather_logs` (existente)
```sql
- id: ID único
- user_id: Usuario que capturó
- latitude, longitude: Coordenadas
- address: Ubicación en texto
- temperature: Temp en °C
- weather_code: Código WMO
- wind_speed: Velocidad viento km/h
- captured_at: Fecha captura
```

#### `intelligent_alerts` (nueva)
```sql
- id: ID único
- user_id: Usuario
- latitude, longitude: Ubicación de alerta
- risk_level: low | medium | high | severe
- analysis_reason: Explicación de Groq (150-200 palabras)
- recommended_actions: JSON con acciones sugeridas
- user_context: JSON con hora, ubicaciones típicas, etc.
- temperature, weather_code, wind_speed: Datos climáticos
- historical_pattern: JSON con tendencias 48h
- is_notified: Fue notificado?
- is_read: Usuario leyó?
- user_feedback: accurate | false_positive
- created_at: Cuando se generó
```

---

## 🔌 Endpoints API

### Base URL
```
http://localhost:8000/api
```

### 1. Obtener Alertas Inteligentes

**GET** `/intelligent-alerts`

Obtiene últimas alertas del usuario (paginadas).

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/api/intelligent-alerts
```

**Respuesta:**
```json
{
  "data": [
    {
      "id": 1,
      "user_id": "uuid-usuario",
      "latitude": 4.7110,
      "longitude": -74.0721,
      "address": "Bogotá, Colombia",
      "risk_level": "high",
      "analysis_reason": "Condiciones de tormenta severa detectadas. Temperatura inusualmente baja (12°C) combinada con velocidad de viento alta (45 km/h) y patrón histórico de chubascos...",
      "recommended_actions": [
        "Evite desplazamientos innecesarios",
        "Asegure puertas y ventanas",
        "Manténgase atento a alertas oficiales"
      ],
      "risk_level": "high",
      "is_read": false,
      "created_at": "2026-05-06T14:30:00Z"
    }
  ]
}
```

---

### 2. Alertas No Leídas

**GET** `/intelligent-alerts/unread`

Solo alertas sin leer.

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/api/intelligent-alerts/unread
```

---

### 3. Alertas de Alto Riesgo

**GET** `/intelligent-alerts/high-risk`

Solo alertas `high` o `severe`.

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/api/intelligent-alerts/high-risk
```

---

### 4. Resumen de Alertas

**GET** `/intelligent-alerts/summary`

Estadísticas agregadas.

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/api/intelligent-alerts/summary
```

**Respuesta:**
```json
{
  "data": {
    "total_alerts_48h": 12,
    "unread_count": 3,
    "high_risk_count": 2,
    "by_risk_level": {
      "low": 5,
      "medium": 5,
      "high": 2,
      "severe": 0
    },
    "average_confidence": 87,
    "accuracy_feedback": {
      "accurate": 8,
      "false_positive": 1
    }
  }
}
```

---

### 5. Historial por Período

**GET** `/intelligent-alerts/history?days=7`

Obtiene alertas de los últimos X días (1-90).

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8000/api/intelligent-alerts/history?days=7"
```

---

### 6. Detalle de Alerta

**GET** `/intelligent-alerts/{id}`

Obtiene una alerta específica. **Automáticamente la marca como leída.**

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/api/intelligent-alerts/123
```

---

### 7. Proporcionar Feedback

**POST** `/intelligent-alerts/{id}/feedback`

Retroalimentación sobre precisión de la alerta.

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"feedback":"accurate"}' \
  http://localhost:8000/api/intelligent-alerts/123/feedback
```

Valores: `accurate` o `false_positive`

---

## 📊 Flujo de Datos

### Ejemplo Completo

**Día 1 - Usuario en Bogotá:**

1. **15:00** - Mobile captura clima
   - Temp: 18°C
   - Código: 2 (Parcialmente nublado)
   - Viento: 15 km/h
   - Envía: POST `/api/location`

2. **15:30 - 23:00** - Mobile captura cada 30-60 min
   - Se van guardando todos los logs en `weather_logs`

3. **Día 2 - 00:00** - Scheduler ejecuta
   - Lee todos los logs de últimas 48h
   - Detecta patrón: temperatura bajando, viento aumentando
   - Envia a Groq:

```
Contexto:
- Temperatura actual: 12°C
- Tendencia: bajando rápido
- Viento: 45 km/h
- Código: 80 (Chubascos)
- Hora: 3 AM (usuario dormido)
- Ubicación: Bogotá (zona de riesgo)
```

4. **Groq responde:**
```
RISK_LEVEL: high
REASON: Tormenta severa inminente. Temperatura 6°C por debajo de promedio, 
velocidad viento 3x histórica, patrón de chubascos intensos detectado. 
Hora (madrugada) aumenta vulnerabilidad.

ACTIONS: Asegure aberturas | Apague equipos eléctricos | Monitoree alertas oficiales
CONFIDENCE: 89%
PATTERN: Depresión barométrica con evento convectivo
```

5. **Backend crea alerta:**
```sql
INSERT INTO intelligent_alerts VALUES (
  user_id: usuario,
  risk_level: 'high',
  analysis_reason: "...",
  recommended_actions: ["Asegure aberturas", ...],
  is_notified: false
)
```

6. **Mobile consume:**
   - GET `/api/intelligent-alerts`
   - Muestra notificación "⚠️ Alerta de tormenta severa"
   - Usuario lee y proporciona feedback

---

## 💡 Ejemplos de Uso en Mobile

### React Native / Expo

```typescript
// src/hooks/useIntelligentAlerts.ts
import { useState, useEffect } from 'react';
import { getAccessToken } from '../core/auth/supabaseClient';

export function useIntelligentAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [highRiskCount, setHighRiskCount] = useState(0);

  const fetchAlerts = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/intelligent-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAlerts(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const response = await fetch(`${apiUrl}/intelligent-alerts/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setHighRiskCount(data.data.high_risk_count);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  useEffect(() => {
    void fetchAlerts();
    void fetchSummary();
    
    // Actualizar cada 5 minutos
    const interval = setInterval(() => {
      void fetchAlerts();
      void fetchSummary();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { alerts, loading, highRiskCount, refetch: fetchAlerts };
}
```

**Uso en pantalla:**

```typescript
import { useIntelligentAlerts } from '../../hooks/useIntelligentAlerts';

export default function AlertsScreen() {
  const { alerts, loading, highRiskCount } = useIntelligentAlerts();

  return (
    <View>
      {highRiskCount > 0 && (
        <View style={styles.redAlert}>
          <Text>🔴 {highRiskCount} alertas de alto riesgo</Text>
        </View>
      )}

      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </View>
  );
}
```

---

## 🐛 Troubleshooting

### Problema: "401 Unauthorized"
- Verifica que estés enviando el JWT token correcto
- Token debe ser del usuario autenticado en Supabase
- Formato: `Authorization: Bearer <token>`

### Problema: "No se generan alertas"
- Verifica que `GROQ_API_KEY` está configurado
- Ejecuta manualmente: `php artisan alerts:process-intelligent`
- Revisa logs: `storage/logs/laravel.log`
- Asegúrate de que hay datos en `weather_logs`

### Problema: "Error conectando a Groq"
```bash
# Prueba la API key manualmente
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer gsk_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mixtral-8x7b-32768",
    "messages": [{"role": "user", "content": "Hola"}]
  }'
```

### Problema: "Scheduler no se ejecuta"
Verifica que cron está activo:
```bash
# En tu servidor
crontab -l
# Debe incluir:
# * * * * * cd /path/to/backend && php artisan schedule:run
```

### Problema: "Token inválido / expirado"
- Los tokens de Supabase expiran cada hora
- Mobile debe renovar el token antes de hacer requests
- Supabase maneja esto automáticamente con refresh tokens

---

## 📈 Métricas y Monitoreo

### Verificar alertas generadas

```bash
# SQL en Supabase
SELECT 
  user_id,
  risk_level,
  COUNT(*) as count,
  AVG(confidence) as avg_confidence
FROM intelligent_alerts
WHERE created_at >= NOW() - INTERVAL 24 HOUR
GROUP BY user_id, risk_level;
```

### Accuracy del modelo

```bash
# Feedback de usuarios
SELECT 
  user_feedback,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM intelligent_alerts
WHERE user_feedback IS NOT NULL
GROUP BY user_feedback;
```

---

## 🔐 Seguridad

1. **API Key de Groq:** Nunca la expongas en frontend
2. **JWT Tokens:** Se validan en middleware `supabase.auth`
3. **Rate Limiting:** Groq tiene límites de requests/minuto
4. **Data Privacy:** Los datos climáticos NO se envían a otros servidores excepto Groq

---

## 📝 Próximos Pasos

1. **Push Notifications:** Integrar Firebase Cloud Messaging para notificaciones push
2. **Machine Learning:** Entrenar modelo local con feedback de usuarios
3. **Alertas Comunitarias:** Combinar alertas individuales con reportes de comunidad
4. **Predicción Extendida:** Integrar más datos (satélite, radar)
5. **Geocerca:** Alertas automáticas cuando usuario entra/sale de zonas de riesgo

---

**Última actualización:** 2026-05-06
**Versión:** 1.0.0
