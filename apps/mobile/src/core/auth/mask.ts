export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return email; // Return as-is if invalid format
  }

  // Always show first char, 5 dots, last char
  const first = localPart[0];
  const last = localPart[localPart.length - 1];
  return `${first}•••••${last}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (!phone) {
    return phone;
  }

  // Remove all non-digit characters and trim whitespace
  let digits = phone.trim().replace(/\D/g, '');
  
  if (digits.length === 0) {
    return phone; // Return as-is if no digits
  }

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
      // We take up to 3 digits for country code but ensure at least 2 digits remain
      const countryCodeLength = Math.min(3, digits.length - 2);
      countryCode = digits.slice(0, countryCodeLength);
      nationalNumber = digits.slice(countryCodeLength);
    }
  } 
  // Handle 00 prefix (international access code) - treat as if it had a +
  else if (digits.startsWith('00') && digits.length > 2) {
    // Remove the 00
    digits = digits.slice(2);
    // Check if it's an Indian number: now starts with 91 followed by exactly 10 digits
    if (digits.length >= 5 && digits.startsWith('0091') && digits.length === 14) {
      countryCode = '91';
      nationalNumber = digits.slice(4);
    } else {
      // General case: take first 1-3 digits as country code, rest as national number
      // We take up to 3 digits for country code but ensure at least 2 digits remain
      const countryCodeLength = Math.min(3, digits.length - 2);
      countryCode = digits.slice(0, countryCodeLength);
      nationalNumber = digits.slice(countryCodeLength);
    }
  }
  // Otherwise, treat as national number only (no country code)
  // But check if it's a 10-digit number (likely a local number without country code)
  else if (digits.length === 10) {
    // No country code, just a 10-digit number
    nationalNumber = digits;
  }

  // Determine how many digits to show based on national number length
  // For 10-digit national numbers (standard format), show last 4 digits
  // For other lengths, show last 7 digits
  const showLastCount = nationalNumber.length === 10 ? 4 : 7;
  const visibleLength = Math.min(showLastCount, nationalNumber.length);
  const visibleStart = nationalNumber.length - visibleLength;
  const visiblePart = nationalNumber.slice(visibleStart);

  // Format result
  const countryCodePart = countryCode ? `+${countryCode}` : '';
  const separator = countryCodePart ? ' ' : '';
  
  return `${countryCodePart}${separator}••••• ${visiblePart}`;
}