/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "./processorProfiles.js";
import { createReadmeTransforms } from "./transforms.js";
import type {
	DocumentFormat,
	GeneratedNodes,
	TransformContext,
	TransformRegistry,
} from "./types.js";

interface IncludeOptions {
	path: string;
	start: number | undefined;
	end: number | undefined;
	language?: string | undefined;
}

/**
 * Requires a transform's options to be an object.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} transformName - The transform name to include in an error.
 * @returns {Record<string, unknown>} The options object.
 */
function requireOptionsObject(value: unknown, transformName: string): Record<string, unknown> {
	if (value === null || Array.isArray(value) || typeof value !== "object") {
		throw new TypeError(`Options for "${transformName}" must be an object.`);
	}
	return value as Record<string, unknown>;
}

/**
 * Rejects option keys that the transform does not define.
 *
 * @param {Record<string, unknown>} options - The options to inspect.
 * @param {readonly string[]} allowedKeys - The accepted option keys.
 * @param {string} transformName - The transform name to include in an error.
 */
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

/**
 * Validates an optional integer.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} name - The option name to include in an error.
 * @returns {number | undefined} The integer, or `undefined` if no value was supplied.
 */
function optionalInteger(value: unknown, name: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Number.isInteger(value)) {
		throw new TypeError(`Option "${name}" must be an integer.`);
	}
	return value as number;
}

/**
 * Validates a required non-empty string.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} name - The option name to include in an error.
 * @returns {string} The validated string.
 */
function requiredString(value: unknown, name: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`Option "${name}" must be a non-empty string.`);
	}
	return value;
}

/**
 * Validates options for an include transform.
 *
 * @param {unknown} value - The options value to validate.
 * @param {string} transformName - The transform name to include in an error.
 * @param {boolean} includeLanguage - Whether to accept the `language` option.
 * @returns {{ path: string; start: number | undefined; end: number | undefined; language?: string }} The validated options.
 */
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
 * Selects lines with JavaScript array-slice rules and trims boundary whitespace.
 *
 * @param {string} source - The source text.
 * @param {number | undefined} start - The inclusive zero-based start index.
 * @param {number | undefined} end - The exclusive zero-based end index.
 * @returns {string} The selected source text.
 */
function sliceLines(source: string, start?: number, end?: number): string {
	if (start === undefined && end === undefined) {
		return source.trim();
	}
	return source.split(/\r?\n/).slice(start, end).join("\n").trim();
}

/**
 * Creates the services that a transform can use.
 *
 * @param {string} destinationPath - The absolute destination path.
 * @param {"markdown" | "mdx"} destinationFormat - The destination document format.
 * @returns {{ destinationPath: string; destinationFormat: "markdown" | "mdx"; resolvePath: (relativePath: string) => string; parseDocument: typeof parseDocument; readFile: typeof readFile }} The transform context.
 */
function createContext(
	destinationPath: string,
	destinationFormat: DocumentFormat,
	sectionHeadingDepth: import("mdast").Heading["depth"],
): TransformContext {
	return {
		destinationPath,
		destinationFormat,
		sectionHeadingDepth,
		resolvePath(relativePath) {
			return path.resolve(path.dirname(destinationPath), relativePath);
		},
		parseDocument,
		readFile,
	};
}

/**
 * Creates the complete transform registry for README and file transforms.
 *
 * Each transform validates unknown JSON options before it generates mdast nodes.
 *
 * @returns {Record<string, unknown> & { createContext: typeof createContext }} The transform registry and its context factory.
 */
export function createTransformRegistry(): TransformRegistry {
	return {
		createContext,
		transforms: {
			...createReadmeTransforms(),
			include: {
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
			},
			"include-code": {
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
			},
		},
	};
}
