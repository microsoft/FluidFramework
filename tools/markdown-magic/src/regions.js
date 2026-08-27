/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const markdownMarkerPattern = /^<!-- markdown-magic:(begin(?: (\{.*\}))?|end) -->$/s;
const mdxMarkerPattern = /^\/\* markdown-magic:(begin(?: (\{.*\}))?|end) \*\/$/s;

/**
 * Creates a marker error with its source location.
 *
 * @param {string} filePath - The document path.
 * @param {number} line - The one-based source line.
 * @param {string} message - The error details.
 * @returns {Error} The location-aware error.
 */
function markerError(filePath, line, message) {
	return new Error(`${filePath}:${line}: ${message}`);
}

/**
 * Parses a top-level syntax-tree node as a generated-region marker.
 *
 * @param {import("mdast").RootContent} node - The node to inspect.
 * @param {"markdown" | "mdx"} format - The document format.
 * @returns {{ kind: "begin"; line: number; startOffset: number; endOffset: number; json: string } | { kind: "end" | "invalid-begin"; line: number; startOffset: number; endOffset: number } | undefined} The marker details, or `undefined` if the node is not a marker.
 */
function parseMarkerNode(node, format) {
	const isMarkdownMarker = format === "markdown" && node.type === "html";
	const isMdxMarker = format === "mdx" && node.type === "mdxFlowExpression";
	if (!isMarkdownMarker && !isMdxMarker) {
		return undefined;
	}

	const pattern = format === "markdown" ? markdownMarkerPattern : mdxMarkerPattern;
	const match = pattern.exec(node.value);
	if (match === null) {
		return undefined;
	}

	const line = node.position?.start.line;
	const startOffset = node.position?.start.offset;
	const endOffset = node.position?.end.offset;
	if (line === undefined || startOffset === undefined || endOffset === undefined) {
		throw new Error("Generated marker nodes must contain source positions.");
	}

	if (match[1] === "end") {
		return { kind: "end", line, startOffset, endOffset };
	}

	if (match[2] === undefined) {
		return { kind: "invalid-begin", line, startOffset, endOffset };
	}

	return {
		kind: "begin",
		line,
		startOffset,
		endOffset,
		json: match[2],
	};
}

/**
 * Finds and validates generated regions in document order.
 *
 * Only top-level comment nodes can define regions. Generated regions cannot nest.
 *
 * @param {{ format: "markdown" | "mdx"; path: string; tree: import("mdast").Root }} document - The parsed destination document.
 * @returns {{ destinationPath: string; destinationFormat: "markdown" | "mdx"; transformName: string; options: Record<string, unknown>; openingMarkerEnd: number; closingMarkerStart: number; line: number }[]} The validated generated regions.
 * @throws If a marker or marker pair is invalid.
 */
export function findGeneratedRegions(document) {
	const regions = [];
	let openingMarker;

	for (const node of document.tree.children) {
		const marker = parseMarkerNode(node, document.format);
		if (marker === undefined) {
			continue;
		}

		if (marker.kind === "invalid-begin") {
			throw markerError(document.path, marker.line, "Opening marker requires JSON options.");
		}

		if (marker.kind === "begin") {
			if (openingMarker !== undefined) {
				throw markerError(document.path, marker.line, "Generated regions must not nest.");
			}

			let options;
			try {
				options = JSON.parse(marker.json);
			} catch {
				throw markerError(document.path, marker.line, "Invalid marker JSON.");
			}
			if (options === null || Array.isArray(options) || typeof options !== "object") {
				throw markerError(document.path, marker.line, "Marker options must be a JSON object.");
			}
			if (typeof options.transform !== "string" || options.transform.length === 0) {
				throw markerError(
					document.path,
					marker.line,
					'Marker options require a non-empty "transform" string.',
				);
			}

			const { transform, ...transformOptions } = options;
			openingMarker = {
				transformName: transform,
				options: transformOptions,
				line: marker.line,
				endOffset: marker.endOffset,
			};
			continue;
		}

		if (openingMarker === undefined) {
			throw markerError(document.path, marker.line, "Closing marker has no opening marker.");
		}

		regions.push({
			destinationPath: document.path,
			destinationFormat: document.format,
			transformName: openingMarker.transformName,
			options: openingMarker.options,
			openingMarkerEnd: openingMarker.endOffset,
			closingMarkerStart: marker.startOffset,
			line: openingMarker.line,
		});
		openingMarker = undefined;
	}

	if (openingMarker !== undefined) {
		throw markerError(document.path, openingMarker.line, "Missing closing marker.");
	}

	return regions;
}
