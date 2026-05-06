# ⚡ Quick Start - Alertas Inteligentes

**Tiempo estimado:** 5 minutos

---

## 1️⃣ Obtener API Key de Groq (2 min)

```bash
# 1. Ve a https://console.groq.com
# 2. Sign Up o Log In
# 3. Ve a "API Keys"
# 4. Click "Create New API Key"
# 5. Copia la clave (empieza con "gsk_")
```

---

## 2️⃣ Configurar Backend (2 min)

```bash
cd backend

# Edita .env y agrega:
GROQ_API_KEY=gsk_tu_clave_aqui
GROQ_MODEL=mixtral-8x7b-32768

# Ejecuta migraciones
php artisan migrate

# Prueba el comando
php artisan alerts:process-intelligent
```

**Output esperado:**
```
🤖 Iniciando procesamiento...
Procesando X usuarios activos...
✅ Procesamiento completado
Usuarios: 5 | Alertas generadas: 3
```

---

## 3️⃣ Usar en Mobile (1 min)

```typescript
// En tu pantalla de alertas
import { useIntelligentAlerts } from '../hooks/useIntelligentAlerts';
import { IntelligentAlertCard } from '../components/IntelligentAlertCard';

export default function AlertsScreen() {
  const { alerts, loading, markAsRead, provideFeedback } = useIntelligentAlerts();

  if (loading) return <Text>Cargando...</Text>;

  return (
    <ScrollView>
      {alerts.map((alert) => (
        <IntelligentAlertCard
          key={alert.id}
          alert={alert}
          onMarkAsRead={markAsRead}
          onProvideFeedback={provideFeedback}
        />
      ))}
    </ScrollView>
  );
}
```

---

## 📍 Carpeta de Instalación (Producción)

Agregar a tu crontab:

```bash
# Ejecutar scheduler cada minuto
* * * * * cd /home/mintriago/Escritorio/CliMax/backend && php artisan schedule:run >> /dev/null 2>&1
```

---

## ✅ Verificar que Funciona

```bash
# 1. Backend ejecutando?
php artisan serve  # puerto 8000

# 2. Prueba endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/api/intelligent-alerts

# 3. Ver logs
tail -f backend/storage/logs/laravel.log
```

---

## 🆘 Problemas Comunes

| Error | Solución |
|-------|----------|
| `GROQ_API_KEY not found` | Revisa que esté en `.env` |
| `Tabla no existe` | Ejecuta: `php artisan migrate` |
| `401 Unauthorized` | Token JWT inválido/expirado |

---

## 📚 Documentación Completa

- [INTELLIGENT_ALERTS_SETUP.md](./INTELLIGENT_ALERTS_SETUP.md) - 10 secciones detalladas
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Resumen técnico

---

## 💡 Cómo Funciona

```
Mobile captura clima cada 30 min
         ↓
Backend recibe en /api/location
         ↓
Scheduler ejecuta cada 30/60 min
         ↓
Groq analiza histórico 48h
         ↓
Se crea alerta inteligente
         ↓
Mobile consume /api/intelligent-alerts
         ↓
Usuario ve notificación anticipada 🔔
```

---

## 🎯 Siguientes Pasos

1. ✅ Configurar Groq API
2. ✅ Ejecutar migraciones
3. ✅ Agregar a crontab (producción)
4. ⬜ Integrar componente en mobile
5. ⬜ (Opcional) Agregar push notifications

---

**¿Necesitas ayuda?** Revisa la documentación completa o contacta soporte.
