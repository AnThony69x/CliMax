<?php

namespace App\Console\Commands;

use App\Models\ProfessionalProfile;
use App\Models\StaffRole;
use App\Models\SubscriptionPlan;
use App\Models\UserSubscription;
use Illuminate\Console\Command;

class GrantAccess extends Command
{
    protected $signature = 'access:grant
        {user_id : UUID del usuario de Supabase}
        {--role= : admin, operator o none}
        {--plan= : free, premium o professional}
        {--sector= : Sector profesional opcional}';

    protected $description = 'Asigna rol interno, plan y sector profesional a un usuario.';

    public function handle(): int
    {
        $userId = (string) $this->argument('user_id');
        $role = $this->option('role');
        $planKey = $this->option('plan');
        $sector = $this->option('sector');

        if ($role !== null) {
            if (! in_array($role, ['admin', 'operator', 'none'], true)) {
                $this->error('Role debe ser admin, operator o none.');
                return self::FAILURE;
            }

            if ($role === 'none') {
                StaffRole::query()->where('user_id', $userId)->delete();
            } else {
                StaffRole::query()->updateOrCreate(
                    ['user_id' => $userId],
                    [
                        'role' => $role,
                        'assigned_at' => now(),
                    ]
                );
            }
        }

        if ($planKey !== null) {
            if (! in_array($planKey, ['free', 'premium', 'professional'], true)) {
                $this->error('Plan debe ser free, premium o professional.');
                return self::FAILURE;
            }

            $plan = SubscriptionPlan::query()->where('key', $planKey)->first();
            if (! $plan) {
                $this->error('No existe el plan solicitado. Ejecuta primero las migraciones.');
                return self::FAILURE;
            }

            UserSubscription::query()
                ->where('user_id', $userId)
                ->where('status', 'active')
                ->update(['status' => 'canceled']);

            UserSubscription::query()->create([
                'user_id' => $userId,
                'subscription_plan_id' => $plan->id,
                'status' => 'active',
                'starts_at' => now(),
            ]);
        }

        if ($sector !== null) {
            if ($sector === 'none') {
                ProfessionalProfile::query()->where('user_id', $userId)->delete();
            } else {
                ProfessionalProfile::query()->updateOrCreate(
                    ['user_id' => $userId],
                    ['sector' => $sector]
                );
            }
        }

        $this->info('Acceso actualizado correctamente.');
        return self::SUCCESS;
    }
}
