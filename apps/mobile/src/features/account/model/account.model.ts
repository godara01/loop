/**
 * Model for account linking logic.
 * Contains pure functions that can be unit tested.
 */

/**
 * Check if the user is linked (not anonymous)
 */
export const isLinked = (providerData: string[]): boolean => {
  // In a real app, we would check Firebase currentUser.isAnonymous
  // For this model, we assume that if providerData has any non-anonymous providers, we are linked.
  // However, note: the anonymous user has providerData with ['anonymous']? Actually, Firebase anonymous auth does not show in providerData.
  // We'll rely on the caller to pass the correct state.
  return providerData.length > 0;
};

/**
 * Get masked email for display
 */
export const getMaskedEmail = (email: string): string => {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;
  const first = localPart[0];
  const last = localPart[localPart.length - 1];
  return `${first}•••••${last}@${domain}`;
};

/**
 * Get masked phone number for display
 */
export const getMaskedPhone = (phone: string): string => {
  if (!phone) return phone;
  // Remove all non-digit characters and trim whitespace
  let digits = phone.trim().replace(/\D/g, '');
  if (digits.length === 0) return phone;

  let countryCode = '';
  let nationalNumber = digits;
  const hasPlus = phone.trim().startsWith('+');

  // Handle explicit Indian country code (91) - highest priority
  if (digits.startsWith('91') && digits.length === 12) {
    countryCode = '91';
    nationalNumber = digits.slice(2);
  }
  // Handle plus sign
  else if (hasPlus) {
    // Check if it's an Indian number: +91 followed by exactly 10 digits
    if (digits.length >= 3 && digits.startsWith('91') && digits.length === 12) {
      countryCode = '91';
      nationalNumber = digits.slice(2);
    } else {
      // General case: take first 1-3 digits as country code, rest as national number
      const countryCodeLength = Math.min(3, digits.length - 2);
      countryCode = digits.slice(0, countryCodeLength);
      nationalNumber = digits.slice(countryCodeLength);
    }
  }
  // Handle 00 prefix (international access code) - treat as if it had a +
  else if (digits.startsWith('00') && digits.length > 2) {
    // Remove the 00
    digits = digits.slice(2);
    // Recurse
    return getMaskedPhone(`+${digits}`);
  }

  // Format: country code + space + first 5 digits masked + last 4 digits
  // Example: +91 ••••• •4321
  if (nationalNumber.length >= 9) {
    const firstPart = nationalNumber.slice(0, 5);
    const lastPart = nationalNumber.slice(-4);
    return `${countryCode ? `+${countryCode} ` : ''}••••• ${lastPart}`;
  }

  // Fallback: show last 4 digits
  const lastPart = nationalNumber.slice(-4);
  return `${countryCode ? `+${countryCode} ` : ''}••••• ${lastPart}`;
};

/**
 * OTP resend countdown logic
 * Returns the remaining time in seconds for resend OTP
 * @param startTime - timestamp when the OTP was sent
 * @param cooldown - cooldown period in seconds (default 30)
 */
export const getOtpResendCountdown = (startTime: number, cooldown: number = 30): number => {
  const elapsed = (Date.now() - startTime) / 1000;
  const remaining = cooldown - Math.floor(elapsed);
  return Math.max(0, remaining);
};

/**
 * Check if OTP resend is allowed
 */
export const canResendOtp = (startTime: number, cooldown: number = 30): boolean => {
  return getOtpResendCountdown(startTime, cooldown) === 0;
};

/**
 * OTP resend cooldown in seconds
 */
export const OTP_RESEND_COOLDOWN = 30;

/**
 * Switch confirmation logic
 * Validates that the user has typed exactly "SWITCH" (case-sensitive) to confirm
 * that they want to switch accounts (which will erase current device data)
 */
export const confirmSwitch = async (input: string): Promise<boolean> => {
  // Return true only if input is exactly "SWITCH" (case-sensitive)
  return input === 'SWITCH';
};