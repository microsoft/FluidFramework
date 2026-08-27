/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "./processorProfiles.js";
import { createReadmeTransforms } from "./transforms.js";

/**
 * @param {unknown} value
 * @param {string} transformName
 */
function requireOptionsObject(value, transformName) {
	if (value === null || Array.isArray(value) || typeof value !== "object") {
		throw new TypeError(`Options for "${transformName}" must be an object.`);
	}
	return value;
}

/**
 * @param {Record<string, unknown>} options
 * @param {readonly string[]} allowedKeys
 * @param {string} transformName
 */
function rejectUnknownOptions(options, allowedKeys, transformName) {
	for (const key of Object.keys(options)) {
		if (!allowedKeys.includes(key)) {
			throw new TypeError(`Unknown option "${key}" for transform "${transformName}".`);
		}
	}
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function optionalInteger(value, name) {
	if (value === undefined) {
		return undefined;
	}
	if (!Number.isInteger(value)) {
		throw new TypeError(`Option "${name}" must be an integer.`);
	}
	return value;
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function requiredString(value, name) {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`Option "${name}" must be a non-empty string.`);
	}
	return value;
}

/**
 * @param {unknown} value
 * @param {string} transformName
 * @param {boolean} includeLanguage
 */
function validateIncludeOptions(value, transformName, includeLanguage) {
	const options = requireOptionsObject(value, transformName);
	const allowedKeys = includeLanguage
		? ["path", "start", "end", "language"]
		: ["path", "start", "end"];
	rejectUnknownOptions(options, allowedKeys, transformName);

	const validated = {
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
 * @param {string} source
 * @param {number | undefined} start
 * @param {number | undefined} end
 */
function sliceLines(source, start, end) {
	if (start === undefined && end === undefined) {
		return source.trim();
	}
	return source.split(/\r?\n/).slice(start, end).join("\n").trim();
}

/**
 * @param {string} destinationPath
 * @param {"markdown" | "mdx"} destinationFormat
 */
function createContext(destinationPath, destinationFormat) {
	return {
		destinationPath,
		destinationFormat,
		resolvePath(relativePath) {
			return path.resolve(path.dirname(destinationPath), relativePath);
		},
		parseDocument,
		readFile,
	};
}

export function createTransformRegistry() {
	return {
		...createReadmeTransforms(),
		createContext,
		include: {
			validateOptions(value) {
				return validateIncludeOptions(value, "include", false);
			},
			async generate(options, context) {
				const sourcePath = context.resolvePath(options.path);
				const source = await context.readFile(sourcePath, "utf8");
				const selectedSource = sliceLines(source, options.start, options.end);
				const sourceDocument = context.parseDocument(selectedSource, sourcePath);
				const nodes = sourceDocument.tree.children;
				Object.defineProperty(nodes, "sourcePath", {
					value: sourcePath,
					enumerable: false,
				});
				return nodes;
			},
		},
		"include-code": {
			validateOptions(value) {
				return validateIncludeOptions(value, "include-code", true);
			},
			async generate(options, context) {
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
	};
}
