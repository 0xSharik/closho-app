/**
 * Converts raw server / network error messages into friendly,
 * human-readable strings that are safe to show directly to users.
 */

const TECHNICAL_PATTERNS: Array<[RegExp | string, string]> = [
  // Auth - credentials
  [/invalid.*credentials/i,              'The email or password you entered is incorrect.'],
  [/incorrect.*password/i,               'The password you entered is incorrect.'],
  [/wrong.*password/i,                   'The password you entered is incorrect.'],
  [/user.*not.*found/i,                  "We couldn't find an account with that email."],
  [/account.*not.*found/i,               "We couldn't find an account with that email."],
  [/no.*user.*found/i,                   "We couldn't find an account with that email."],
  [/email.*not.*registered/i,            'This email address is not registered with us.'],
  [/phone.*not.*registered/i,            'This phone number is not registered with us.'],
  [/not.*registered/i,                   "We couldn't find an account with those details."],
  // Auth - registration
  [/email.*already.*exist/i,             'An account with this email already exists. Try logging in instead.'],
  [/email.*taken/i,                      'An account with this email already exists. Try logging in instead.'],
  [/phone.*already.*exist/i,             'An account with this phone number already exists. Try logging in instead.'],
  [/phone.*taken/i,                      'An account with this phone number already exists. Try logging in instead.'],
  [/account.*already.*exist/i,           'An account already exists. Try logging in instead.'],
  [/user.*already.*exist/i,              'An account already exists. Try logging in instead.'],
  [/duplicate.*entry/i,                  'An account already exists with these details. Try logging in instead.'],
  // Auth - OTP
  [/invalid.*otp/i,                      'The code you entered is incorrect. Please check and try again.'],
  [/otp.*expired/i,                      'Your verification code has expired. Please request a new one.'],
  [/otp.*not.*found/i,                   'Verification code not found. Please request a new one.'],
  [/expired.*otp/i,                      'Your verification code has expired. Please request a new one.'],
  [/otp.*incorrect/i,                    'The code you entered is incorrect. Please try again.'],
  [/too.*many.*otp/i,                    'Too many attempts. Please wait a moment and request a new code.'],
  [/max.*attempt/i,                      'Too many failed attempts. Please wait and try again.'],
  // Auth - tokens
  [/invalid.*token/i,                    'Your session has expired. Please start over.'],
  [/token.*expired/i,                    'Your session has expired. Please start over.'],
  [/reset.*token/i,                      'Your password reset link has expired. Please request a new one.'],
  // Auth - password
  [/password.*too.*short/i,              'Password must be at least 6 characters long.'],
  [/password.*weak/i,                    'Please choose a stronger password.'],
  [/password.*not.*match/i,              "Passwords don't match. Please check and try again."],
  // Network
  [/network.*error/i,                    'No internet connection. Please check your network and try again.'],
  [/econnrefused/i,                      'Unable to reach the server. Please try again in a moment.'],
  [/etimedout/i,                         'The request timed out. Please check your connection and try again.'],
  [/timeout/i,                           'The request timed out. Please try again.'],
  [/failed to fetch/i,                   'No internet connection. Please check your network and try again.'],
  [/network request failed/i,            'No internet connection. Please check your network and try again.'],
  [/socket hang up/i,                    'Connection lost. Please check your internet and try again.'],
  // Server errors
  [/internal.*server.*error/i,           'Something went wrong on our end. Please try again in a moment.'],
  [/service.*unavailable/i,              'Our servers are temporarily unavailable. Please try again shortly.'],
  [/bad.*gateway/i,                      'Our servers are temporarily unavailable. Please try again shortly.'],
  // Auth - Google
  [/google.*login.*failed/i,             'Google sign-in failed. Please try again.'],
  [/id.*token.*invalid/i,                'Google sign-in failed. Please try again.'],
  // Validation
  [/validation.*failed/i,                'Please check your details and try again.'],
  [/required.*field/i,                   'Please fill in all required fields.'],
];

const GENERIC_FALLBACK = 'Something went wrong. Please try again.';

export function friendlyError(rawError?: string | null, fallback?: string): string {
  if (!rawError) return fallback || GENERIC_FALLBACK;
  for (const [pattern, friendly] of TECHNICAL_PATTERNS) {
    if (typeof pattern === 'string') {
      if (rawError.toLowerCase().includes(pattern.toLowerCase())) return friendly;
    } else {
      if (pattern.test(rawError)) return friendly;
    }
  }
  // Show raw message if it looks safe and human-readable
  const isSafe =
    rawError.length < 120 &&
    !/at\s+\w+\s*\(/.test(rawError) &&
    !/\.(js|ts|tsx):\d+/.test(rawError) &&
    !/^\s*\{/.test(rawError);
  if (isSafe) return rawError;
  return fallback || GENERIC_FALLBACK;
}
