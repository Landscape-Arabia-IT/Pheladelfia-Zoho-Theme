<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

$configPath = getenv('PHELADELFIA_FORM_CONFIG') ?: __DIR__ . '/config.php';
$config = require $configPath;
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = in_array($origin, $config['allowed_origins'], true);
header('Vary: Origin');
if ($allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
}
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'OPTIONS') {
    if (!$allowed) respond(403, ['success' => false, 'message' => 'Origin not allowed']);
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}
if (!$allowed) respond(403, ['success' => false, 'message' => 'Origin not allowed']);

$maxUpload = (int) ($config['max_upload'] ?? 10485760);
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxUpload + 1048576) {
    respond(413, ['success' => false, 'message' => 'Request is too large. Maximum attachment size is 10MB.']);
}
$input = $_POST;
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) respond(400, ['success' => false, 'message' => 'Invalid request']);
}
$action = strtolower(trim((string) ($input['action'] ?? 'send')));
if (!in_array($action, ['send', 'verify'], true)) $action = 'send';

function field(array $input, string $key, int $max): string {
    $value = $input[$key] ?? '';
    if (!is_scalar($value)) respond(422, ['success' => false, 'message' => 'Invalid field']);
    $value = trim((string) $value);
    if (strlen($value) > $max || strpos($value, "\0") !== false) {
        respond(422, ['success' => false, 'message' => 'Field is too long or invalid']);
    }
    return $value;
}

$otpDir = $config['otp_dir'] ?? sys_get_temp_dir() . '/pheladelfia-otp';
$otpTtl = (int) ($config['otp_ttl'] ?? 600);

function otpDirReady(string $dir): bool {
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return false;
    return is_writable($dir);
}

function otpCleanup(string $dir, int $ttl): void {
    foreach (glob($dir . '/*.json') ?: [] as $meta) {
        $data = json_decode((string) @file_get_contents($meta), true);
        if (!is_array($data) || (int) ($data['expires'] ?? 0) < time()) {
            @unlink($meta);
            @unlink(preg_replace('/\.json$/', '.upload', $meta));
        }
    }
}

function loadMailer(array $config): PHPMailer {
    require_once __DIR__ . '/Exception.php';
    require_once __DIR__ . '/PHPMailer.php';
    require_once __DIR__ . '/SMTP.php';
    if (empty($config['smtp_pass']) || !in_array($config['smtp_secure'], ['ssl', 'starttls'], true)) {
        throw new RuntimeException('SMTP configuration unavailable');
    }
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = (int) $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_user'];
    $mail->Password = $config['smtp_pass'];
    $mail->SMTPSecure = $config['smtp_secure'] === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 25;
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->setFrom($config['from_email'], $config['from_name']);
    return $mail;
}

