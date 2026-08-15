export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl: string;
  displayUrl: string;
  error?: string;
}

export function validateAndNormalizeUrl(rawInput: string): UrlValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalizedUrl: '',
      displayUrl: '',
      error: "Please enter a website URL.",
    };
  }

  // Remove common accidental leading/trailing spaces, special symbols
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname;

    // Reject invalid hostnames without at least one dot or localhost
    if (!hostname.includes('.') && hostname !== 'localhost') {
      return {
        isValid: false,
        normalizedUrl: '',
        displayUrl: trimmed,
        error: "That doesn't look like a website.",
      };
    }

    // Check private/local addresses if needed
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      return {
        isValid: false,
        normalizedUrl: '',
        displayUrl: trimmed,
        error: "TRACE cannot reach this private address.",
      };
    }

    const displayUrl = parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '');

    return {
      isValid: true,
      normalizedUrl: parsed.origin + parsed.pathname,
      displayUrl,
    };
  } catch {
    return {
      isValid: false,
      normalizedUrl: '',
      displayUrl: trimmed,
      error: "That doesn't look like a website.",
    };
  }
}
