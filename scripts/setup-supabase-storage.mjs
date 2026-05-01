/**
 * Script de configuración: bucket "avatars" + policies en Supabase Storage
 * Ejecutar UNA sola vez:  node scripts/setup-supabase-storage.mjs
 */

const SUPABASE_URL      = 'https://cinvsafcyevlwtthgefp.supabase.co';
const SERVICE_ROLE_KEY  = 'PEGA_AQUI_TU_SERVICE_ROLE_KEY';

if (SERVICE_ROLE_KEY === 'PEGA_AQUI_TU_SERVICE_ROLE_KEY') {
  console.error('❌  Abre el script y pega tu service_role key antes de ejecutarlo.');
  process.exit(1);
}

const headers = {
  apikey:        SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function createBucket() {
  console.log('📦  Creando bucket "avatars"...');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method:  'POST',
    headers,
    body: JSON.stringify({ id: 'avatars', name: 'avatars', public: true }),
  });
  const json = await res.json();
  if (res.ok || json?.error === 'Duplicate') {
    console.log('✅  Bucket "avatars" listo.');
  } else {
    console.warn('⚠️  Bucket:', JSON.stringify(json));
  }
}

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method:  'POST',
    headers,
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
}

async function createPolicies() {
  console.log('🔒  Aplicando policies de Storage...');

  const sqls = [
    // SELECT público (leer avatares sin autenticación)
    `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Avatares públicos lectura'
      ) THEN
        CREATE POLICY "Avatares públicos lectura"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'avatars');
      END IF;
    END $$;
    `,
    // INSERT — solo el dueño puede subir dentro de su carpeta
    `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Usuario sube su avatar'
      ) THEN
        CREATE POLICY "Usuario sube su avatar"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
      END IF;
    END $$;
    `,
    // UPDATE — solo el dueño puede sobreescribir
    `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Usuario actualiza su avatar'
      ) THEN
        CREATE POLICY "Usuario actualiza su avatar"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
      END IF;
    END $$;
    `,
    // SELECT autenticado (necesario para que UPDATE funcione en Postgres RLS)
    `
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='Usuario lee su propio avatar'
      ) THEN
        CREATE POLICY "Usuario lee su propio avatar"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
      END IF;
    END $$;
    `,
  ];

  // Supabase expone un endpoint de SQL via Management API
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];
  for (const sql of sqls) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.warn('⚠️  SQL warning:', txt.slice(0, 200));
    }
  }
  console.log('✅  Policies aplicadas.');
}

(async () => {
  try {
    await createBucket();
    await createPolicies();
    console.log('\n🎉  Configuración completada. Ya puedes subir avatares desde la app.');
  } catch (err) {
    console.error('❌  Error:', err.message);
    process.exit(1);
  }
})();
