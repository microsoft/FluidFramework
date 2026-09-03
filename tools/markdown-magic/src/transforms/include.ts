/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GeneratedNodes, Transform, TransformContext } from "../types.js";

/**
 * Options shared by the file and code include transforms.
 */
interface IncludeOptions {
	/**
	 * The source path relative to the destination document.
	 */
	path: string;

	/**
	 * The zero-based, inclusive line index at which selection starts.
	 * A negative index counts backward from the end of the split source array.
	 *
	 * @defaultValue The first line.
	 */
	start: number | undefined;

	/**
	 * The zero-based, exclusive line index at which selection ends.
	 * A negative index counts backward from the end of the split source array.
	 *
	 * @defaultValue The end of the source.
	 */
	end: number | undefined;

	/**
	 * The fenced code language for a code include.
	 *
	 * @defaultValue No language identifier.
	 */
	language?: string | undefined;
}

function requireOptionsObject(value: unknown, transformName: string): Record<string, unknown> {
	if (value === null || Array.isArray(value) || typeof value !== "object") {
		throw new TypeError(`Options for "${transformName}" must be an object.`);
	}
	return value as Record<string, unknown>;
}

function rejectUnknownOptions(
	options: Record<string, unknown>,
	allowedKeys: readonly string[],
	transformName: string,
): void {
	for (const key of Object.keys(options)) {
		if (!allowedKeys.includes(key)) {
			throw new TypeError(`Unknown option "${key}" for transform "${transformName}".`);
		}
	}
}

function optionalInteger(value: unknown, name: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Number.isInteger(value)) {
		throw new TypeError(`Option "${name}" must be an integer.`);
	}
	return value as number;
}

function requiredString(value: unknown, name: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`Option "${name}" must be a non-empty string.`);
	}
	return value;
}

function validateIncludeOptions(
	value: unknown,
	transformName: string,
	includeLanguage: boolean,
): IncludeOptions {
	const options = requireOptionsObject(value, transformName);
	const allowedKeys = includeLanguage
		? ["path", "start", "end", "language"]
		: ["path", "start", "end"];
	rejectUnknownOptions(options, allowedKeys, transformName);

	const validated: IncludeOptions = {
		path: requiredString(options.path, "path"),
		start: optionalInteger(options.start, "start"),
		end: optionalInteger(options.end, "end"),
	};
	if (includeLanguage) {
		validated.language =
			options.language === undefined
				? undefined
				: requiredString(options.language, "language");
	}
	return validated;
}

/**
 * Selects a range of lines and removes boundary whitespace.
 * Negative indexes use {@link Array.slice} semantics.
 * A terminal line ending creates an empty final array entry and affects negative indexes.
 *
 * @param source - The source text to select from.
 * @param start - The zero-based, inclusive start index. Defaults to the first line.
 * @param end - The zero-based, exclusive end index. Defaults to the end of the source.
 * @returns The selected source text without boundary whitespace.
 */
function sliceLines(source: string, start?: number, end?: number): string {
	if (start === undefined && end === undefined) {
		return source.trim();
	}
	return source.split(/\r?\n/).slice(start, end).join("\n").trim();
}

/**
 * Includes a Markdown file as parsed syntax-tree nodes.
 */
export const includeTransform: Transform = {
	async generate(value: unknown, context: TransformContext) {
		const options = validateIncludeOptions(value, "include", false);
		const sourcePath = context.resolvePath(options.path);
		const source = await context.readFile(sourcePath, "utf8");
		const selectedSource = sliceLines(source, options.start, options.end);
		const sourceDocument = context.parseDocument(selectedSource, sourcePath);
		const nodes: GeneratedNodes = sourceDocument.tree.children;
		Object.defineProperty(nodes, "sourcePath", {
			value: sourcePath,
			enumerable: false,
		});
		return nodes;
	},
};

/**
 * Includes text from a file in a fenced code block.
 */
export const includeCodeTransform: Transform = {
	async generate(value: unknown, context: TransformContext) {
		const options = validateIncludeOptions(value, "include-code", true);
		const sourcePath = context.resolvePath(options.path);
		const source = await context.readFile(sourcePath, "utf8");
		return [
			{
				type: "code",
				lang: options.language,
				value: sliceLines(source, options.start, options.end),
			},
		];
	},
};