function e(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function otpEmailHtml(string $code, string $formLabel): string {
    return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;">'
        . '<div style="background:#1f3d2b;padding:24px 28px;">'
        . '<div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">Pheladelfia Agricultural LLC</div>'
        . '<div style="color:#c9a227;font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">Website verification</div>'
        . '</div>'
        . '<div style="padding:28px;color:#333333;font-size:15px;line-height:1.6;">'
        . '<p style="margin:0 0 16px;">Your ' . e($formLabel) . ' was received. To confirm it was you, enter this verification code:</p>'
        . '<div style="background:#f4f1e8;border:1px solid #ddd3b8;border-radius:8px;text-align:center;padding:18px;font-size:30px;font-weight:bold;letter-spacing:8px;color:#1f3d2b;">' . e($code) . '</div>'
        . '<p style="margin:16px 0 0;color:#666666;font-size:13px;">This code expires in 10 minutes. If you did not submit this ' . e($formLabel) . ', you can ignore this email — nothing will be sent.</p>'
        . '</div>'
        . '<div style="background:#f4f1e8;padding:16px 28px;color:#777777;font-size:12px;">'
        . 'Pheladelfia Agricultural LLC &middot; Al Ajban, Abu Dhabi &middot; pheladelfia.com'
        . '</div></div>';
}

function enquiryEmailHtml(string $formType, array $fields): string {
    $isJob = $formType === 'careers';
    $title = $isJob ? 'Job application' : 'Website enquiry';
    $rows = '';
    foreach ($fields as $label => $value) {
        $rows .= '<tr>'
            . '<td style="padding:10px 14px;background:#f4f1e8;font-weight:bold;color:#1f3d2b;width:38%;border-bottom:1px solid #e6e0d0;font-size:14px;vertical-align:top;">' . e($label) . '</td>'
            . '<td style="padding:10px 14px;color:#333333;border-bottom:1px solid #e6e0d0;font-size:14px;vertical-align:top;white-space:pre-wrap;">' . e($value) . '</td>'
            . '</tr>';
    }
    return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e0d0;">'
        . '<div style="background:#1f3d2b;padding:26px 30px;border-bottom:4px solid #c9a227;">'
        . '<div style="color:#ffffff;font-size:22px;font-weight:bold;">Pheladelfia Agricultural LLC</div>'
        . '<div style="color:#c9a227;font-size:12px;margin-top:5px;text-transform:uppercase;letter-spacing:1.5px;">' . e($title) . ' — verified submission</div>'
        . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $rows . '</table>'
        . '<div style="padding:18px 30px;color:#888888;font-size:12px;line-height:1.5;">'
        . 'This message was sent from the ' . e($isJob ? 'Join Us' : 'Contact Us') . ' form on pheladelfia.com after email verification.'
        . '</div>'
        . '<div style="background:#1f3d2b;padding:16px 30px;color:#c9a227;font-size:12px;text-align:center;">'
        . 'Al Ajban, Abu Dhabi &middot; +971 2 555 1662 &middot; pheladelfia.com'
        . '</div></div>';
}

// ---------------------------------------------------------------- verify ---
if ($action === 'verify') {
    $token = preg_replace('/[^a-f0-9]/', '', (string) ($input['otp_token'] ?? ''));
    $code = preg_replace('/\D/', '', (string) ($input['otp_code'] ?? ''));
    if (!otpDirReady($otpDir)) respond(503, ['success' => false, 'message' => 'Verification is temporarily unavailable.']);
    otpCleanup($otpDir, $otpTtl);
    $metaFile = $otpDir . '/' . $token . '.json';
    $meta = is_file($metaFile) ? json_decode((string) @file_get_contents($metaFile), true) : null;
    if (!is_array($meta) || (int) ($meta['expires'] ?? 0) < time()) {
        @unlink($metaFile);
        @unlink($otpDir . '/' . $token . '.upload');
        respond(410, ['success' => false, 'message' => 'Verification code expired. Please submit the form again.']);
    }
    if ((int) ($meta['attempts'] ?? 0) >= 5) {
        @unlink($metaFile);
        @unlink($otpDir . '/' . $token . '.upload');
        respond(422, ['success' => false, 'message' => 'Too many incorrect codes. Please submit the form again.']);
    }
    $expected = (string) ($meta['otp_hash'] ?? '');
    if ($code === '' || !hash_equals($expected, hash_hmac('sha256', $code, (string) ($config['secret'] ?? '') . $token))) {
        $meta['attempts'] = (int) ($meta['attempts'] ?? 0) + 1;
        @file_put_contents($metaFile, json_encode($meta), LOCK_EX);
        respond(422, ['success' => false, 'message' => 'Incorrect verification code. Please try again.']);
    }

    $formType = (string) $meta['form_type'];
    $fields = is_array($meta['fields'] ?? null) ? $meta['fields'] : [];
    $email = (string) ($meta['email'] ?? '');
    $name = (string) ($meta['name'] ?? '');
    $uploadPath = $otpDir . '/' . $token . '.upload';
    $upload = null;
    if (is_file($uploadPath)) {
        $upload = [
            'path' => $uploadPath,
            'name' => (string) ($meta['upload_name'] ?? 'attachment'),
            'type' => (string) ($meta['upload_type'] ?? 'application/octet-stream'),
        ];
    }
    @unlink($metaFile);

    try {
        $mail = loadMailer($config);
        $recipients = $config['recipients'][$formType] ?? [$config['to_email']];
        foreach ($recipients as $recipient) $mail->addAddress($recipient);
        $mail->addReplyTo($email, $name);
        $mail->Subject = '[' . ($formType === 'careers' ? 'Job application' : 'Website enquiry') . '] ' . $name;
        $mail->isHTML(true);
        $mail->Body = enquiryEmailHtml($formType, $fields);
        $mail->AltBody = '';
        foreach ($fields as $label => $value) $mail->AltBody .= $label . ":\n" . $value . "\n\n";
        if ($upload) $mail->addAttachment($upload['path'], $upload['name'], 'base64', $upload['type']);
        $mail->send();
        @unlink($uploadPath);
        respond(200, ['success' => true]);
    } catch (Throwable $e) {
        error_log('Pheladelfia website form: verified submission failed.');
        respond(502, ['success' => false, 'message' => 'Could not send your message. Please try again or email nursery@pheladelfia.com.']);
    }
}

// ------------------------------------------------------------------ send ---
if (field($input, 'website', 2048) !== '') respond(200, ['success' => true, 'needs_otp' => false]);

$formType = field($input, 'form_type', 20);
if ($formType === '') {
    $formType = ($input['subject'] ?? '') === 'Job application' ? 'careers' : 'contact';
}
if (!in_array($formType, ['contact', 'careers'], true)) {
    respond(422, ['success' => false, 'message' => 'Unknown form type']);
}
$name = field($input, 'name', 250);
$email = field($input, 'email', 254);
$phone = field($input, 'phone', 80);
$message = field($input, $formType === 'careers' ? 'about' : 'message', 20000);
if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || preg_match('/[\r\n]/', $email . $name) || ($formType === 'careers' && $phone === '')) {
    respond(422, ['success' => false, 'message' => 'Please enter your name, valid email and message, and phone for applications.']);
}
$fields = ['Name' => $name, 'Email' => $email, 'Phone' => $phone,
           $formType === 'careers' ? 'About you' : 'Message' => $message];
