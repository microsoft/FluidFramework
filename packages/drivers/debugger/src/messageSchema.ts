/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Schema } from "jsonschema";

export const joinContentsSchema = {
	type: "null",
};

export const joinDataSchema = {
	type: "object",
	properties: {
		clientId: { type: "string" },
		detail: {
			type: "object",
			properties: {
				details: { type: "object" },
				mode: { type: "string" },
				permission: { type: "array" },
				scopes: { type: "array" },
				type: { type: "string" },
				user: {
					type: "object",
					properties: {
						id: { type: "string" },
						name: { type: "string" },
						email: { type: "string" },
					},
					required: ["id", "name", "email"],
					additionalProperties: false,
				},
			},
			required: ["user"],
			additionalProperties: false,
		},
	},
	required: ["clientId", "detail"],
	additionalProperties: false,
};

export const proposeContentsSchema = {
	type: ["string", "object"],
	properties: {
		key: { type: "string" },
		value: { type: "string" },
	},
	required: ["key"],
	additionalProperties: false,
};

// The parsed json of a propose message's contents value
export const proposeCodeSchema = {
	type: "object",
	properties: {
		key: { type: "string" },
		value: {
			type: "object",
			properties: {
				package: {
					type: "object",
					properties: {
						name: { type: "string" },
						version: { type: "string" },
						fluid: { type: "object" },
					},
					required: ["name"],
				},
				config: { type: "object" },
			},
			required: ["package", "config"],
			additionalProperties: false,
		},
	},
	required: ["key", "value"],
	additionalProperties: false,
};

// This also needs to be in the root "definitions" key as "entries" to be used
const attachSnapshotEntriesSchema = {
	type: "object",
	properties: {
		mode: { type: "string" },
		path: { type: "string" },
		type: { enum: ["Blob", "Tree"] },
		value: {
			type: "object",
			oneOf: [
				// type Blob
				{
					properties: {
						contents: { type: "string" },
						encoding: { type: "string" },
						// Verify this
						id: { type: "null" },
					},
					required: ["contents", "encoding"],
					additionalProperties: false,
				},
				// type Tree
				{
					properties: {
						entries: {
							type: "array",
							items: { $ref: "#/definitions/entries" },
						},
						// Verify this
						id: { type: "null" },
					},
					required: ["entries"],
					additionalProperties: false,
				},
			],
		},
	},
	required: ["mode", "path", "type", "value"],
	additionalProperties: false,
};

export const attachContentsSchema = {
	definitions: {
		entries: attachSnapshotEntriesSchema,
	},
	type: "object",
	properties: {
		id: { type: "string" },
		snapshot: {
			type: "object",
			properties: {
				entries: {
					type: "array",
					items: { $ref: "#/definitions/entries" },
				},
				// Verify this
				id: { type: "null" },
			},
			required: ["entries"],
			additionalProperties: false,
		},
		type: { type: "string" },
	},
	required: ["id", "snapshot", "type"],
	additionalProperties: false,
};

// can exist at the root level or within an op
export const chunkedOpContentsSchema = {
	type: "object",
	properties: {
		chunkId: { type: "number" },
		contents: { type: "string" },
		originalType: { type: "string" },
		totalChunks: { type: "number" },
	},
	required: ["chunkId", "contents", "originalType", "totalChunks"],
	additionalProperties: false,
};

const contentsSchema = {
	type: "object",
	properties: {
		address: { type: "string" },
		contents: {
			type: "object",
			properties: {
				content: { type: "object" },
				type: { type: "string" },
			},
			required: ["content", "type"],
			additionalProperties: false,
		},
	},
	required: ["address", "contents"],
	additionalProperties: false,
};

// special contents formats from containerRuntime.ts's ContainerMessageType
export const opContentsSchema = {
	definitions: {
		content: contentsSchema,
		entries: attachSnapshotEntriesSchema,
		attachContents: attachContentsSchema,
		chunkedOpContents: chunkedOpContentsSchema,
	},
	type: "object",
	oneOf: [
		{
			properties: {
				type: { enum: ["component"] },
				contents: { $ref: "#/definitions/content" },
			},
			required: ["type", "contents"],
			additionalProperties: false,
		},
		{
			properties: {
				type: { enum: ["attach"] },
				contents: { $ref: "#/definitions/attachContents" },
			},
			required: ["type", "contents"],
			additionalProperties: false,
		},
		{
			properties: {
				type: { enum: ["chunkedOp"] },
				contents: { $ref: "#/definitions/chunkedOpContents" },
			},
			required: ["type", "contents"],
			additionalProperties: false,
		},
		{
			$ref: "#/definitions/content",
		},
	],
};

// "op" message's contents.contents.content schemas

export const opContentsAttachSchema = attachContentsSchema;

