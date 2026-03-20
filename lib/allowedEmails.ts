/**
 * Checks if a GitHub username or email is in the pre-approved list.
 *
 * Configure via environment variables (comma-separated):
 *   ALLOWED_GITHUB_USERNAMES=alice,bob
 *   ALLOWED_EMAILS=alice@example.com,bob@example.com
 *
 * If neither is set, no one can sign in (secure by default).
 */
export function isGitHubUserAllowed(username: string, email: string | null): boolean {
  const allowedUsernames = parse(process.env.ALLOWED_GITHUB_USERNAMES);
  if (allowedUsernames.length > 0) {
    return allowedUsernames.includes(username.toLowerCase());
  }

  const allowedEmails = parse(process.env.ALLOWED_EMAILS);
  if (allowedEmails.length > 0 && email) {
    return allowedEmails.includes(email.toLowerCase());
  }

  return false;
}

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