if ($formType === 'careers') {
    $fields['Area of interest'] = field($input, 'area', 250);
    foreach (['position' => 'Position', 'visa' => 'UAE residence visa', 'visa_type' => 'Visa type',
              'driving_licence' => 'UAE driving licence', 'current_salary' => 'Current salary',
              'expected_salary' => 'Expected salary', 'years_of_experience' => 'Years of experience'] as $postKey => $label) {
        $value = field($input, $postKey, 250);
        if ($value !== '') $fields[$label] = $value;
    }
} else {
    $fields['Enquiry type'] = field($input, 'enquiry_type', 250);
}

$upload = $_FILES['attachment'] ?? null;
if (count($_FILES) > 1 || ($upload && is_array($upload['name'] ?? null))) {
    respond(422, ['success' => false, 'message' => 'Please attach one file only.']);
}
if ($upload && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) $upload = null;
if ($formType === 'careers' && !$upload) {
    respond(422, ['success' => false, 'message' => 'Please attach your CV as PDF, DOC or DOCX.']);
}
$uploadType = '';
$uploadName = '';
$uploadExt = '';
if ($upload) {
    if (($upload['error'] ?? -1) !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'] ?? '')) {
        respond(422, ['success' => false, 'message' => 'Upload failed. Please attach the file again.']);
    }
    if ($upload['size'] <= 0 || $upload['size'] > $maxUpload) {
        respond(422, ['success' => false, 'message' => 'Attachment must be between 1 byte and 10MB.']);
    }
    $uploadName = basename(str_replace('\\', '/', $upload['name']));
    $uploadName = preg_replace('/[\x00-\x1F\x7F";]/', '_', $uploadName);
    $uploadExt = strtolower(pathinfo($uploadName, PATHINFO_EXTENSION));
    $uploadType = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']);
    $types = [
        'pdf' => ['application/pdf'],
        'doc' => ['application/msword', 'application/CDFV2', 'application/x-ole-storage'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
    ];
    if (!isset($types[$uploadExt]) || !in_array($uploadType, $types[$uploadExt], true)) {
        respond(422, ['success' => false, 'message' => 'Only PDF, DOC and DOCX documents are accepted.']);
    }
    if ($uploadExt === 'docx') {
        if (!class_exists('ZipArchive')) respond(503, ['success' => false, 'message' => 'DOCX uploads are unavailable. Please use PDF.']);
        $zip = new ZipArchive();
        if ($zip->open($upload['tmp_name']) !== true) respond(422, ['success' => false, 'message' => 'Invalid DOCX document.']);
        $valid = $zip->locateName('[Content_Types].xml') !== false && $zip->locateName('word/document.xml') !== false;
        $zip->close();
        if (!$valid) respond(422, ['success' => false, 'message' => 'Invalid DOCX document.']);
        $uploadType = $types['docx'][0];
    }
}

if (!otpDirReady($otpDir)) respond(503, ['success' => false, 'message' => 'Verification is temporarily unavailable.']);
otpCleanup($otpDir, $otpTtl);

$token = bin2hex(random_bytes(24));
$code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$metaFile = $otpDir . '/' . $token . '.json';
$uploadPath = $otpDir . '/' . $token . '.upload';
$meta = [
    'form_type' => $formType,
    'fields' => $fields,
    'email' => $email,
    'name' => $name,
    'expires' => time() + $otpTtl,
    'attempts' => 0,
    'otp_hash' => hash_hmac('sha256', $code, (string) ($config['secret'] ?? '') . $token),
];
if ($upload) {
    if (!@rename($upload['tmp_name'], $uploadPath)) {
        respond(503, ['success' => false, 'message' => 'Could not store your attachment. Please try again.']);
    }
    $meta['upload_name'] = $uploadName;
    $meta['upload_type'] = $uploadType;
}
if (@file_put_contents($metaFile, json_encode($meta), LOCK_EX) === false) {
    @unlink($uploadPath);
    respond(503, ['success' => false, 'message' => 'Could not start verification. Please try again.']);
}

try {
    $mail = loadMailer($config);
    $mail->addAddress($email, $name);
    $mail->Subject = 'Your Pheladelfia verification code';
    $mail->isHTML(true);
    $mail->Body = otpEmailHtml($code, $formType === 'careers' ? 'job application' : 'enquiry');
    $mail->AltBody = 'Your verification code is ' . $code . '. It expires in 10 minutes.';
    $mail->send();
    respond(200, ['success' => true, 'needs_otp' => true, 'otp_token' => $token, 'otp_email' => $email]);
} catch (Throwable $e) {
    @unlink($metaFile);
    @unlink($uploadPath);
    error_log('Pheladelfia website form: OTP email failed.');
    respond(502, ['success' => false, 'message' => 'Could not send the verification code. Please try again or email nursery@pheladelfia.com.']);
}
