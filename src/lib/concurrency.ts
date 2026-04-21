import pLimit from 'p-limit';

/**
 * Concurrency cap on classifier calls. Decision in research R9: 5 concurrent
 * calls in both prototype and production. At ~200 ms per call the last-7-days
 * rule-rerun window (~150 notes) completes in ~6 seconds — comfortably under
 * the 30-second SC-003 SLA.
 *
 * Using a singleton so rule re-runs and the boot-time pass share the same
 * budget when they happen to overlap.
 */
export const CLASSIFIER_CONCURRENCY = 5;
export const classifierLimit = pLimit(CLASSIFIER_CONCURRENCY);
