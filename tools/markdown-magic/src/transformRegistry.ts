/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Heading } from "mdast";

import { parseDocument } from "./processorProfiles.js";
import { createTransforms } from "./transforms/index.js";
import type { DocumentFormat, TransformContext, TransformRegistry } from "./types.js";

/**
 * Creates the services that a transform can use.
 *
 * @param destinationPath - The absolute destination path.
 * @param destinationFormat - The destination document format.
 * @param sectionHeadingDepth - The heading depth assigned to the generated section.
 * @returns The services and destination details for executing a transform.
 */
function createContext(
	destinationPath: string,
	destinationFormat: DocumentFormat,
	sectionHeadingDepth: Heading["depth"],
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
 * Each transform validates its unknown JSON options and generates mdast nodes in one operation.
 *
 * @returns The transform registry and its context factory.
 */
export function createTransformRegistry(): TransformRegistry {
	return {
		createContext,
		transforms: createTransforms(),
	};
}
