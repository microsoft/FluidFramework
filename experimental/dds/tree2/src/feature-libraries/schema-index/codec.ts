/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TreeFieldStoredSchema,
	TreeStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	FieldKey,
	ValueSchema,
} from "../../core";
import { brand, fail, invertMap, Named } from "../../util";
import { ICodecOptions, IJsonCodec } from "../../codec";
import {
	FieldSchemaFormat,
	Format,
	PersistedValueSchema,
	TreeNodeSchemaFormat,
	Versioned,
	version,
} from "./format";

export function encodeRepo(repo: TreeStoredSchema): Format {
	const treeNodeSchema: TreeNodeSchemaFormat[] = [];
	const rootFieldSchema = encodeField(repo.rootFieldSchema);
	for (const [name, schema] of repo.nodeSchema) {
		treeNodeSchema.push(encodeTree(name, schema));
	}
	treeNodeSchema.sort(compareNamed);
	return {
		version,
		nodeSchema: treeNodeSchema,
		rootFieldSchema,
	};
}

function compareNamed(a: Named<string>, b: Named<string>) {
	if (a.name < b.name) {
		return -1;
	}
	if (a.name > b.name) {
		return 1;
	}
	return 0;
}

function encodeTree(
	name: TreeNodeSchemaIdentifier,
	schema: TreeNodeStoredSchema,
): TreeNodeSchemaFormat {
	const out: TreeNodeSchemaFormat = {
		name,
		mapFields: schema.mapFields === undefined ? undefined : encodeField(schema.mapFields),
		objectNodeFields: [...schema.objectNodeFields]
			.map(([k, v]) => encodeNamedField(k, v))
			.sort(compareNamed),
		...(schema.leafValue === undefined
			? {}
			: { leafValue: encodeValueSchema(schema.leafValue) }),
	};
	return out;
}

const valueSchemaEncode = new Map([
	[ValueSchema.Number, PersistedValueSchema.Number],
	[ValueSchema.String, PersistedValueSchema.String],
	[ValueSchema.Boolean, PersistedValueSchema.Boolean],
	[ValueSchema.FluidHandle, PersistedValueSchema.FluidHandle],
	[ValueSchema.Null, PersistedValueSchema.Null],
]);

const valueSchemaDecode = invertMap(valueSchemaEncode);

function encodeValueSchema(inMemory: ValueSchema): PersistedValueSchema {
	return valueSchemaEncode.get(inMemory) ?? fail("missing PersistedValueSchema");
}

function decodeValueSchema(inMemory: PersistedValueSchema): ValueSchema {
	return valueSchemaDecode.get(inMemory) ?? fail("missing ValueSchema");
}

function encodeField(schema: TreeFieldStoredSchema): FieldSchemaFormat {
	const out: FieldSchemaFormat = {
		kind: schema.kind.identifier,
	};
	if (schema.types !== undefined) {
		out.types = [...schema.types];
	}
	return out;
}

function encodeNamedField<T>(name: T, schema: TreeFieldStoredSchema): FieldSchemaFormat & Named<T> {
	return {
		...encodeField(schema),
		name,
	};
}

function decode(f: Format): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const tree of f.nodeSchema) {
		nodeSchema.set(brand(tree.name), decodeTree(tree));
	}
	return {
		rootFieldSchema: decodeField(f.rootFieldSchema),
		nodeSchema,
	};
}

function decodeField(schema: FieldSchemaFormat): TreeFieldStoredSchema {
	const out: TreeFieldStoredSchema = {
		// TODO: maybe provide actual FieldKind objects here, error on unrecognized kinds.
		kind: { identifier: schema.kind },
		types: schema.types === undefined ? undefined : new Set(schema.types),
	};
	return out;
}

function decodeTree(schema: TreeNodeSchemaFormat): TreeNodeStoredSchema {
	const out: TreeNodeStoredSchema = {
		mapFields: schema.mapFields === undefined ? undefined : decodeField(schema.mapFields),
		objectNodeFields: new Map(
			schema.objectNodeFields.map((field): [FieldKey, TreeFieldStoredSchema] => [
				brand(field.name),
				decodeField(field),
			]),
		),
		leafValue: schema.leafValue === undefined ? undefined : decodeValueSchema(schema.leafValue),
	};
	return out;
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 *
 * TODO: This should reuse common utilities to do version checking and schema checking.
 */
export function makeSchemaCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<TreeStoredSchema, Format> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(Format);
	return {
		encode: (data: TreeStoredSchema) => {
			const encoded = encodeRepo(data);
			assert(
				versionedValidator.check(encoded),
				0x5c6 /* Encoded schema should be versioned */,
			);
			assert(formatValidator.check(encoded), 0x5c7 /* Encoded schema should validate */);
			return encoded;
		},
		decode: (data: Format) => {
			if (!versionedValidator.check(data)) {
				fail("invalid serialized schema: did not have a version");
			}
			// When more versions exist, we can switch on the version here.
			if (data.version !== version) {
				fail("Unexpected version for serialized schema");
			}
			if (!formatValidator.check(data)) {
				fail("Serialized schema failed validation");
			}
			return decode(data);
		},
	};
}
