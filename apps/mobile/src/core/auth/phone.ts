export function normalizePhone(input: string, defaultCountry = 'IN'): string | null {
  if (!input) {
    return null;
  }

  // The field starts as "+91", so a typed or pasted "+91…" number arrives as
  // "+91+91…". Drop the prefilled prefix when another "+" follows it; any
  // other second "+" is malformed.
  const trimmed = input.trim().replace(/^\+91[\s-]*(?=\+)/, '');
  if (trimmed === '') {
    return null;
  }
  if (trimmed.indexOf('+', 1) !== -1) {
    return null;
  }

  // Remove all non-digit characters. A doubled Indian country code with a
  // full 10-digit number ("91 91 98765 43210") is the same slip without the
  // second "+": keep one. 14 digits is never a valid +91 number.
  let digitsOnly = trimmed.replace(/\D/g, '');
  if (defaultCountry.toUpperCase() === 'IN' && digitsOnly.length === 14 && digitsOnly.startsWith('9191')) {
    digitsOnly = digitsOnly.slice(2);
  }
  
  if (digitsOnly.length === 0) {
    return null; // No digits at all
  }

  const hasPlus = trimmed.startsWith('+');
  let countryCode: string;
  
  // Get country code based on defaultCountry
  switch (defaultCountry.toUpperCase()) {
    case 'IN':
      countryCode = '91';
      break;
    default:
      // Only support IN for now as per requirement
      return null;
  }

  // Case 1: Input already has a plus sign
  if (hasPlus) {
    // For plus numbers, we expect the format: +[country code][national number]
    // Remove the + and validate
    const digitsWithoutPlus = digitsOnly;
    
    // Check if it looks like an Indian number with country code
    if (digitsWithoutPlus.startsWith(countryCode) && 
        digitsWithoutPlus.length === countryCode.length + 10) { // 91 + 10 digits
      // Validate total length with + is reasonable
      const fullWithPlus = '+' + digitsWithoutPlus;
      if (fullWithPlus.length >= 2 && fullWithPlus.length <= 16) {
        return fullWithPlus;
      }
    } 
    // A +91 number is exactly 10 national digits; anything else under +91 is wrong.
    else if (digitsWithoutPlus.startsWith(countryCode)) {
      return null;
    }
    // For other international numbers, accept if total length is reasonable
    else if (digitsWithoutPlus.length >= 2 && digitsWithoutPlus.length <= 15) {
      return '+' + digitsWithoutPlus;
    }
    return null;
  }

  // Case 2: Input starts with country code but no plus (e.g., "919876543210")
  if (digitsOnly.startsWith(countryCode) && 
      digitsOnly.length === countryCode.length + 10) { // 91 + 10 digits for IN
    // Validate total length if we were to add a plus
    const fullWithPlus = '+' + digitsOnly;
    if (fullWithPlus.length >= 2 && fullWithPlus.length <= 16) {
      return fullWithPlus;
    }
    return null;
  }

  // Case 3: Input is just the national number (e.g., "9876543210")
  // For India, national number should be exactly 10 digits
  if (defaultCountry.toUpperCase() === 'IN' && digitsOnly.length === 10) {
    const fullWithCountryCode = countryCode + digitsOnly;
    const fullWithPlus = '+' + fullWithCountryCode;
    if (fullWithPlus.length >= 2 && fullWithPlus.length <= 16) {
      return fullWithPlus;
    }
    return null;
  }

  // If none of the above patterns match, it's not a valid number for our default country
  return null;
}