// Ops from dds/register-collection's consensusRegisterCollection
export const opContentsRegisterCollectionSchema = {
	type: "object",
	properties: {
		address: { type: "string" },
		contents: {
			type: "object",
			properties: {
				key: { type: "string" },
				refSeq: { type: "number" },
				serializedValue: { type: "string" },
				value: {
					type: "object",
					properties: {
						type: { type: "string" },
						value: {},
					},
					required: ["type", "value"],
					additionalProperties: false,
				},
				type: {
					type: "string",
					enum: ["write"],
				},
			},
			required: ["key", "type"],
			additionalProperties: false,
		},
	},
	required: ["address", "contents"],
	additionalProperties: false,
};

// Ops from dds/map's directory.ts
export const opContentsMapSchema = {
	type: "object",
	properties: {
		address: { type: "string" },
		contents: {
			type: "object",
			properties: {
				key: { type: "string" },
				path: { type: "string" },
				subdirName: { type: "string" },
				value: {
					type: "object",
					properties: {
						type: { type: "string" },
						value: {},
					},
					required: ["type"],
					additionalProperties: false,
				},
				type: {
					type: "string",
					enum: [
						"act",
						"set",
						"delete",
						"clear",
						"createSubDirectory",
						"deleteSubDirectory",
					],
				},
			},
			required: ["type"],
			additionalProperties: false,
			// specific property combinations based on type value
			oneOf: [
				{
					properties: { type: { enum: ["act"] } },
					required: ["key", "path", "value"],
				},
				{
					properties: { type: { enum: ["set"] } },
					required: ["key", "value"],
				},
				{
					properties: { type: { enum: ["delete"] } },
					required: ["key"],
				},
				{
					properties: { type: { enum: ["clear"] } },
					required: ["path"],
				},
				{
					properties: { type: { enum: ["createSubDirectory", "deleteSubDirectory"] } },
					required: ["path", "subdirName"],
				},
			],
		},
	},
	required: ["address", "contents"],
	additionalProperties: false,
};

// from dds/merge-tree's ops.ts and opBuilder.ts
// Note: written op objects in opBuilder.ts are more restrictive than their
// corresponding interface definitions in ops.ts, and the more restrictive
// schema are used here
const mergeTreeRelativePosSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		before: { type: "boolean" },
		offset: { type: "number" },
	},
	additionalProperties: false,
};

const mergeTreeDeltaOpSchema = {
	type: "object",
	properties: {
		type: {
			type: "number",
			minimum: 0 /* MergeTreeDeltaType.INSERT */,
			maximum: 2 /* MergeTreeDeltaType.ANNOTATE */,
		},
	},
	required: ["type"],
	oneOf: [
		{
			properties: {
				type: { enum: [0] },
				seg: { type: ["string", "object"] },
				pos1: { type: "number" },
			},
			required: ["pos1"],
			additionalProperties: false,
		},
		{
			properties: {
				type: { enum: [1] },
				register: { type: "string" },
				pos1: { type: "number" },
				pos2: { type: "number" },
			},
			required: ["pos1"],
			additionalProperties: false,
		},
		{
			properties: {
				type: { enum: [2] },
				pos1: { type: "number" },
				pos2: { type: "number" },
				props: { type: "object" },
				register: { type: "string" },
				relativePos1: { $ref: "#/definitions/relativePos" },
				relativePos2: { $ref: "#/definitions/relativePos" },
			},
			required: ["props"],
			additionalProperties: false,
		},
		// There's something weird with the typings/settings here where this doesn't get
		// recognized as a valid Schema array if more than 1 item has "properties" defined
	] as Schema[],
};

const mergeTreeGroupOpSchema = {
	type: "object",
	properties: {
		ops: {
			type: "array",
			items: { $ref: "#/definitions/deltaOp" },
		},
		type: {
			type: "number",
			minimum: 3 /* MergeTreeDeltaType.GROUP */,
			maximum: 3 /* MergeTreeDeltaType.GROUP */,
		},
	},
	required: ["ops", "type"],
	additionalProperties: false,
};

export const opContentsMergeTreeDeltaOpSchema = {
	definitions: {
		relativePos: mergeTreeRelativePosSchema,
		deltaOp: mergeTreeDeltaOpSchema,
	},
	type: "object",
	properties: {
		address: { type: "string" },
		contents: { $ref: "#/definitions/deltaOp" },
	},
	required: ["address", "contents"],
	additionalProperties: false,
};

export const opContentsMergeTreeGroupOpSchema = {
	definitions: {
		relativePos: mergeTreeRelativePosSchema,
		deltaOp: mergeTreeDeltaOpSchema,
		groupOp: mergeTreeGroupOpSchema,
	},
	type: "object",
	properties: {
		address: { type: "string" },
		contents: { $ref: "#/definitions/groupOp" },
	},
	required: ["address", "contents"],
	additionalProperties: false,
};
