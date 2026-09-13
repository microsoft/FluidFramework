import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

const schemaFactory = new SchemaFactory("fluid.experimental.shared-tree-benchmark");

export class BenchmarkState extends schemaFactory.object("BenchmarkState", {
	value: schemaFactory.number,
}) {}

export const benchmarkTreeConfiguration = new TreeViewConfiguration({
	schema: BenchmarkState,
});

export const benchmarkContainerSchema = {
	initialObjects: { tree: SharedTree },
};
