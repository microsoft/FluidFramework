import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import {
	ForestTypeOptimized,
	configuredSharedTreeBetaLegacy,
} from "@fluidframework/tree/legacy";

import { BenchmarkSharedObject } from "./benchmark-shared-object.js";
import type { BenchmarkDataStructure } from "./benchmark-data-object.js";

const schemaFactory = new SchemaFactory("fluid.experimental.shared-tree-benchmark");

export class BenchmarkState extends schemaFactory.object("BenchmarkState", {
	value: schemaFactory.number,
}) {}

export const benchmarkTreeConfiguration = new TreeViewConfiguration({
	schema: BenchmarkState,
});

const optimizedSharedTree = configuredSharedTreeBetaLegacy({ forest: ForestTypeOptimized });

export function benchmarkContainerSchema(dataStructure: BenchmarkDataStructure) {
	return {
		initialObjects: {
			data: dataStructure === "shared-tree" ? optimizedSharedTree : BenchmarkSharedObject,
		},
	};
}
