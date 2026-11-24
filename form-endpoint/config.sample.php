<?php
// Sample configuration for form-endpoint/contact.php.
// Copy to config.php and fill in real values. config.php is gitignored —
// never commit real credentials.
return [
    // Origins allowed to submit the form (exact match, scheme + host).
    'allowed_origins' => [
        'https://www.pheladelfia.com',
        'https://pheladelfia.com',
    ],

    // SMTP delivery for the verification-code email.
    'smtp_host' => 'smtp.example.com',
    'smtp_port' => 587,
    'smtp_secure' => 'starttls', // 'ssl' or 'starttls'
    'smtp_user' => 'user@example.com',
    'smtp_pass' => 'CHANGE_ME',

    'from_email' => 'noreply@example.com',
    'from_name' => 'Pheladelfia Website Form',

    // Where verified submissions are delivered.
    'to_email' => 'nursery@example.com',
    // Optional per-form-type overrides, e.g. 'careers' => ['hr@example.com'].
    'recipients' => [],

    // Shared secret used to hash OTP codes. Use a long random string.
    'secret' => 'CHANGE_ME_LONG_RANDOM_STRING',

    // OTP storage directory (must be writable, outside web root preferred).
    'otp_dir' => sys_get_temp_dir() . '/pheladelfia-otp',
    'otp_ttl' => 600, // seconds

    // Max upload size in bytes (10 MB).
    'max_upload' => 10485760,
];
