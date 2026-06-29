<?php

return [

    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'anon_key' => env('SUPABASE_ANON_KEY'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
    ],

    'weather' => [
        'api_key' => env('WEATHER_API_KEY'),
        'base_url' => env('WEATHER_API_URL', 'https://api.open-meteo.com/v1/forecast'),
        'verify' => env('WEATHER_API_VERIFY', false),
        'timeout' => (int) env('WEATHER_API_TIMEOUT', 8),
        'connect_timeout' => (int) env('WEATHER_API_CONNECT_TIMEOUT', 3),
    ],

    'geocoding' => [
        'base_url' => env('GEOCODING_API_URL', 'https://nominatim.openstreetmap.org/reverse'),
        'verify' => env('GEOCODING_API_VERIFY', false),
        'timeout' => (int) env('GEOCODING_API_TIMEOUT', 8),
        'connect_timeout' => (int) env('GEOCODING_API_CONNECT_TIMEOUT', 3),
    ],

    'geocoding_search' => [
        'base_url' => env('GEOCODING_SEARCH_API_URL', 'https://geocoding-api.open-meteo.com/v1/search'),
        'verify' => env('GEOCODING_SEARCH_API_VERIFY', false),
        'timeout' => (int) env('GEOCODING_SEARCH_API_TIMEOUT', 8),
        'connect_timeout' => (int) env('GEOCODING_SEARCH_API_CONNECT_TIMEOUT', 3),
    ],

    'groq' => [
        'api_key' => env('GROQ_API_KEY'),
        'model' => env('GROQ_MODEL', 'mixtral-8x7b-32768'),
    ],

    'expo' => [
        'access_token' => env('EXPO_ACCESS_TOKEN'),
        'quiet_hours_start' => (int) env('PUSH_QUIET_HOURS_START', 22),
        'quiet_hours_end' => (int) env('PUSH_QUIET_HOURS_END', 7),
        'timezone' => env('PUSH_TIMEZONE', env('APP_TIMEZONE', 'America/Lima')),
    ],

    'billing' => [
        'provider' => env('BILLING_PROVIDER', 'simulated'),
        'checkout_success_url' => env('STRIPE_CHECKOUT_SUCCESS_URL'),
        'checkout_cancel_url' => env('STRIPE_CHECKOUT_CANCEL_URL'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
