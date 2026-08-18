// Feedback text and customer names are interpolated straight into email HTML.
// The feedback text in particular comes from an unauthenticated public page
// (app/feedback/[token]), so it must be escaped before going into markup.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
