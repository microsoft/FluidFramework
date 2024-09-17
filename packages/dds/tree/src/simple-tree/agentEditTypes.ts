/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @rushstack/no-new-null */

import { assert } from "@fluidframework/core-utils/internal";
import {
	FieldKind,
	NodeKind,
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeView,
} from "./index.js";
import { toSimpleTreeSchema, type SimpleTreeSchema } from "./api/index.js";

/**
 * TODO: The current scheme does not allow manipulation of arrays of primitive values because you cannot refer to them.
 * We could accomplish this via a path (probably JSON Pointer or JSONPath) from a possibly-null objectId, or wrap arrays in an identified object.
 *
 * TODO: We could add a "replace" edit type to avoid tons of little modifies.
 *
 * TODO: OpenAI doesn't include the schema in the input...would doing so decrease hallucination? Maybe a compact version? We will definitely need example edits.
 *
 * TODO: only 100 object fields total are allowed by OpenAI right now, so larger schemas will fail faster if we have a bunch of schema types generated for type-specific edits.
 *
 * TODO: experiment using https://github.com/outlines-dev/outlines (and maybe a llama model) to avoid many of the annoyances of OpenAI's JSON Schema subset.
 *
 * TODO: without field count limits, we could generate a schema for valid paths from the root object to any field, but it's not clear how useful that would be.
 *
 * TODO: add example of handling fields the model cannot initialize (identifiers, uuid fields, etc.)
 */

// For polymorphic edits, we need to wrap the edit in an object to avoid anyOf at the root level.
export interface EditWrapper {
	edits: TreeEdit[];
}

export type TreeEdit = SetRoot | Insert | Modify | Remove | Move;

export interface Edit {
	type: "setRoot" | "insert" | "modify" | "remove" | "move";
}

export type Selection = Target | Range;

export interface Target {
	objectId: number;
}

export interface Place extends Target {
	// No "start" or "end" because we don't have a way to refer to arrays directly.
	place: "before" | "after";
}

export interface Range {
	from: Place;
	to: Place;
}

export interface SetRoot extends Edit {
	type: "setRoot";
	content: unknown;
}

export interface Insert extends Edit {
	type: "insert";
	content: unknown;
	destination: Place;
}

export interface Modify extends Edit {
	type: "modify";
	target: Target;
	field: string;
	modification: unknown;
}

export interface Remove extends Edit {
	type: "remove";
	source: Selection;
}

export interface Move extends Edit {
	type: "move";
	source: Selection;
	destination: Place;
}

export function toDecoratedJson<TRootSchema extends ImplicitFieldSchema>(
	root: TreeFieldFromImplicitField<TRootSchema>,
): { stringified: string; idMap: Map<number, unknown> } {
	const idMap = new Map<number, unknown>();
	let idCount = 0;
	const stringified: string = JSON.stringify(root, (_, value) => {
		if (typeof value === "object") {
			idMap.set(idCount, value);
			assert(
				!{}.hasOwnProperty.call(value, "__fluid_id"),
				"Collision of property '__fluid_id'.",
			);
			return {
				__fluid_id: idCount++,
				...value,
			} as unknown;
		}
		return value as unknown;
	});
	return { stringified, idMap };
}

export function getSystemPrompt<TRootSchema extends ImplicitFieldSchema>(
	view: TreeView<TRootSchema>,
	schema: ImplicitAllowedTypes,
): string {
	const simpleTreeSchema = toSimpleTreeSchema(schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(simpleTreeSchema);

	/*
	-- Dynamic pieces:
	1. Description of the schema of the tree.
	2. Tree content (current state) -- output of toDecoratedJson.
	3.? TypeScripty version of the edits it's allowed to make (Json schema); depends on Structured Output requirements.
	4.? If it performs poorly, potentially dynamically generate some examples based on the passed schema.
	*/
	return "";
}

function getPromptFriendlyTreeSchema(simpleTreeSchema: SimpleTreeSchema): string {
	let stringifiedSchema = "";
	simpleTreeSchema.definitions.forEach((nodeSchemaDef, nodeSchemaName) => {
		if (nodeSchemaDef.kind !== NodeKind.Object) {
			return;
		}

		const friendlyNodeType = getFriendlySchemaName(nodeSchemaName);
		if (friendlyNodeType === null || friendlyNodeType === "") {
			return; // null or empty schema node description. This would likely be a throw instead.
		}
		let stringifiedEntry = `interface ${friendlyNodeType} {`;

		Object.entries(nodeSchemaDef.fields).forEach(([fieldName, fieldSchema]) => {
			const mappedAllowedTypes = [...fieldSchema.allowedTypes]
				.map((allowedType) => getFriendlySchemaName(allowedType))
				.filter(
					(allowedType): allowedType is string => allowedType !== null && allowedType !== "",
				); // as above, null or empty schema node descriptions should likely throw?
			if (fieldSchema.kind === FieldKind.Optional) {
				mappedAllowedTypes.push("undefined");
			}
			const allowedTypesString = mappedAllowedTypes.join(" | ");
			stringifiedEntry += `${fieldName}: ${allowedTypesString}, `;
		});
		stringifiedEntry += "}, ";

		stringifiedSchema += stringifiedEntry;
	});
	return stringifiedSchema;
}

function getFriendlySchemaName(schemaName: string): string | null {
	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		return null;
	}
	return matches[0];
}

