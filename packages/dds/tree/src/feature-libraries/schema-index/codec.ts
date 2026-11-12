/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { VersionDispatchingCodecBuilder, FluidClientVersion } from "../../codec/index.js";
import {
	SchemaFormatVersion,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	decodeFieldSchema,
	encodeFieldSchemaV1,
	encodeFieldSchemaV2,
	storedSchemaDecodeDispatcher,
} from "../../core/index.js";
import { brand, compareStrings } from "../../util/index.js";

import { Format as FormatV1 } from "./formatV1.js";
import { Format as FormatV2 } from "./formatV2.js";
import { Format as FormatV3 } from "./formatV3.js";

/**
 * Encodes stored schema without persisted metadata or application-defined versions.
 *
 * @remarks
 * This legacy format stores only the node and root field definitions; metadata and versions in the input are omitted.
 *
 * @param repo - The stored schema to encode.
 * @returns The V1 representation.
 */
function encodeRepoV1(repo: TreeStoredSchema): FormatV1 {
	const nodeSchema = encodeNodeSchema(repo, (schema) => schema.encodeV1());
	const rootFieldSchema = encodeFieldSchemaV1(repo.rootFieldSchema);
	return {
		version: SchemaFormatVersion.v1,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

/**
 * Encodes stored schema with persisted metadata, but without application-defined versions.
 *
 * @remarks
 * V2 adds metadata to the node and root field definitions while leaving application-defined versions to V3.
 *
 * @param repo - The stored schema to encode.
 * @returns The V2 representation.
 */
function encodeRepoV2(repo: TreeStoredSchema): FormatV2 {
	const nodeSchema = encodeNodeSchema(repo, (schema) => schema.encodeV2());
	const rootFieldSchema = encodeFieldSchemaV2(repo.rootFieldSchema);
	return {
		version: SchemaFormatVersion.v2,
		nodes: nodeSchema,
		root: rootFieldSchema,
	};
}

/**
 * Encodes stored schema with persisted metadata and optional application-defined versions.
 *
 * @remarks
 * V3 reuses V2's schema definitions and adds sorted version pairs, preserving the distinction between absent and empty maps.
 *
 * @param repo - The stored schema to encode.
 * @returns The experimental V3 representation.
 */
function encodeRepoV3(repo: TreeStoredSchema): FormatV3 {
	const { nodes, root } = encodeRepoV2(repo);
	return {
		version: SchemaFormatVersion.v3Experimental,
		nodes,
		root,
		...(repo.schemaVersion === undefined
			? {}
			: {
					// Sorting pairs keeps insertion order from affecting the persisted representation.
					schemaVersion: [...repo.schemaVersion].sort(([a], [b]) => compareStrings(a, b)),
				}),
	};
}

/**
 * Shared logic for encoding node schemas.
 * @param repo - The stored schema to encode.
 * @param encodeValue - A function which encodes a single node schema.
 * @returns The encoded node schema.
 */
function encodeNodeSchema<TFormat>(
	repo: TreeStoredSchema,
	encodeValue: (schema: TreeNodeStoredSchema) => TFormat,
): Record<string, TFormat> {
	const nodeSchema: Record<string, TFormat> = Object.create(null) as Record<string, TFormat>;
	for (const name of [...repo.nodeSchema.keys()].sort()) {
		const schema = repo.nodeSchema.get(name) ?? fail(0xb28 /* missing schema */);
		Object.defineProperty(nodeSchema, name, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: encodeValue(schema),
		});
	}

	return nodeSchema;
}

/**
 * Decodes V1 schema without persisted metadata or application-defined versions.
 *
 * @param f - The encoded schema.
 * @returns The stored schema.
 */
function decodeV1(f: FormatV1): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		const storedSchemaDecoder = storedSchemaDecodeDispatcher.dispatch(schema);

		// No metadata in v1, so pass undefined
		nodeSchema.set(brand(key), storedSchemaDecoder(undefined));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

/**
 * Decodes V2 schema, including persisted metadata but no application-defined versions.
 *
 * @param f - The encoded schema.
 * @returns The stored schema.
 */
function decodeV2(f: FormatV2): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [key, schema] of Object.entries(f.nodes)) {
		const storedSchemaDecoder = storedSchemaDecodeDispatcher.dispatch(schema.kind);

		// Pass in the node metadata
		nodeSchema.set(brand(key), storedSchemaDecoder(schema.metadata));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.root),
		nodeSchema,
	};
}

/**
 * Decodes experimental V3 schema, including optional application-defined versions.
 *
 * @remarks
 * The node and root field definitions are decoded as V2.
 * When a version array is present, its values and canonical ordering are checked before creating an immutable version map.
 *
 * @param f - The encoded schema.
 * @returns The stored schema with a read-only version map when present.
 * @throws A usage error if versions are not non-negative safe integers or identifiers are not sorted and unique.
 */
function decodeV3(f: FormatV3): TreeStoredSchema {
	if (f.schemaVersion === undefined) {
		return decodeV2({ version: SchemaFormatVersion.v2, nodes: f.nodes, root: f.root });
	}
	let previous: string | undefined;
	const entries: [string, number][] = [];
	// Values and canonical ordering require validation beyond the structural format checks.
	for (const [libraryId, version] of f.schemaVersion) {
		if (!Number.isSafeInteger(version) || version < 0) {
			throw new UsageError("Stored schema versions must be non-negative safe integers.");
		}
		if (previous !== undefined && previous >= libraryId) {
			throw new UsageError(
				"Stored schema versions must be sorted by library identifier and contain no duplicates.",
			);
		}
		entries.push([libraryId, version]);
		previous = libraryId;
	}
	return {
		...decodeV2({ version: SchemaFormatVersion.v2, nodes: f.nodes, root: f.root }),
		// An omitted map remains distinct from an explicitly empty one.
		schemaVersion: new Map(entries),
	};
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 */
export const schemaCodecBuilder = VersionDispatchingCodecBuilder.build("Schema", [
	{
		minVersionForCollab: lowestMinVersionForCollab,
		formatVersion: SchemaFormatVersion.v1,
		codec: {
			encode: (data: TreeStoredSchema) => encodeRepoV1(data),
			decode: (data: FormatV1) => decodeV1(data),
			schema: FormatV1,
		},
	},
	{
		minVersionForCollab: FluidClientVersion.v2_43,
		formatVersion: SchemaFormatVersion.v2,
		codec: {
			encode: (data: TreeStoredSchema) => encodeRepoV2(data),
			decode: (data: FormatV2) => decodeV2(data),
			schema: FormatV2,
		},
	},
	{
		minVersionForCollab: undefined,
		formatVersion: SchemaFormatVersion.v3Experimental,
		codec: {
			encode: (data: TreeStoredSchema) => encodeRepoV3(data),
			decode: (data: FormatV3) => decodeV3(data),
			schema: FormatV3,
		},
	},
]);
