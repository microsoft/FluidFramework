/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * LLM Prompt Builders and Score Parsing
 *
 * Builds system and user prompts for LLM-as-judge evaluation.
 * Rubrics and data interpretation are provided by the application via llmEvalConfig.
 * Scoring scale is configurable at the scenario level via defaultScale (default 0-5).
 */

import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

import { DEFAULT_SCALE } from "../artifactTypes.js";
import type {
	AdditionalFieldConfig,
	ImageInput,
	Rubric,
	ScoreScale,
} from "../artifactTypes.js";
import type { ImageMediaType, ContentBlock, ParsedScores } from "../llmTypes.js";

import type { EvaluationContext } from "./evaluatorTypes.js";

const DEFAULT_DATA_INTERPRETATION_PROMPT =
	"You are evaluating a system that takes structured input and produces structured output. The input describes what was requested. The output is what the system generated.";

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build the scoring scale text for the given scale.
 */
function buildScoringScale(scale: ScoreScale): string {
	const { min, max } = scale;

	return `## Scoring Scale (applies to all dimensions)

Score each dimension from ${min} to ${max}. Base your score on observable, countable evidence in the output.

- ${min}: No evidence — the output is empty or completely unrelated to the input
- ${max}: Complete — all identifiable requirements are fully addressed

Use the full range. If a dimension's description includes its own scoring criteria, use those criteria.`;
}

/**
 * Build a numbered rubric line for one dimension.
 */
function buildRubricLine(rubric: Rubric, index: number): string {
	const suffix = rubric.optional === true ? " *(may be N/A)*" : "";
	return `${index + 1}. **${rubric.name}**: ${rubric.description}${suffix}`;
}

/**
 * Build the response format section from the rubric names.
 */
function buildResponseFormat(
	rubrics: Rubric[],
	scale: ScoreScale,
	additionalFields?: AdditionalFieldConfig[],
): string {
	const { min, max } = scale;
	const lines = [
		"## Response Format",
		"",
		"Respond with exactly one line per dimension in this format:",
		"",
	];
	for (const rubric of rubrics) {
		if (rubric.optional === true) {
			lines.push(
				`${rubric.name} - Reasoning: <brief factual justification>, Score: <${min}-${max} or N/A>`,
			);
		} else {
			lines.push(
				`${rubric.name} - Reasoning: <brief factual justification>, Score: <${min}-${max}>`,
			);
		}
	}
	lines.push("");

	if (additionalFields && additionalFields.length > 0) {
		lines.push(
			"After ALL dimension lines, include these additional fields on separate lines:",
		);
		lines.push("");
		for (const field of additionalFields) {
			lines.push(`${field.name}: <${field.description}>`);
		}
		lines.push("");
	}

	lines.push(
		"IMPORTANT: Write the reasoning FIRST, then derive the score from your reasoning.",
	);
	return lines.join("\n");
}

/**
 * Build the system prompt for evaluation.
 */
export function buildSystemPrompt(
	rubrics: Rubric[],
	dataInterpretationPrompt?: string,
	defaultScale?: ScoreScale,
	hasImages?: boolean,
	additionalFields?: AdditionalFieldConfig[],
): string {
	const interpretation = dataInterpretationPrompt ?? DEFAULT_DATA_INTERPRETATION_PROMPT;
	const scale = defaultScale ?? DEFAULT_SCALE;

	const rubricList = rubrics.map(buildRubricLine).join("\n");
	const scoringScale = buildScoringScale(scale);
	const responseFormat = buildResponseFormat(rubrics, scale, additionalFields);

	const imageInstruction =
		hasImages === true
			? "\n- Images of the rendered output are provided. Use them to evaluate visual aspects such as layout, styling, and content presentation."
			: "";

	const optionalInstruction = rubrics.some((r) => r.optional === true)
		? "\n- If a dimension is marked as optional and is not applicable, respond with Score: N/A and explain why."
		: "";

	return `You are an evaluation judge. Your task is to score structured output against structured input on specific dimensions.

${interpretation}

## Instructions

- Score each dimension independently from ${scale.min} to ${scale.max}.
- If a dimension's description includes its own scoring criteria (e.g., percentage thresholds), use those criteria instead of the generic scale below.
- Base scores on concrete, observable evidence in the output — not on assumptions about intent.
- Reference specific elements from the input and output in your reasoning.
- If the input is ambiguous, score based on the most reasonable interpretation.${imageInstruction}${optionalInstruction}

${scoringScale}

## Dimensions to Evaluate

${rubricList}

${responseFormat}`;
}

// ============================================================================
// Multimodal Image Resolution
// ============================================================================

/** Maximum image file size (5 MB). */
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Infer image media type from file extension.
 * Throws for unsupported extensions.
 */
export function inferMediaType(filePath: string): ImageMediaType {
	const ext = extname(filePath).toLowerCase();
	switch (ext) {
		case ".png": {
			return "image/png";
		}
		case ".jpg":
		case ".jpeg": {
			return "image/jpeg";
		}
		case ".gif": {
			return "image/gif";
		}
		case ".webp": {
			return "image/webp";
		}
		default: {
			throw new Error(
				`Unsupported image extension "${ext}" for file: ${filePath}. Supported: .png, .jpg, .jpeg, .gif, .webp`,
			);
		}
	}
}

