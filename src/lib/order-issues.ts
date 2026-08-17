/**
 * Orders that went wrong.
 *
 * A barista flags an order from the board the moment something goes sideways — wrong
 * drink, a remake, a card that wouldn't read — and the flag stays on the order forever.
 * That's the point: at the end of service you can pull up every order that had a problem
 * instead of trying to remember them.
 *
 * The flag is a timestamp, not a boolean, so a report can say *when* it happened.
 */

export interface IssueFields {
  issue_flagged_at?: string | null;
  issue_note?: string | null;
}

/** Quick taps, so flagging costs one press with a wet hand. Free text is still allowed. */
export const ISSUE_REASONS = [
  'Wrong drink made',
  'Remade / spilled',
  'Missing item',
  'Machine problem',
  'Payment problem',
  'Customer complaint',
  'Long wait',
] as const;

export function hasIssue(order: IssueFields): boolean {
  return Boolean(order.issue_flagged_at);
}

/**
 * The columns land in a migration, so the first thing a shop that hasn't run it sees is
 * a save failing. Say which file fixes it rather than showing the raw Postgres error.
 */
export function issueSaveError(error: { code?: string; message: string }): string {
  const missingColumn = error.code === '42703' || error.code === 'PGRST204';
  return missingColumn
    ? 'Issue tracking needs one more database change. Run supabase-order-issues.sql in the Supabase SQL editor, then try again.'
    : `Could not save the issue: ${error.message}`;
}

/**
 * Which of the quick reasons a note mentions, for counting on the dashboard.
 *
 * Notes are built by tapping reason chips, which comma-joins them, so a note usually
 * quotes one or more of them verbatim. Anything typed by hand still has to land in a
 * bucket rather than vanish from the tally — that's what the two fallbacks are for.
 */
export function issueReasons(note: string | null | undefined): string[] {
  const text = (note ?? '').trim();
  if (!text) return ['No reason given'];

  const matched = ISSUE_REASONS.filter((r) => text.toLowerCase().includes(r.toLowerCase()));
  return matched.length > 0 ? [...matched] : ['Written in by hand'];
}

export function formatIssueTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
