// A callsign is how a star appears in chat: an anonymous alias, chosen by
// the visitor, never proof of a real person. Validation is pure and
// DB-free here so it can be unit-tested directly; src/db.ts enforces
// uniqueness and the cooldown against storage.

const MIN_LENGTH = 3;
const MAX_LENGTH = 16;

// Letters, numbers, a plain space, hyphens and underscores only — nothing
// else, including a line break, tab or other whitespace. This allowlist is
// checked against the raw, merely-trimmed value (see isValidCallsignFormat),
// never against a value that has already had its internal whitespace
// collapsed: collapsing first would launder a "\n" into an accepted " "
// before the check ever saw it.
const ALLOWED_CHARS = /^[A-Za-z0-9 _-]+$/;

// Reserved so a visitor can never appear to speak for the system or for
// moderation that does not exist.
export const RESERVED_CALLSIGNS = ["admin", "administrator", "system", "moderator", "overlap", "support", "staff"];

export const CALLSIGN_RULES =
  `${MIN_LENGTH}-${MAX_LENGTH} characters: letters, numbers, spaces, hyphens and underscores only.`;

// Collapses a run of plain spaces to one. Only ever called on a value that
// has already passed isValidCallsignFormat, so it is known to contain
// nothing but letters, digits, spaces, hyphens and underscores already —
// this never has a line break or other whitespace to launder.
function collapseSpaces(value: string): string {
  return value.replace(/ {2,}/g, " ");
}

// The display form: outer whitespace trimmed, runs of internal spaces
// collapsed to one, casing and the visitor's own spelling otherwise kept.
// Call only after isValidCallsignFormat has accepted the raw value.
export function trimCallsign(value: string): string {
  return collapseSpaces(value.trim());
}

// The form uniqueness and the reserved-word check compare against: trimmed,
// whitespace-collapsed, lower-cased. "Night Owl", "night  owl" and "NIGHT
// OWL" all normalise to the same value and so collide with each other.
export function normalizeCallsign(value: string): string {
  return trimCallsign(value).toLowerCase();
}

export function isValidCallsignFormat(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Plain trim only, deliberately not collapsed yet: a line break, tab or
  // other control/invisible character hiding between two words must still
  // fail ALLOWED_CHARS here, not be rewritten into a space first.
  const trimmed = value.trim();
  if (trimmed.length < MIN_LENGTH || trimmed.length > MAX_LENGTH) return false;
  if (!ALLOWED_CHARS.test(trimmed)) return false;
  return true;
}

export function isReservedCallsign(value: string): boolean {
  return RESERVED_CALLSIGNS.includes(normalizeCallsign(value));
}
