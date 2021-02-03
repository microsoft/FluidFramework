/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Types, PluginFunction } from '@graphql-codegen/plugin-helpers';
import { NodeId, SharedTree, Snapshot, SnapshotNode, TraitLabel } from '@fluid-experimental/tree';
import {
	FieldDefinitionNode,
	GraphQLSchema,
	parse,
	printSchema,
	TypeNode,
	visit,
	GraphQLResolveInfo,
	GraphQLFieldResolver,
} from 'graphql';

interface FieldInfo {
	typeName: string;
	isNonNull?: boolean;
	isList?: boolean;
}

export const plugin: PluginFunction<unknown> = (
	schema: GraphQLSchema,
	documents: Types.DocumentFile[],
	config: unknown
) => {
	const printedSchema = printSchema(schema);
	const astNode = parse(printedSchema);
	const result = visit(astNode, {
		leave: {
			EnumTypeDefinition: () => '',
			FieldDefinition: (fieldDef) => printFieldResolver(schema, fieldDef),
			ObjectTypeDefinition: (typeDef) => {
				return `${typeDef.name.value}: {
					${typeDef.fields?.join('\n') ?? ''}
				},`;
			},
		},
	});

	return `/*!
    * Copyright (c) Microsoft Corporation. All rights reserved.
    * Licensed under the MIT License.
    */

    ${printImports(
		getString,
		getFloat,
		getInt,
		getBoolean,
		getID,
		getNodeID,
		getScalar,
		getStringList,
		getFloatList,
		getIntList,
		getBooleanList,
		getIDList,
		getTrait,
		getNonNullTrait,
		getListTrait
	)}

	export const resolvers = {
		${result.definitions.join('\n')}
	}`;
};

function printImports(...functions: ((...args: never[]) => unknown)[]) {
	return `import { ${functions
		.map((f) => f.name)
		// TODO: This filepath assumes a folder containing generated code (e.g. graphql-generated) alongside a 'graphql-plugins/' folder
		.join(', ')} } from '../graphql-plugins/SharedTreePlugin'`;
}

function printFieldResolver(schema: GraphQLSchema, fieldDef: FieldDefinitionNode): string {
	const fieldName = fieldDef.name.value;
	const fieldInfo = unwrapField(fieldDef.type);

	// Check if this field is the special identifier field
	if (fieldInfo.typeName === 'ID' && (fieldName.toLowerCase() === 'id' || fieldName.toLowerCase() === 'identifier')) {
		return printResolver(fieldName, getNodeID);
	}

	// Check if this field is a grahpql scalar type, and decode appropriately
	if (isScalarTypeName(fieldInfo.typeName)) {
		return printScalarResolver(fieldName, fieldInfo);
	}

	// Check if this field is an enum type. If so, decode as a string
	if (schema.getType(fieldInfo.typeName)?.astNode?.kind === 'EnumTypeDefinition') {
		return printScalarResolver(fieldName, { ...fieldInfo, typeName: 'String' });
	}

	// This field is a non-leaf node, so just return the id of the node to be used by sub nodes
	switch (fieldDef.type.kind) {
		case 'NamedType':
			return printResolver(fieldName, getTrait);
		case 'NonNullType':
			return printResolver(fieldName, getNonNullTrait);
		case 'ListType':
			return printResolver(fieldName, getListTrait);
		default:
			throw Error(`Unrecognized or unsupported field type: ${fieldDef.type}`);
	}
}

function printScalarResolver(fieldName: string, scalar: FieldInfo): string {
	if (scalar.isList === true) {
		switch (scalar.typeName) {
			case 'String':
				return printResolver(fieldName, getStringList);
			case 'Float':
				return printResolver(fieldName, getFloatList);
			case 'Int':
				return printResolver(fieldName, getIntList);
			case 'Boolean':
				return printResolver(fieldName, getBooleanList);
			case 'ID':
				return printResolver(fieldName, getIDList);
			default:
				throw Error(`Unrecognized scalar type: ${scalar.typeName}`);
		}
	}

	switch (scalar.typeName) {
		case 'String':
			return printResolver(fieldName, getString);
		case 'Float':
			return printResolver(fieldName, getFloat);
		case 'Int':
			return printResolver(fieldName, getInt);
		case 'Boolean':
			return printResolver(fieldName, getBoolean);
		case 'ID':
			return printResolver(fieldName, getID);
		default:
			break;
	}

	throw Error(`Unrecognized scalar type: ${scalar.typeName}`);
}

