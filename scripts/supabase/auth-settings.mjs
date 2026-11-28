// Sign-in settings for the live Supabase project, applied by connect.mjs through Supabase's
// Management API (PATCH /v1/projects/{ref}/config/auth). supabase/config.toml holds the same
// choices for local test runs; tests/accounts-config.test.mjs checks that the two agree.
//
// The choices, in plain words:
// - Sign in with a 6-digit code sent by email, valid for 15 minutes. No passwords are asked for.
// - Sign-up stays on, but the "before user created" hook (private.before_user_created) lets a new
//   account be made only with a working invite code, or by the founder's email.
// - Email goes through Resend, from the address in EMAIL_FROM (on a domain verified in Resend).
// - An email address must be confirmed by its code before the account can be used.
export const SITE = 'https://tandemroads.com';

export const AUTH = {
  site_url: SITE,
  uri_allow_list: `${SITE}/**`,
  disable_signup: false,
  external_email_enabled: true,
  external_anonymous_users_enabled: false,
  external_phone_enabled: false,
  mailer_autoconfirm: false,
  mailer_allow_unverified_email_sign_ins: false,
  mailer_secure_email_change_enabled: true,
  mailer_otp_exp: 900,
  mailer_otp_length: 6,
  smtp_max_frequency: 60,
  rate_limit_email_sent: 30,
  jwt_exp: 3600,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,
  hook_before_user_created_enabled: true,
  hook_before_user_created_uri: 'pg-functions://postgres/private/before_user_created',
  mailer_subjects_magic_link: 'Your Tandem Roads code: {{ .Token }}',
  mailer_subjects_confirmation: 'Your Tandem Roads code: {{ .Token }}',
};

// The email template file used for both the sign-in and the first-time (confirmation) email.
export const TEMPLATE = 'supabase/templates/sign-in-code.html';

// Resend's SMTP relay. The password is the Resend API key (secret RESEND_API_KEY).
export const SMTP = {
  smtp_host: 'smtp.resend.com',
  smtp_port: '465',
  smtp_user: 'resend',
  smtp_sender_name: 'Tandem Roads',
};
export const DEFAULT_FROM = 'hello@mail.tandemroads.com';
