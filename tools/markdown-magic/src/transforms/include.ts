/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Definition, Nodes, PhrasingContent, RootContent } from "mdast";

import type { GeneratedNodes, Transform, TransformContext } from "../types.js";

/**
 * Matches one complete HTML comment and captures the text between its delimiters.
 */
const htmlCommentPattern = /^<!--([\s\S]*?)-->$/;

/**
 * Converts a complete Markdown HTML comment node to an MDX comment expression.
 * Other HTML nodes are unchanged so that destination serialization can validate them.
 *
 * @param node - The parsed Markdown node to convert.
 * @returns The equivalent MDX comment node, or the original node when it is not a comment.
 */
function convertCommentToMdx(node: RootContent): RootContent {
	if (node.type !== "html") {
		return node;
	}
	const match = htmlCommentPattern.exec(node.value);
	return match === null ? node : { type: "mdxFlowExpression", value: `/*${match[1]}*/` };
}

/**
 * Matches one complete MDX comment expression and captures the text between its delimiters.
 */
const mdxCommentPattern = /^\/\*([\s\S]*?)\*\/$/;

/**
 * Converts a complete MDX comment expression to a Markdown HTML comment node.
 * Other MDX expressions are unchanged so that destination serialization can reject them.
 *
 * @param node - The parsed MDX node to convert.
 * @returns The equivalent Markdown comment node, or the original node when it is not a comment.
 */
function convertCommentToMarkdown(node: RootContent): RootContent {
	if (node.type !== "mdxFlowExpression") {
		return node;
	}
	const match = mdxCommentPattern.exec(node.value);
	return match === null ? node : { type: "html", value: `<!--${match[1]}-->` };
}

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
 * Resolves reference-style links and images to inline nodes using source link definitions.
 *
 * @param node - The node whose references to resolve.
 * @param definitions - The source definitions indexed by normalized identifier.
 * @returns A copy of the node with resolvable references converted to inline nodes.
 */
function resolveReferences(node: Nodes, definitions: ReadonlyMap<string, Definition>): Nodes {
	if (node.type === "linkReference") {
		const definition = definitions.get(node.identifier);
		return definition === undefined
			? node
			: {
					type: "link",
					url: definition.url,
					title: definition.title,
					children: node.children.map(
						(child) => resolveReferences(child, definitions) as PhrasingContent,
					),
				};
	}
	if (node.type === "imageReference") {
		const definition = definitions.get(node.identifier);
		return definition === undefined
			? node
			: {
					type: "image",
					url: definition.url,
					title: definition.title,
					alt: node.alt,
				};
	}
	return "children" in node
		? ({
				...node,
				children: node.children.map((child) => resolveReferences(child, definitions)),
			} as Nodes)
		: node;
}

/**
 * Determines whether a link target depends on the source document's directory.
 * Absolute URLs, root-relative URLs, anchors, and query-only references do not depend on it.
 *
 * @param target - The link or image URL to classify.
 * @returns `true` when the target is a relative path.
 */
function isRelativePathTarget(target: string): boolean {
	return (
		target.length > 0 &&
		!target.startsWith("/") &&
		!target.startsWith("#") &&
		!target.startsWith("?") &&
		!URL.canParse(target)
	);
}

/**
 * Rejects links and images whose targets would resolve relative to the source document.
 *
 * @param node - The generated node to validate.
 * @param sourcePath - The source path included in the diagnostic.
 * @throws When a link or image has a relative path target.
 */
function validateLinkTargets(node: Nodes, sourcePath: string): void {
	if ((node.type === "link" || node.type === "image") && isRelativePathTarget(node.url)) {
		throw new TypeError(
			`Included content from "${sourcePath}" contains relative link target "${node.url}". Use an absolute URL or a document-local target.`,
		);
	}
	if ("children" in node) {
		for (const child of node.children) {
			validateLinkTargets(child, sourcePath);
		}
	}
}

/**
 * Parses selected source with the source document's link definitions as temporary context.
 * Definitions outside the selection let remark recognize reference-style links. The resulting
 * references are resolved to inline links, and definitions outside the requested range are removed.
 */
function parseSelectedSource(
	source: string,
	selectedSource: string,
	sourcePath: string,
	context: TransformContext,
): RootContent[] {
	const sourceDocument = context.parseDocument(source, sourcePath);
	const definitionsByIdentifier = new Map(
		sourceDocument.tree.children
			.filter((node): node is Definition => node.type === "definition")
			.map((definition) => [definition.identifier, definition]),
	);
	const definitions = sourceDocument.tree.children.flatMap((node) => {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		return node.type === "definition" && start !== undefined && end !== undefined
			? [source.slice(start, end)]
			: [];
	});
	if (definitions.length === 0) {
		return context.parseDocument(selectedSource, sourcePath).tree.children;
	}

	const separator = "\n\n";
	const definitionStart = selectedSource.length + separator.length;
	const contextualSource = `${selectedSource}${separator}${definitions.join("\n")}`;
	return context
		.parseDocument(contextualSource, sourcePath)
		.tree.children.filter(
			(node) =>
				node.type !== "definition" &&
				(node.position?.start.offset ?? definitionStart) < definitionStart,
		)
		.map((node) => resolveReferences(node, definitionsByIdentifier) as RootContent);
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
		const selectedNodes = parseSelectedSource(source, selectedSource, sourcePath, context);

		// Validate that included content does not contain relative link targets,
		// which would be invalid in the destination document.
		for (const node of selectedNodes) {
			validateLinkTargets(node, sourcePath);
		}

		const nodes: GeneratedNodes =
			context.destinationFormat === "mdx"
				? selectedNodes.map(convertCommentToMdx)
				: selectedNodes.map(convertCommentToMarkdown);
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
