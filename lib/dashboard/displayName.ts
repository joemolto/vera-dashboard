/**
 * Derive a guessed first name from an email address.
 *
 * Strategy:
 *   1. Take everything before "@"
 *   2. Strip Gmail-style "+tag" (jane+test@... → jane)
 *   3. If the local part contains "." or "-", take the first chunk
 *      (john.smith → john, j-smith → j)
 *   4. Capitalise the first letter
 *
 * Used as the final fallback when user_metadata has no first_name set —
 * a name like "Jane" or "John" lands ~80% of the time for real B2B emails.
 * Customer can always override in Settings → Account.
 */
export function deriveFirstNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const localPart = email.split("@")[0] ?? "";
  if (!localPart) return "";

  // Strip +tag
  const withoutTag = localPart.split("+")[0] ?? "";

  // Take first chunk before . or -
  const firstChunk = withoutTag.split(/[.\-_]/)[0] ?? "";
  if (!firstChunk) return "";

  return firstChunk.charAt(0).toUpperCase() + firstChunk.slice(1).toLowerCase();
}
