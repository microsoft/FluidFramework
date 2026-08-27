/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "./processorProfiles.js";
import { createTransforms } from "./transforms/index.js";
import type { DocumentFormat, TransformContext, TransformRegistry } from "./types.js";

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
		transforms: createTransforms(),
	};
}
