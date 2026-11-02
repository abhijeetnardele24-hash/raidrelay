import type { VoteChoice } from '@raidrelay/contracts';

/**
 * Escapes characters to prevent HTML/script injection into overlay or dashboard DOM.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes and bounds arbitrary text input (strips control characters, normalizes whitespace).
 */
export function sanitizeText(text: string, maxLength: number): string {
  if (!text || typeof text !== 'string') return '';
  // Strip non-printable ASCII / control characters except common space
  const cleaned = text
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return cleaned.slice(0, maxLength);
}

/**
 * Strictly parses incoming chat text for `!relay A` or `!relay B`.
 * Rejects all free-form text, other commands, or multi-character choices.
 */
export function parseVoteCommand(messageText: string): VoteChoice | null {
  if (!messageText || typeof messageText !== 'string') return null;

  const trimmed = messageText.trim();
  // Case-insensitive match for !relay A or !relay B with optional leading/trailing whitespace
  const match = trimmed.match(/^!relay\s+([a-bA-B])$/i);
  if (!match) return null;

  const choice = match[1].toUpperCase();
  if (choice === 'A' || choice === 'B') {
    return choice;
  }
  return null;
}

