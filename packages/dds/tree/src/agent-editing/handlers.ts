/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKind,
	NodeKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
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
import {
	objectIdKey,
	type Insert,
	type Modify,
	type Move,
	type Remove,
	type SetRoot,
	type TreeEdit,
} from "./agentEditTypes.js";
import { applyAgentEdit, typeField } from "./agentEditReducer.js";
import type { IdGenerator } from "./idGenerator.js";

const objectTargetHandler = jh.object(() => ({
	description: "A pointer to an object in the tree",
	properties: {
		[objectIdKey]: jh.string({ description: "The id of the object that is being pointed to" }),
	},
}));

const objectPlaceHandler = jh.object(() => ({
	description:
		"A pointer to a location either just before or just after an object that is in an array",
	properties: {
		type: jh.enum({ values: ["objectPlace"] }),
		[objectIdKey]: jh.string({
			description: `The id (${objectIdKey}) of the object that the new/moved object should be placed relative to. This must be the id of an object that already existed in the tree content that was originally supplied.`,
		}),
		place: jh.enum({
			values: ["before", "after"],
			description:
				"Where the new/moved object will be relative to the target object - either just before or just after",
		}),
	},
}));

const arrayPlaceHandler = jh.object(() => ({
	description:
		"A location at either the beginning or the end of an array (useful for prepending or appending)",
	properties: {
		type: jh.enum({ values: ["arrayPlace"] }),
		parentId: jh.string({
			description: `The id (${objectIdKey}) of the parent object of the array. This must be the id of an object that already existed in the tree content that was originally supplied.`,
		}),
		field: jh.string({ "description": "The key of the array to insert into" }),
		location: jh.enum({
			values: ["start", "end"],
			description: "Where to insert into the array - either the start or the end",
		}),
	},
}));

const rangeHandler = jh.object(() => ({
	description: "A span of objects that are in an array",
	properties: {
		from: objectPlaceHandler(),
		to: objectPlaceHandler(),
	},
}));

export function generateHandlers(
	view: TreeView<ImplicitFieldSchema>,
	log: TreeEdit[],
	idGenerator: IdGenerator,
	complete: (jsonObject: JsonObject) => void,
	debugLog: string[],
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
		description: "A handler for setting content to the root of the tree.",
		properties: {
			type: jh.enum({ values: ["setRoot"] }),
			explanation: jh.string({ description: editDescription }),
			content: jh.anyOf(
				Array.from(
					schema.allowedTypeSet.values(),
					(nodeSchema) =>
						schemaHandlers.get(nodeSchema.identifier) ?? fail("Unexpected schema"),
				),
			),
		},
		complete: (jsonObject: JsonObject) => {
			debugLog.push(JSON.stringify(jsonObject, null, 2));
			const setRoot = jsonObject as unknown as SetRoot;
			applyAgentEdit(view, log, setRoot, idGenerator, simpleSchema.definitions);
		},
	}));

	const insertHandler = jh.object(() => ({
		description: "A handler for inserting new content into the tree.",
		properties: {
			type: jh.enum({ values: ["insert"] }),
			explanation: jh.string({ description: editDescription }),
			content: jh.anyOf(
				Array.from(insertSet, (n) => schemaHandlers.get(n) ?? fail("Unexpected schema")),
			),
			destination: jh.anyOf([arrayPlaceHandler(), objectPlaceHandler()]),
		},
		complete: (jsonObject: JsonObject) => {
			debugLog.push(JSON.stringify(jsonObject, null, 2));
			const insert = jsonObject as unknown as Insert;
			applyAgentEdit(view, log, insert, idGenerator, simpleSchema.definitions);
		},
	}));

	const removeHandler = jh.object(() => ({
		description: "A handler for removing content from the tree.",
		properties: {
			type: jh.enum({ values: ["remove"] }),
			explanation: jh.string({ description: editDescription }),
			source: jh.anyOf([objectTargetHandler(), rangeHandler()]),
		},
		complete: (jsonObject: JsonObject) => {
			debugLog.push(JSON.stringify(jsonObject, null, 2));
			const remove = jsonObject as unknown as Remove;
			applyAgentEdit(view, log, remove, idGenerator, simpleSchema.definitions);
		},
	}));

	const modifyHandler = jh.object(() => ({
		description: "A handler for modifying content in the tree.",
		properties: {
			type: jh.enum({ values: ["modify"] }),
			explanation: jh.string({ description: editDescription }),
			target: objectTargetHandler(),
			field: jh.enum({ values: Array.from(modifyFieldSet) }),
			modification: jh.anyOf(
				Array.from(modifyTypeSet, (n) => schemaHandlers.get(n) ?? fail("Unexpected schema")),
			),
		},
		complete: (jsonObject: JsonObject) => {
			debugLog.push(JSON.stringify(jsonObject, null, 2));
			const modify = jsonObject as unknown as Modify;
			applyAgentEdit(view, log, modify, idGenerator, simpleSchema.definitions);
		},
	}));

	const moveHandler = jh.object(() => ({
		description:
			"A handler for moving content from one location in the tree to another location in the tree.",
		properties: {
			type: jh.enum({ values: ["move"] }),
			explanation: jh.string({ description: editDescription }),
			source: jh.anyOf([objectTargetHandler(), rangeHandler()]),
			destination: jh.anyOf([arrayPlaceHandler(), objectPlaceHandler()]),
		},
		complete: (jsonObject: JsonObject) => {
			debugLog.push(JSON.stringify(jsonObject, null, 2));
			const move = jsonObject as unknown as Move;
			applyAgentEdit(view, log, move, idGenerator, simpleSchema.definitions);
		},
	}));

	const editWrapper = jh.object(() => ({
		// description:
		// 	"The next edit to apply to the tree, or null if the task is complete and no more edits are necessary.",
		properties: {
			edit: jh.anyOf([
				setRootHandler(),
				insertHandler(),
				modifyHandler(),
				removeHandler(),
				moveHandler(),
				jh.null(),
			]),
		},
		complete,
	}));

	return jh.object(() => ({
		properties: {
			edit: editWrapper(),
		},
	}))();
}

const editDescription =
	"A description of what this edit is meant to accomplish in human readable English";

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
					// TODO: Remove when AI better
					if (
						Array.from(
							field.allowedTypes,
							(n) => definitionMap.get(n) ?? fail("Unknown definition"),
						).some((n) => n.kind === NodeKind.Array)
					) {
						continue;
					}
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
