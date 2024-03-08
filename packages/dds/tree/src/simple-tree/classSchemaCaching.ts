import type { FlexTreeNodeSchema } from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import type { TreeNodeSchemaClass } from "./schemaTypes.js";

/**
 * A symbol for storing TreeNodeSchemaClass on FlexTreeNode's schema.
 */
export const simpleSchemaSymbol: unique symbol = Symbol(`simpleSchema`);

/**
 * TODO
 */
export function getClassSchema(schema: FlexTreeNodeSchema): TreeNodeSchemaClass | undefined {
	if (simpleSchemaSymbol in schema) {
		return schema[simpleSchemaSymbol] as TreeNodeSchemaClass;
	}
	return undefined;
}

/**
 * TODO
 */
export function getClassSchemaOrFail(schema: FlexTreeNodeSchema): TreeNodeSchemaClass {
	return (
		getClassSchema(schema) ??
		fail(`Could not find cached ClassSchema on Flex schema "${schema.name}".`)
	);
}
