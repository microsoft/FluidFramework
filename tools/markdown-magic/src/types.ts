/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root, RootContent } from "mdast";

/** A supported documentation format. */
export type DocumentFormat = "markdown" | "mdx";

/** A parsed documentation file with the source details needed for range replacement. */
export interface ParsedDocument {
	readonly format: DocumentFormat;
	readonly path: string;
	readonly source: string;
	readonly tree: Root;
}

/** A generated node array with optional source information for diagnostics. */
export type GeneratedNodes = RootContent[] & { readonly sourcePath?: string };

/** Services that are available to a transform. */
export interface TransformContext {
	readonly destinationPath: string;
	readonly destinationFormat: DocumentFormat;
	resolvePath(relativePath: string): string;
	readonly parseDocument: (source: string, filePath: string) => ParsedDocument;
	readonly readFile: typeof import("node:fs/promises").readFile;
}

/** A transform that validates marker options and generates syntax-tree nodes. */
export interface Transform<TOptions extends object = Record<string, unknown>> {
	validateOptions(value: unknown): TOptions;
	generate(
		options: TOptions,
		context: TransformContext,
	): GeneratedNodes | Promise<GeneratedNodes>;
}

/** A registry that contains transforms and creates their execution context. */
export interface TransformRegistry {
	readonly transforms: Readonly<Record<string, Transform<Record<string, unknown>>>>;
	createContext(destinationPath: string, destinationFormat: DocumentFormat): TransformContext;
}

/** A generated region in a destination document. */
export interface GeneratedRegion {
	readonly destinationPath: string;
	readonly destinationFormat: DocumentFormat;
	readonly transformName: string;
	readonly options: Record<string, unknown>;
	readonly openingMarkerEnd: number;
	readonly closingMarkerStart: number;
	readonly line: number;
}
