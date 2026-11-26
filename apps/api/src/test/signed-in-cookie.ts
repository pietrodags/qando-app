import type { Auth } from '../modules/auth/auth.js';

/**
 * Signs the email in with a code, made straight by the sign-in library so no email is sent, and
 * answers the `Cookie` header its browser sends back.
 */
export async function signedInCookie(auth: Auth, email: string): Promise<string> {
  const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
  const { headers } = await auth.api.signInEmailOTP({
    body: { email, otp },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
