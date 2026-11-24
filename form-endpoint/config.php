<?php
// Form endpoint config — keep this file private, never commit credentials.
return [
    'secret'      => 'ph-form-2026-xK9',          // shared token the theme sends
    'smtp_host'   => 'mail.pheladelfia.com',
    'smtp_port'   => 465,                          // 465 = SSL, 587 = STARTTLS
    'smtp_secure' => 'ssl',                        // 'ssl' or 'starttls'
    'smtp_user'   => 'no-reply@pheladelfia.com',
    'smtp_pass'   => 'MMmm@MMmm1973',
    'from_email'  => 'no-reply@pheladelfia.com',
    'from_name'   => 'Pheladelfia Website',
    'to_email'    => 'nursery@pheladelfia.com',
    'recipients'  => [
        'contact' => ['marketing@pheladelfia.com'],
        'careers' => ['hr@pheladelfia.com', 'nursery@pheladelfia.com'],
    ],
    'allowed_origins' => [
        'https://testpheladelfia.zohoecommerce.com',
        'https://pheladelfia.com',
        'https://www.pheladelfia.com',
    ],
    'max_upload'  => 10 * 1024 * 1024,             // 10 MB
    'log_file'    => __DIR__ . '/submissions.log', // optional audit log
];
