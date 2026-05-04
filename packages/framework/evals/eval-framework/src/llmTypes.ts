/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Supported image MIME types.
 * @legacy
 * @alpha
 */
export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * A plain text content block.
 * @legacy
 * @alpha
 */
export interface TextContent {
	type: "text";
	text: string;
}

/**
 * A base64-encoded image content block.
 * @legacy
 * @alpha
 */
export interface ImageContent {
	type: "image";
	mediaType: ImageMediaType;
	data: string; // base64-encoded
}

/**
 * A content block — either text or an image.
 * @legacy
 * @alpha
 */
export type ContentBlock = TextContent | ImageContent;

/**
 * Chat message for LLM requests.
 * Content can be a plain string (text-only) or an array of content blocks (multimodal).
 * @legacy
 * @alpha
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string | ContentBlock[];
}

/**
 * Response from an LLM call.
 * @legacy
 * @alpha
 */
export interface LLMResponse {
	content: string;
}

/**
 * LLM client interface for chat completions.
 * Implementers must handle both string and ContentBlock[] content in messages.
 * @legacy
 * @alpha
 */
export interface ILLMClient {
	chatCompletion(messages: ChatMessage[]): Promise<LLMResponse>;
}

/**
 * Parsed scores from LLM response — keyed by rubric name.
 */
export type ParsedScores = Record<string, { score: number | undefined; reasoning: string }>;