function printResolver<TSource, TArgs>(fieldName: string, resolver: GraphQLFieldResolver<TSource, TArgs>): string {
	return `${fieldName}: ${resolver.name},`;
}

/** Digs into a field node in the AST and determines if it a list and/or non-null */
function unwrapField(fieldType: TypeNode, isNonNull?: boolean, isList?: boolean): FieldInfo {
	switch (fieldType.kind) {
		case 'NonNullType':
			return unwrapField(fieldType.type, true, isList);
		case 'ListType':
			return unwrapField(fieldType.type, isNonNull, true);
		case 'NamedType':
			return {
				typeName: fieldType.name.value,
				isNonNull,
				isList,
			};
		default:
			throw Error(`Unrecognized or unsupported field type: ${fieldType}`);
	}
}

function isScalarTypeName(typeName: string): boolean {
	switch (typeName) {
		case 'String':
		case 'Float':
		case 'Int':
		case 'Boolean':
		case 'ID':
			return true;

		default:
			break;
	}

	return false;
}

// ##############################
// HELPERS USED BY CODEGEN OUTPUT
// ##############################

// Resolvers for retrieving nullable and non-nullable scalars

export function getString(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): string | null {
	const node = getScalar(source, context.currentView, info.fieldName);
	return decodeString(node?.payload?.base64);
}

export function getFloat(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): number | null {
	const node = getScalar(source, context.currentView, info.fieldName);
	return decodeFloat(node?.payload?.base64);
}

export function getInt(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): number | null {
	const node = getScalar(source, context.currentView, info.fieldName);
	return decodeInt(node?.payload?.base64);
}

export function getBoolean(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): boolean | null {
	const node = getScalar(source, context.currentView, info.fieldName);
	return decodeBoolean(node?.payload?.base64);
}

export function getID(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): string | null {
	const node = getScalar(source, context.currentView, info.fieldName);
	return decodeID(node?.payload?.base64);
}

/** A special hack for retrieving NodeId_s */
export function getNodeID(source: NodeId, args: unknown, context: SharedTree): NodeId {
	const node = context.currentView.getSnapshotNode(source);
	return node.identifier;
}

/** Retrieves a leaf node */
export function getScalar(parent: NodeId, snapshot: Snapshot, traitLabel: string): SnapshotNode | null {
	const trait = snapshot.getTrait({ label: traitLabel as TraitLabel, parent });
	const firstId = trait.length === 0 ? null : trait[0];
	if (firstId === null || !snapshot.hasNode(firstId)) {
		return null;
	}

	return snapshot.getSnapshotNode(firstId);
}

// Resolvers for retrieving lists of scalars

export function getStringList(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): (string | null)[] {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.map((id) => decodeString(context.currentView.getSnapshotNode(id).payload?.base64));
}

export function getFloatList(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): (number | null)[] {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.map((id) => decodeFloat(context.currentView.getSnapshotNode(id).payload?.base64));
}

export function getIntList(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): (number | null)[] {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.map((id) => decodeInt(context.currentView.getSnapshotNode(id).payload?.base64));
}

export function getBooleanList(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): (boolean | null)[] {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.map((id) => decodeBoolean(context.currentView.getSnapshotNode(id).payload?.base64));
}

export function getIDList(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): (string | null)[] {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.map((id) => decodeID(context.currentView.getSnapshotNode(id).payload?.base64));
}

// Resolvers for descending into non-leaf traits

export function getTrait(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): NodeId | null {
	const trait = context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
	return trait.length === 0 ? null : trait[0];
}

export function getNonNullTrait(source: NodeId, args: unknown, context: SharedTree, info: GraphQLResolveInfo): NodeId {
	return context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source })[0];
}

export function getListTrait(
	source: NodeId,
	args: unknown,
	context: SharedTree,
	info: GraphQLResolveInfo
): readonly NodeId[] {
	return context.currentView.getTrait({ label: info.fieldName as TraitLabel, parent: source });
}

// Helpers for decoding primitives from their encoded string format

function decodeString(s?: string): string | null {
	return s ?? null;
}

function decodeFloat(s?: string): number | null {
	return s === undefined ? null : parseFloat(s);
}

function decodeInt(s?: string): number | null {
	return s === undefined ? null : parseInt(s, 10);
}

function decodeBoolean(s?: string): boolean | null {
	return s === undefined ? null : s === 'true';
}

function decodeID(s?: string): string | null {
	return s ?? null;
}