/**
 * Resolve an array of ImageInput values into ContentBlock[] for the LLM.
 */
export function resolveImages(images?: ImageInput[]): ContentBlock[] {
	if (!images || images.length === 0) {
		return [];
	}

	const blocks: ContentBlock[] = [];

	const desc =
		images.length === 1
			? "The following image shows the rendered output of the application."
			: `The following ${images.length} images show the rendered output of the application.`;
	blocks.push({ type: "text", text: `\n## Images\n${desc}` });

	for (let i = 0; i < images.length; i++) {
		const img = images[i];

		if (images.length > 1) {
			blocks.push({ type: "text", text: `[Image ${i + 1} of ${images.length}]` });
		}

		if (typeof img === "string") {
			const fileSize = statSync(img).size;
			if (fileSize > MAX_IMAGE_FILE_SIZE) {
				throw new Error(
					`Image file exceeds ${MAX_IMAGE_FILE_SIZE / (1024 * 1024)} MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB): ${img}`,
				);
			}
			const fileData = readFileSync(img);
			const mediaType = inferMediaType(img);
			blocks.push({ type: "image", mediaType, data: fileData.toString("base64") });
		} else {
			const decodedSize = Buffer.from(img.data, "base64").length;
			if (decodedSize > MAX_IMAGE_FILE_SIZE) {
				throw new Error(
					`Base64 image data exceeds ${MAX_IMAGE_FILE_SIZE / (1024 * 1024)} MB limit (${(decodedSize / (1024 * 1024)).toFixed(1)} MB)`,
				);
			}
			blocks.push({ type: "image", mediaType: img.mediaType, data: img.data });
		}
	}

	return blocks;
}

// ============================================================================
// User Prompt Building
// ============================================================================

/**
 * Build the user prompt with input/output data for evaluation.
 * Returns ContentBlock[] when images are present, plain string otherwise.
 */
export function buildUserPrompt(context: EvaluationContext): string | ContentBlock[] {
	const { input, output, images } = context;
	const lines: string[] = [];

	if (input !== undefined && Object.keys(input).length > 0) {
		lines.push("## Input");
		lines.push(JSON.stringify(input, undefined, 2));
		lines.push("");
	}

	lines.push("## Output");
	lines.push(JSON.stringify(output, undefined, 2));

	const imageBlocks = resolveImages(images);

	if (imageBlocks.length > 0) {
		const textBlock: ContentBlock = { type: "text", text: lines.join("\n") };
		return [textBlock, ...imageBlocks];
	}

	return lines.join("\n");
}

// ============================================================================
// Score Parsing
// ============================================================================

/**
 * Parse dimension scores from LLM response text.
 * Supports configurable score scales and optional (N/A) rubrics.
 *
 * @returns Parsed scores keyed by rubric name, or undefined if any required dimension is missing
 */
export function parseScores(
	response: string,
	rubrics: Rubric[],
	defaultScale?: ScoreScale,
): ParsedScores | undefined {
	const scores: ParsedScores = {};
	const { min, max } = defaultScale ?? DEFAULT_SCALE;

	for (const rubric of rubrics) {
		const escaped = rubric.name.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");

		if (rubric.optional === true) {
			// Constrain matching to a single rubric line by anchoring with (?:^|\n) and restricting reasoning capture
			const naPattern = new RegExp(
				`(?:^|\\n)${escaped}\\s*[-–—:]\\s*Reasoning:\\s*([^\\n]*)[,.]?\\s*Score:\\s*N\\/?A`,
				"im",
			);
			const naMatch = response.match(naPattern);
			if (naMatch) {
				scores[rubric.name] = {
					score: undefined,
					reasoning: naMatch[1].replace(/[,.]?\s*$/, "").trim(),
				};
				continue;
			}
		}

		// Constrain matching to a single rubric line by anchoring with (?:^|\n) and restricting reasoning capture
		const pattern = new RegExp(
			`(?:^|\\n)${escaped}\\s*[-–—:]\\s*Reasoning:\\s*([^\\n]*)[,.]?\\s*Score:\\s*(\\d+)`,
			"im",
		);
		const match = response.match(pattern);
		if (match === null) {
			if (rubric.optional === true) {
				scores[rubric.name] = { score: undefined, reasoning: "No score provided by judge" };
				continue;
			}
			return undefined;
		}
		const reasoning = match[1].replace(/[,.]?\s*$/, "").trim();
		const score = Math.max(min, Math.min(max, Number.parseInt(match[2], 10)));
		scores[rubric.name] = { score, reasoning };
	}

	return scores;
}

/**
 * Parse additional free-text fields from the LLM response.
 * Looks for lines matching `fieldName: <value>` after the rubric score lines.
 * Returns a record of field name → extracted text, or undefined if no fields configured.
 */
export function parseAdditionalFields(
	response: string,
	additionalFields?: AdditionalFieldConfig[],
): Record<string, string> | undefined {
	if (!additionalFields || additionalFields.length === 0) return undefined;

	const result: Record<string, string> = {};
	for (const field of additionalFields) {
		const escaped = field.name.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
		const pattern = new RegExp(`(?:^|\\n)${escaped}:\\s*(.+)`, "im");
		const match = response.match(pattern);
		if (match) {
			result[field.name] = match[1].trim();
		}
	}

	return Object.keys(result).length > 0 ? result : undefined;
}
