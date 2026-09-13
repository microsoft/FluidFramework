import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

const schemaFactory = new SchemaFactory("fluid.experimental.shared-tree-benchmark");

export class BenchmarkEdits extends schemaFactory.array(
	"BenchmarkEdits",
	schemaFactory.number,
) {}

export const benchmarkTreeConfiguration = new TreeViewConfiguration({
	schema: BenchmarkEdits,
});

export const benchmarkContainerSchema = {
	initialObjects: { tree: SharedTree },
};
