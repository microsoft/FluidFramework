/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ISharedTree,
	EditableField,
	FieldKey,
	isGlobalFieldKey,
	symbolIsFieldKey,
	keyFromSymbol,
	symbolFromKey,
	rootFieldKey,
	ContextuallyTypedNodeDataObject,
	EmptyKey,
	PrimitiveValue,
	TreeSchemaIdentifier,
	brand,
	isPrimitive,
	lookupGlobalFieldSchema,
	lookupTreeSchema,
	neverTree,
	typeNameSymbol,
	valueSymbol,
	FieldKinds,
	FieldSchema,
} from "@fluid-experimental/tree2";
import { addComplexTypeToSchema } from "@fluid-experimental/property-shared-tree-interop";

const { sequence, value } = FieldKinds;
const defaultPrimitiveValues = {
	Bool: false,
	String: "",
	Int8: 0,
	Uint8: 0,
	Int16: 0,
	Uint16: 0,
	Int32: 0,
	Uint32: 0,
	Float32: 0,
	// Currently not supported by the SharedTree
	Int64: 0,
	Uint64: 0,
	Float64: 0,
	Reference: "",
};

export function stringifyKey(fieldKey: FieldKey): string {
	if (isGlobalFieldKey(fieldKey) && symbolIsFieldKey(fieldKey)) {
		return keyFromSymbol(fieldKey);
	}
	return fieldKey;
}

export function isEmptyRoot(field: EditableField): boolean {
	return field.fieldKey === symbolFromKey(rootFieldKey) && field.length === 0;
}

export function isSequenceField(field: EditableField): boolean {
	return field.fieldSchema.kind.identifier === sequence.identifier;
}

export function isValueFieldSchema(fieldSchema: FieldSchema): boolean {
	return fieldSchema.kind.identifier === value.identifier;
}

export function getNewNodeData(
	sharedTree: ISharedTree,
	typeName: TreeSchemaIdentifier,
): ContextuallyTypedNodeDataObject {
	const schema = sharedTree.storedSchema;
	const newData = { [typeNameSymbol]: typeName };
	const contextAndType = typeName.split("<");
	if (contextAndType.length > 1) {
		const context = contextAndType[0];
		const subType = contextAndType[1].replace(/>/g, "");
		if (lookupTreeSchema(schema, typeName) === neverTree) {
			// TODO: address this case to MSFT
			// Ideally, one could expect `map`, `array` etc. complex types
			// to be available "out-of-the-box" for every existing type.
			schema.update(addComplexTypeToSchema(schema, context, brand(subType)));
		}
		if (context === "array") {
			newData[EmptyKey] = [];
		}
		return newData;
	}
	const treeSchema = lookupTreeSchema(schema, typeName);
	// TODO: tbd if this code below could be moved to the EditableTree implementation
	// for creation of fields and nodes, also having a "hook" to define own default values.
	if (isPrimitive(treeSchema)) {
		// avoid `undefined` as not supported by schema and UI
		const defaultValue: PrimitiveValue = defaultPrimitiveValues[typeName];
		newData[valueSymbol] = defaultValue;
	} else {
		treeSchema.localFields.forEach((fieldSchema, fieldKey) => {
			if (isValueFieldSchema(fieldSchema)) {
				assert(fieldSchema.types?.size === 1, "Polymorphic types are not supported yet");
				newData[fieldKey] = getNewNodeData(sharedTree, [...fieldSchema.types][0]);
			}
		});
		treeSchema.globalFields.forEach((globalFieldKey) => {
			const fieldSchema = lookupGlobalFieldSchema(schema, globalFieldKey);
			if (isValueFieldSchema(fieldSchema)) {
				assert(fieldSchema.types?.size === 1, "Polymorphic types are not supported yet");
				const fieldKey = symbolFromKey(globalFieldKey);
				newData[fieldKey] = getNewNodeData(sharedTree, [...fieldSchema.types][0]);
			}
		});
	}
	return newData;
}
