/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * LLM-as-Judge Evaluator
 *
 * Uses an LLM as a judge to evaluate output quality across configurable dimensions.
 * Rubrics are provided by the application via llmEvalConfig.
 * Supports configurable scoring scales, optional rubrics (N/A), and multimodal images.
 *
 * Returns one EvaluationResult per rubric dimension so each dimension
 * is reported separately with its own score and reasoning.
 */

import { formatError } from "../formatError.js";
import type { ILLMClient } from "../llmTypes.js";
import type { EvaluationResult } from "../resultTypes.js";

import type { IEvaluator, EvaluationContext } from "./evaluatorTypes.js";
import {
	buildSystemPrompt,
	buildUserPrompt,
	parseScores,
	parseAdditionalFields,
} from "./prompts.js";

const FALLBACK_SCORE = 0;

/**
 * LLM As Judge Evaluator
 * @legacy
 * @alpha
 */
export class LlmAsJudgeEvaluator implements IEvaluator {
	readonly #client: ILLMClient;

	constructor(client: ILLMClient) {
		this.#client = client;
	}

	async evaluate(context: EvaluationContext): Promise<EvaluationResult[]> {
		const rubrics = context.rubrics;
		if (rubrics.length === 0) return []; // No rubrics → nothing to judge, skip LLM call
		const startTime = Date.now();
		try {
			const hasImages = (context.images?.length ?? 0) > 0;
			const systemPrompt = buildSystemPrompt(
				rubrics,
				context.dataInterpretationPrompt,
				context.defaultScale,
				hasImages,
				context.additionalFields,
			);
			const userPrompt = buildUserPrompt(context);

			const llmResponse = await this.#client.chatCompletion([
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			]);
			const response = llmResponse.content;

			const parsed = parseScores(response, rubrics, context.defaultScale);
			const additionalFields = parseAdditionalFields(response, context.additionalFields);
			const executionTimeMs = Date.now() - startTime;

			if (parsed === undefined) {
				return rubrics.map((rubric) => ({
					rubricName: rubric.name,
					score: rubric.optional === true ? undefined : FALLBACK_SCORE,
					reasoning:
						rubric.optional === true
							? `Failed to parse LLM response. Score is N/A for optional rubric.\nRaw LLM response:\n${response}`
							: `Failed to parse LLM response. Fallback score applied.\nRaw LLM response:\n${response}`,
					executionTimeMs,
					...(additionalFields === undefined ? {} : { additionalFields }),
				}));
			}

			return rubrics.map((rubric) => {
				const entry: { score: number | undefined; reasoning: string } | undefined =
					parsed[rubric.name];
				return {
					rubricName: rubric.name,
					score: entry?.score,
					reasoning: entry?.reasoning ?? "No score provided",
					executionTimeMs,
					...(additionalFields === undefined ? {} : { additionalFields }),
				};
			});
		} catch (error) {
			const wrapped = new Error("LLM evaluation failed", { cause: error });
			context.logger.error(formatError(wrapped));
			const executionTimeMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			return rubrics.map((rubric) => ({
				rubricName: rubric.name,
				score: rubric.optional === true ? undefined : 0,
				reasoning: `Evaluation error: ${errorMessage}`,
				executionTimeMs,
			}));
		}
	}
}
