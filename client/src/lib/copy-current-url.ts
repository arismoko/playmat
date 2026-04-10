export async function copyCurrentUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    // Ignore clipboard failures in unsupported or restricted contexts.
  }
}
