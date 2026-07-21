/**
 * Read-only compatibility for assistant messages persisted before external
 * citation middleware finalized its protocol markers before state updates.
 * New messages must never rely on this projection and can delete it after old
 * checkpoints have aged out or been migrated.
 */
const LEGACY_CITATION_MARKER_RE = /<!--\s*CITATIONS:[A-Za-z0-9_-]+\s*-->/g;
const LEGACY_CITATION_ANCHOR_RE = /<a>\s*\[\d+\]\s*<\/a>/gi;
const LEGACY_CITATION_SOURCE_BLOCK_RE =
  /\n{2,}(?:---\s*\n+)?引用来源[:：]\s*\n(?:\s*\[\d+\][^\n]*(?:\n|$))+(?=\s*(?:<!--(?:\s*CITATIONS(?::[A-Za-z0-9_-]*)?)?|$))/gi;
const LEGACY_TRAILING_PLACEHOLDER_RE =
  /(?:<a(?:>\s*(?:\[\s*\d*\s*(?:\]\s*(?:<\/?a?)?)?)?)?|<!--(?:\s*CITATIONS(?::[A-Za-z0-9_-]*)?)?)$/i;

export function stripLegacyCitationArtifacts(content: string): string {
  return content
    .replace(LEGACY_CITATION_SOURCE_BLOCK_RE, "")
    .replace(LEGACY_CITATION_MARKER_RE, "")
    .replace(LEGACY_CITATION_ANCHOR_RE, "")
    .replace(LEGACY_TRAILING_PLACEHOLDER_RE, "")
    .trim();
}
