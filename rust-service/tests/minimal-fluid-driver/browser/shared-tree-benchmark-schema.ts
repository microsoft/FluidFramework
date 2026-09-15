/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import {
	ForestTypeOptimized,
	configuredSharedTreeBetaLegacy,
} from "@fluidframework/tree/legacy";

import { BenchmarkSharedObject } from "./benchmark-shared-object.js";
import type { BenchmarkDataStructure } from "./benchmark-data-object.js";

/** Namespace owner for benchmark-only SharedTree schema identifiers. */
const schemaFactory = new SchemaFactory("fluid.experimental.shared-tree-benchmark");

/** SharedTree root schema containing the benchmark's scalar value. */
export class BenchmarkState extends schemaFactory.object("BenchmarkState", {
	value: schemaFactory.number,
}) {}

/** Optimized-forest SharedTree view configuration used by benchmark clients. */
export const benchmarkTreeConfiguration = new TreeViewConfiguration({
	schema: BenchmarkState,
});

/** SharedTree channel factory configured with the optimized forest implementation. */
const optimizedSharedTree = configuredSharedTreeBetaLegacy({ forest: ForestTypeOptimized });

/** Selects the captured-payload SharedObject or optimized SharedTree container schema. */
export function benchmarkContainerSchema(dataStructure: BenchmarkDataStructure) {
	return {
		initialObjects: {
			data: dataStructure === "shared-tree" ? optimizedSharedTree : BenchmarkSharedObject,
		},
	};
}
