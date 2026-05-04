/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utility functions for working with evaluation results.
 */

import type { EvaluationResult } from "./resultTypes.js";

/**
 * Convert a flat EvaluationResult[] array to a keyed record.
 * @legacy
 * @alpha
 *
 * Useful for consumers that need dimension scores keyed by rubric name
 * (e.g., `scores['visual_aesthetics'].score`) rather than searching an array.
 *
 * @example
 * ```typescript
 * const result = await framework.run({ scenario });
 * const scores = evalResultAsRecord(result.datasetResults[0].evalResult);
 * console.log(scores['visual_aesthetics'].score); // 8
 * console.log(scores['visual_aesthetics'].reasoning); // "Good color harmony..."
 * ```
 */
export function evalResultAsRecord(
	results: EvaluationResult[],
): Record<string, { score: number | undefined; reasoning: string }> {
	return Object.fromEntries(
		results.map((r) => [r.rubricName, { score: r.score, reasoning: r.reasoning }]),
	);
}
