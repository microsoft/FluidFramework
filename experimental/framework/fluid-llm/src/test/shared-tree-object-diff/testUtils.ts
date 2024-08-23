
import {
	type ImplicitFieldSchema,
	 type InsertableTreeFieldFromImplicitField,
	  type TreeFieldFromImplicitField
} from "@fluidframework/tree/internal";




export function hydrate<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableTreeFieldFromImplicitField<TSchema>,
	nodeKeyManager?: NodeKeyManager,
): TreeFieldFromImplicitField<TSchema> {
	const forest = buildForest();
	const field = flexTreeFromForest(toFlexSchema(schema), forest, { nodeKeyManager });
	assert(field.context !== undefined, "Expected LazyField");
	const mapTree = mapTreeFromNodeData(
		initialTree as InsertableContent,
		normalizeFieldSchema(schema).allowedTypes,
		field.context.nodeKeyManager,
		getSchemaAndPolicy(field),
	);
	prepareContentForHydration(mapTree, field.context.checkout.forest);
	const cursor = cursorForMapTreeNode(mapTree);
	initializeForest(forest, [cursor], testRevisionTagCodec, testIdCompressor, true);
	return getTreeNodeForField(field) as TreeFieldFromImplicitField<TSchema>;
}
