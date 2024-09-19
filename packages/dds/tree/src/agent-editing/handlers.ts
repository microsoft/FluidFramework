/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKind,
	NodeKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type TreeNode,
	type TreeView,
} from "../simple-tree/index.js";
import {
	getSimpleSchema,
	type SimpleFieldSchema,
	type SimpleNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../simple-tree/api/index.js";
// eslint-disable-next-line import/no-internal-modules
import { fail, getOrCreate, mapIterable } from "../util/utils.js";
import { ValueSchema } from "../core/index.js";
import {
	type StreamedType,
	type JsonObject,
	JsonHandler as jh,
} from "../json-handler/index.js";
import type { Insert, Modify, Move, Remove, SetRoot } from "./agentEditTypes.js";
import { applyAgentEdit, typeField } from "./agentEditReducer.js";

const targetHandler = jh.object(() => ({
	properties: {
		objectId: jh.number(),
	},
}));

const placeHandler = jh.object(() => ({
	properties: {
		objectId: jh.number(),
		place: jh.enum({ values: ["before", "after"] }),
	},
}));

const rangeHandler = jh.object(() => ({
	properties: {
		from: placeHandler(),
		to: placeHandler(),
	},
}));

export function generateHandlers(
	view: TreeView<ImplicitFieldSchema>,
	nodeMap: Map<number, TreeNode>,
): StreamedType {
	const schema = normalizeFieldSchema(view.schema);
	const simpleSchema = getSimpleSchema(schema.allowedTypes);
	const insertSet = new Set<string>();
	const modifyFieldSet = new Set<string>();
	const modifyTypeSet = new Set<string>();
	const schemaHandlers = new Map<string, StreamedType>();

	for (const name of simpleSchema.definitions.keys()) {
		getOrCreateHandler(
			simpleSchema.definitions,
			schemaHandlers,
			insertSet,
			modifyFieldSet,
			modifyTypeSet,
			name,
		);
	}

	const setRootHandler = jh.object(() => ({
		properties: {
			type: jh.enum({ values: ["setRoot"] }),
			content: jh.anyOf(
				Array.from(
					schema.allowedTypeSet.values(),
					(nodeSchema) =>
						schemaHandlers.get(nodeSchema.identifier) ?? fail("Unexpected schema"),
				),
			),
		},
		complete: (jsonObject: JsonObject) => {
			const setRoot = jsonObject as unknown as SetRoot;
			applyAgentEdit(view, setRoot, nodeMap, simpleSchema.definitions);
		},
	}));

	const insertHandler = jh.object(() => ({
		properties: {
			type: jh.enum({ values: ["insert"] }),
			content: jh.anyOf(
				Array.from(insertSet, (n) => schemaHandlers.get(n) ?? fail("Unexpected schema")),
			),
			destination: placeHandler(),
		},
		complete: (jsonObject: JsonObject) => {
			const insert = jsonObject as unknown as Insert;
			applyAgentEdit(view, insert, nodeMap, simpleSchema.definitions);
		},
	}));

	const removeHandler = jh.object(() => ({
		properties: {
			type: jh.enum({ values: ["remove"] }),
			source: rangeHandler(),
		},
		complete: (jsonObject: JsonObject) => {
			const remove = jsonObject as unknown as Remove;
			applyAgentEdit(view, remove, nodeMap, simpleSchema.definitions);
		},
	}));

	const modifyHandler = jh.object(() => ({
		properties: {
			type: jh.enum({ values: ["modify"] }),
			target: targetHandler(),
			field: jh.enum({ values: Array.from(modifyFieldSet) }),
			modification: jh.anyOf(
				Array.from(modifyTypeSet, (n) => schemaHandlers.get(n) ?? fail("Unexpected schema")),
			),
		},
		complete: (jsonObject: JsonObject) => {
			const modify = jsonObject as unknown as Modify;
			applyAgentEdit(view, modify, nodeMap, simpleSchema.definitions);
		},
	}));

	const moveHandler = jh.object(() => ({
		properties: {
			type: jh.enum({ values: ["move"] }),
			source: rangeHandler(),
			destination: placeHandler(),
		},
		complete: (jsonObject: JsonObject) => {
			const move = jsonObject as unknown as Move;
			applyAgentEdit(view, move, nodeMap, simpleSchema.definitions);
		},
	}));

	return jh.array(() => ({
		items: jh.anyOf([
			setRootHandler(),
			insertHandler(),
			modifyHandler(),
			removeHandler(),
			moveHandler(),
		]),
	}))();
}

function getOrCreateHandler(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	handlerMap: Map<string, StreamedType>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	definition: string,
): StreamedType {
	return getOrCreate(handlerMap, definition, () => {
		const nodeSchema = definitionMap.get(definition) ?? fail("Unexpected definition");
		switch (nodeSchema.kind) {
			case NodeKind.Object: {
				for (const [key, field] of Object.entries(nodeSchema.fields)) {
					modifyFieldSet.add(key);
					for (const type of field.allowedTypes) {
						modifyTypeSet.add(type);
					}
				}
				const properties = Object.fromEntries(
					Object.entries(nodeSchema.fields)
						.map(([key, field]) => {
							return [
								key,
								getOrCreateHandlerForField(
									definitionMap,
									handlerMap,
									insertSet,
									modifyFieldSet,
									modifyFieldSet,
									field,
								),
							];
						})
						.filter(([, value]) => value !== undefined),
				);
				properties[typeField] = jh.enum({ values: [definition] });
				return jh.object(() => ({
					properties,
				}))();
			}
			case NodeKind.Array: {
				for (const [name] of Array.from(
					nodeSchema.allowedTypes,
					(n): [string, SimpleNodeSchema] => [
						n,
						definitionMap.get(n) ?? fail("Unknown definition"),
					],
				).filter(([_, schema]) => schema.kind === NodeKind.Object)) {
					insertSet.add(name);
				}

				return jh.array(() => ({
					items: getStreamedType(
						definitionMap,
						handlerMap,
						insertSet,
						modifyFieldSet,
						modifyTypeSet,
						nodeSchema.allowedTypes,
					),
				}))();
			}
			case NodeKind.Leaf:
				switch (nodeSchema.leafKind) {
					case ValueSchema.Boolean:
						return jh.boolean();
					case ValueSchema.Number:
						return jh.number();
					case ValueSchema.String:
						return jh.string();
					case ValueSchema.Null:
						return jh.null();
					default:
						throw new Error(`Unsupported leaf kind ${NodeKind[nodeSchema.leafKind]}.`);
				}
			default:
				throw new Error(`Unsupported node kind ${NodeKind[nodeSchema.kind]}.`);
		}
	});
}

function getOrCreateHandlerForField(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	handlerMap: Map<string, StreamedType>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	fieldSchema: SimpleFieldSchema,
): StreamedType | undefined {
	if (fieldSchema.metadata?.llmDefault !== undefined) {
		// Omit fields that have data which cannot be generated by an llm
		return undefined;
	}

	switch (fieldSchema.kind) {
		case FieldKind.Required:
			return getStreamedType(
				definitionMap,
				handlerMap,
				insertSet,
				modifyFieldSet,
				modifyTypeSet,
				fieldSchema.allowedTypes,
			);
		case FieldKind.Optional:
			return jh.optional(
				getStreamedType(
					definitionMap,
					handlerMap,
					insertSet,
					modifyFieldSet,
					modifyTypeSet,
					fieldSchema.allowedTypes,
				),
			);
		case FieldKind.Identifier:
			return undefined;
		default:
			throw new Error(`Unsupported field kind ${NodeKind[fieldSchema.kind]}.`);
	}
}

function getStreamedType(
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	handlerMap: Map<string, StreamedType>,
	insertSet: Set<string>,
	modifyFieldSet: Set<string>,
	modifyTypeSet: Set<string>,
	allowedTypes: ReadonlySet<string>,
): StreamedType {
	const single = tryGetSingleton(allowedTypes);
	return single !== undefined
		? getOrCreateHandler(
				definitionMap,
				handlerMap,
				insertSet,
				modifyFieldSet,
				modifyTypeSet,
				single,
			)
		: jh.anyOf([
				...mapIterable(allowedTypes, (name) => {
					return getOrCreateHandler(
						definitionMap,
						handlerMap,
						insertSet,
						modifyFieldSet,
						modifyTypeSet,
						name,
					);
				}),
			]);
}

function tryGetSingleton<T>(set: ReadonlySet<T>): T | undefined {
	if (set.size === 1) {
		for (const item of set) {
			return item;
		}
	}
}
