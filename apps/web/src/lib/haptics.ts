/** Short vibration as tap feedback where supported (not on iOS Safari). */
export function tapFeedback(): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(12);
  } catch {
    // unsupported or blocked
  }
}