/** ---------------- EXAMPLE FOLLOWS ---------------------- */

// Example SharedTree schema:

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x: sf.number,
	y: sf.number,
	z: sf.optional(sf.number),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	vectors: sf.array(Vector),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObject] });

// Example of generated JSON schema we send to the model:
// TODO: add descriptions to fluid-generated types

const jsonSchema = {
	$ref: "#/$defs/__fluid_rootWrapper",
	$defs: {
		"agentSchema.Vector": {
			type: "object",
			properties: {
				// Add a type field (unconditionally for now) to disambiguate polymorphic inserts
				schemaType: { type: "string", enum: ["agentSchema.Vector"] },
				x: { type: "number" },
				y: { type: "number" },
				z: {
					// All fields must be required for OpenAI json schema
					anyOf: [{ type: "number" }, { type: "null" }],
				},
			},
			required: ["schemaType", "x", "y", "z"],
			// All types must have additionalProperties: false for OpenAI json schema
			additionalProperties: false,
		},
		"agentSchema.RootObject": {
			type: "object",
			properties: {
				schemaType: { type: "string", enum: ["agentSchema.RootObject"] },
				str: { type: "string" },
				vectors: {
					type: "array",
					items: { "$ref": "agentSchema.Vector" },
				},
				bools: {
					type: "array",
					items: { type: "boolean" },
				},
			},
			required: ["schemaType", "str", "vectors", "bools"],
			additionalProperties: false,
		},
		// Handle the polymorphic edit schema with a wrapper object since anyOf is banned at root with OpenAI
		// Names of types generated by fluid (this and edits) could contain a UUID to avoid collisions.
		"__fluid_rootWrapper": {
			type: "object",
			properties: {
				edits: {
					type: "array",
					items: {
						anyOf: [
							{ "$ref": "__fluid_setRoot" },
							{ "$ref": "__fluid_insert" },
							{ "$ref": "__fluid_modify" },
							{ "$ref": "__fluid_remove" },
							{ "$ref": "__fluid_move" },
						],
					},
				},
			},
			additionalProperties: false,
		},
		"__fluid_target": {
			type: "object",
			properties: {
				objectId: { type: "number" },
			},
			required: ["objectId"],
			additionalProperties: false,
		},
		"__fluid_place": {
			type: "object",
			properties: {
				objectId: { type: "number" },
				place: { type: "string", enum: ["before", "after"] },
			},
			required: ["objectId", "place"],
			additionalProperties: false,
		},
		"__fluid_range": {
			type: "object",
			properties: {
				from: { "$ref": "__fluid_place" },
				to: { "$ref": "__fluid_place" },
			},
			required: ["from", "to"],
			additionalProperties: false,
		},
		"__fluid_setRoot": {
			type: "object",
			properties: {
				type: { type: "string", enum: ["setRoot"] },
				// this matches the polymorphism in the tree config
				content: { anyOf: [{ type: "number" }, { "$ref": "agentSchema.RootObject" }] },
			},
			required: ["type", "content"],
			additionalProperties: false,
		},
		"__fluid_insert": {
			type: "object",
			properties: {
				type: { type: "string", enum: ["insert"] },
				// content can be any object type (todo: primitives) that appears in an array in the schema
				// note that we omit booleans
				content: {
					anyOf: [{ "$ref": "agentSchema.Vector" }],
				},
				destination: { "$ref": "__fluid_place" },
			},
			required: ["type", "content", "destination"],
			additionalProperties: false,
		},
		"__fluid_modify": {
			type: "object",
			properties: {
				type: { type: "string", enum: ["modify"] },
				target: { "$ref": "__fluid_target" },
				field: { type: "string", enum: ["x", "y", "z", "str", "vectors", "bools"] },
				modification: {
					// modifications can't be typed specifically to the field, so we allow any type that appears in a required or optional field (and include null if there are any optional fields)
					// note that we do not include Vector as a type here because it is only contained in an array in the schema
					anyOf: [
						{ type: "number" },
						{ type: "null" },
						{ type: "string" },
						{ type: "array", items: { "$ref": "agentSchema.Vector" } },
						{ type: "array", items: { type: "boolean" } },
					],
				},
			},
			required: ["type", "target", "field", "modification"],
			additionalProperties: false,
		},
		"__fluid_remove": {
			type: "object",
			properties: {
				type: { type: "string", enum: ["remove"] },
				source: { "$ref": "__fluid_range" },
			},
			required: ["type", "source"],
			additionalProperties: false,
		},
		"__fluid_move": {
			type: "object",
			properties: {
				type: { type: "string", enum: ["move"] },
				source: { "$ref": "__fluid_range" },
				destination: { "$ref": "__fluid_place" },
			},
			required: ["type", "source", "destination"],
			additionalProperties: false,
		},
	},
};
