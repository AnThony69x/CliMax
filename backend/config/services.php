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
    ],

    'geocoding' => [
        'base_url' => env('GEOCODING_API_URL', 'https://nominatim.openstreetmap.org/reverse'),
        'verify' => env('GEOCODING_API_VERIFY', false),
    ],

    'geocoding_search' => [
        'base_url' => env('GEOCODING_SEARCH_API_URL', 'https://geocoding-api.open-meteo.com/v1/search'),
        'verify' => env('GEOCODING_SEARCH_API_VERIFY', false),
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
