/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GeneratedNodes, Transform, TransformContext } from "../types.js";

interface IncludeOptions {
	path: string;
	start: number | undefined;
	end: number | undefined;
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

function sliceLines(source: string, start?: number, end?: number): string {
	if (start === undefined && end === undefined) {
		return source.trim();
	}
	return source.split(/\r?\n/).slice(start, end).join("\n").trim();
}

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
