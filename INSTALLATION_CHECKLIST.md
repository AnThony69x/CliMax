# ✅ Checklist de Instalación

Completa cada paso para asegurar que todo funciona correctamente.

---

## 🔧 Fase 1: Preparación (5 min)

- [ ] **Groq API Key obtenida**
  - [ ] Voy a https://console.groq.com
  - [ ] Creo cuenta o inicio sesión
  - [ ] Voy a "API Keys"
  - [ ] Copio la clave (empieza con "gsk_")

- [ ] **Verificar PHP y Laravel**
  ```bash
  php -v  # Debe ser 8.2+
  composer -v  # Debe estar instalado
  ```

- [ ] **Backend configurado**
  ```bash
  cd backend
  ls .env  # Debe existir
  ```

---

## 📝 Fase 2: Configuración (5 min)

- [ ] **Agregar variables a .env**
  ```bash
  # Edito backend/.env
  GROQ_API_KEY=gsk_tu_clave_aqui
  GROQ_MODEL=mixtral-8x7b-32768
  ```

- [ ] **Verificar variables**
  ```bash
  grep "GROQ" backend/.env
  # Debe mostrar las dos líneas que agregué
  ```

- [ ] **DB configurada correctamente**
  ```bash
  # backend/.env debe tener:
  DB_CONNECTION=pgsql
  DB_HOST=...
  DB_PORT=...
  DB_DATABASE=...
  DB_USERNAME=...
  DB_PASSWORD=...
  ```

---

## 🗄️ Fase 3: Base de Datos (3 min)

- [ ] **Ejecutar migraciones**
  ```bash
  cd backend
  php artisan migrate
  ```
  
- [ ] **Verificar tabla creada**
  ```bash
  # En Supabase:
  SELECT * FROM information_schema.tables 
  WHERE table_name = 'intelligent_alerts';
  # Debe retornar 1 fila
  ```

- [ ] **Verificar estructura**
  ```bash
  php artisan tinker
  >>> \App\Models\IntelligentAlert::all()->count()
  # Debe retornar 0
  ```

---

## 🤖 Fase 4: Backend (5 min)

- [ ] **Verificar comando existe**
  ```bash
  cd backend
  php artisan list | grep alerts
  # Debe mostrar: alerts:process-intelligent
  ```

- [ ] **Probar comando manualmente**
  ```bash
  php artisan alerts:process-intelligent
  # Output esperado:
  # 🤖 Iniciando procesamiento de alertas inteligentes...
  # ✅ Procesamiento completado
  ```

- [ ] **Probar servidor backend**
  ```bash
  php artisan serve
  # Debe estar en http://localhost:8000
  # Ctrl+C para detener
  ```

- [ ] **Verificar rutas nuevas**
  ```bash
  cd backend
  php artisan route:list | grep intelligent
  # Debe mostrar 7 rutas nuevas
  ```

---

## 📱 Fase 5: Mobile (5 min)

- [ ] **Copiar archivos a mobile**
  ```bash
  # Ya están creados en:
  ls mobile/src/hooks/useIntelligentAlerts.ts
  ls mobile/src/components/IntelligentAlertCard.tsx
  ```

- [ ] **Verificar imports**
  ```bash
  # En tu pantalla de alertas:
  # import { useIntelligentAlerts } from '../../hooks/useIntelligentAlerts';
  # import { IntelligentAlertCard } from '../../components/IntelligentAlertCard';
  ```

- [ ] **Probar en Expo**
  ```bash
  cd mobile
  npm run start
  # Abre en dispositivo/emulador
  ```

---

## 📋 Fase 6: Integración (10 min)

- [ ] **Crear AlertsScreen mejorada**
  ```typescript
  // mobile/src/app/alerts.tsx
  import { useIntelligentAlerts } from '../hooks/useIntelligentAlerts';
  
  export default function AlertsScreen() {
    const { alerts, loading, markAsRead } = useIntelligentAlerts();
    // ... render UI
  }
  ```

- [ ] **Actualizar navegación**
  - [ ] AlertsScreen muestra alertas tradicionales
  - [ ] + Nueva sección "Alertas Inteligentes"
  - [ ] Con componente IntelligentAlertCard

- [ ] **Probar endpoints**
  ```bash
  # Obtener JWT token de Supabase
  TOKEN="eyJ..."
  
  # Test endpoint
  curl -H "Authorization: Bearer $TOKEN" \
    http://localhost:8000/api/intelligent-alerts
  # Debe retornar JSON
  ```

---

## ⏰ Fase 7: Scheduler (Producción)

- [ ] **Agregá cron en servidor**
  ```bash
  # SSH a tu servidor
  crontab -e
  
  # Agregar línea:
  * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
  ```

