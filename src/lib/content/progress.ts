/** Watch-progress rules shared by the UI and the server. */
import { COMPLETED_THRESHOLD } from "@/lib/constants";

/**
 * A title (or episode) counts as watched once progress reaches COMPLETED_THRESHOLD (90%), so
 * end credits don't stop it counting. Derived, never stored: SQL uses `progress_percent >= 90`.
 */
export function isCompleted(progressPercent: number): boolean {
  return progressPercent >= COMPLETED_THRESHOLD;
}
