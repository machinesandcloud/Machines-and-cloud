// PM real-model measurement, 2026-10-21: no_address precision was 5/9 (55.56%), below
// S8-05's 80% threshold. Keep its raw stamp, but only the other measured reasons need attention.
const ACTIONABLE_REASONS = new Set(["price_not_listed", "exact_time_promised", "tier0_missed", "no_callback_window", "spanish_mishandled", "question_unanswered"]);

export function actionableAuditReasons(data) {
  return !data?.test && Array.isArray(data?.reasons) ? data.reasons.filter((reason) => ACTIONABLE_REASONS.has(reason)) : [];
}

export const auditNeedsAttention = (data) => actionableAuditReasons(data).length > 0;