- [ ] **Verificar cron se ejecuta**
  ```bash
  # Esperar 2 minutos, luego:
  tail -f /var/log/syslog | grep artisan
  # Debe ver ejecuciones
  ```

- [ ] **Verificar alertas se generan**
  ```sql
  SELECT COUNT(*) FROM intelligent_alerts 
  WHERE created_at >= NOW() - INTERVAL 5 MINUTE;
  # Debe aumentar cada minuto si hay usuarios activos
  ```

---

## 🧪 Fase 8: Testing (10 min)

- [ ] **Test manualmente**
  ```bash
  # 1. Capturar clima en mobile
  # 2. Esperar a que se guarde en BD
  # 3. Ejecutar comando manualmente:
  php artisan alerts:process-intelligent
  # 4. Verificar que se creó alerta
  ```

- [ ] **Verificar respuesta Groq**
  ```bash
  tail -f backend/storage/logs/laravel.log | grep "Groq"
  # Debe mostrar llamadas a Groq API
  ```

- [ ] **Validar UI en mobile**
  - [ ] Se muestran tarjetas de alertas
  - [ ] Modal se abre al hacer click
  - [ ] Botones de feedback funcionan
  - [ ] Datos se actualizan cada 5 min

---

## 📊 Fase 9: Monitoreo (5 min)

- [ ] **Dashboard SQL**
  ```sql
  -- Alertas últimas 24h
  SELECT risk_level, COUNT(*) as count
  FROM intelligent_alerts
  WHERE created_at >= NOW() - INTERVAL 1 DAY
  GROUP BY risk_level;
  
  -- Usuarios con alertas
  SELECT user_id, COUNT(*) as alert_count
  FROM intelligent_alerts
  WHERE created_at >= NOW() - INTERVAL 24 HOUR
  GROUP BY user_id;
  ```

- [ ] **Verificar costos**
  ```bash
  # En Groq console:
  # https://console.groq.com/account/billing
  # Debe mostrar uso mensual bajo ($1-5 range)
  ```

- [ ] **Logs sin errores**
  ```bash
  grep -i "error\|exception" backend/storage/logs/laravel.log
  # Idealmente: sin resultados
  ```

---

## 🚀 Fase 10: Deploy (Opcional)

- [ ] **Git commit**
  ```bash
  git add -A
  git commit -m "feat: Intelligent alerts with Groq AI"
  ```

- [ ] **Deploy a producción**
  ```bash
  git push origin main
  # CI/CD se encarga del rest
  ```

- [ ] **Verificar en prod**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    https://api.climax.com/api/intelligent-alerts
  ```

---

## ✨ Fase 11: Optimización (Opcional)

- [ ] **Aumentar frecuencia de análisis**
  - [ ] Cambiar en Kernel.php si es necesario

- [ ] **Agregar notificaciones push**
  - [ ] Firebase Cloud Messaging
  - [ ] Solo para alertas "high" y "severe"

- [ ] **Mejorar prompts**
  - [ ] Agregar más contexto
  - [ ] Fine-tuning basado en feedback

- [ ] **Análisis histórico**
  - [ ] Dashboard de tendencias
  - [ ] Reportes de precisión

---

## 🆘 Troubleshooting Rápido

### ❌ "GROQ_API_KEY not found"
```bash
# Verifica que esté en .env
grep GROQ_API_KEY backend/.env
# Si no aparece, edita el archivo
nano backend/.env
```

### ❌ "Table 'intelligent_alerts' doesn't exist"
```bash
cd backend && php artisan migrate
```

### ❌ "401 Unauthorized en mobile"
```bash
# Verifica token JWT válido
# Token debe ser de Supabase Auth
```

### ❌ "Scheduler no se ejecuta"
```bash
# Verifica cron
crontab -l

# Verifica logs
tail -f /var/log/syslog
```

---

## ✅ Final Checklist

- [ ] Groq API Key configurada
- [ ] BD migrada correctamente
- [ ] Comando funciona manualmente
- [ ] Endpoints retornan datos
- [ ] Mobile muestra alertas
- [ ] Scheduler configurado (prod)
- [ ] Cron se ejecuta cada minuto
- [ ] Logs sin errores
- [ ] Usuarios reciben alertas
- [ ] Feedback funciona

---

## 🎉 ¡Listo!

Si completaste todos los puntos, tu sistema de alertas inteligentes está **100% funcional**.

**Tiempo total: ~45 minutos**

---

**¿Necesitas ayuda?** Revisa:
- [QUICK_START.md](./QUICK_START.md) - Para empezar rápido
- [INTELLIGENT_ALERTS_SETUP.md](./INTELLIGENT_ALERTS_SETUP.md) - Documentación completa
- [EXAMPLE_ALERTS.md](./EXAMPLE_ALERTS.md) - Ejemplos reales
