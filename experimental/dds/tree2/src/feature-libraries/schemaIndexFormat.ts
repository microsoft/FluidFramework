/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import {
	FieldKindIdentifierSchema,
	TreeFieldStoredSchema,
	FieldKey,
	FieldKeySchema,
	TreeStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeSchemaIdentifierSchema,
	ValueSchema,
} from "../core";
import { brand, fail, Named } from "../util";
import { ICodecOptions, IJsonCodec } from "../codec";

const version = "1.0.0" as const;

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Optional(Type.Array(TreeSchemaIdentifierSchema)),
});

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const FieldSchemaFormat = Type.Composite([FieldSchemaFormatBase], noAdditionalProps);

const NamedFieldSchemaFormat = Type.Composite(
	[
		FieldSchemaFormatBase,
		Type.Object({
			name: FieldKeySchema,
		}),
	],
	noAdditionalProps,
);

const TreeNodeSchemaFormat = Type.Object(
	{
		name: TreeSchemaIdentifierSchema,
		objectNodeFields: Type.Array(NamedFieldSchemaFormat),
		mapFields: Type.Optional(FieldSchemaFormat),
		// TODO: don't use external type here!
		leafValue: Type.Optional(Type.Enum(ValueSchema)),
	},
	noAdditionalProps,
);

/**
 * Format for encoding as json.
 *
 * For consistency all lists are sorted and undefined values are omitted.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 */
export const Format = Type.Object(
	{
		version: Type.Literal(version),
		nodeSchema: Type.Array(TreeNodeSchemaFormat),
		rootFieldSchema: FieldSchemaFormat,
	},
	noAdditionalProps,
);

export type Format = Static<typeof Format>;
type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
type TreeNodeSchemaFormat = Static<typeof TreeNodeSchemaFormat>;
type NamedFieldSchemaFormat = Static<typeof NamedFieldSchemaFormat>;

const Versioned = Type.Object({
	version: Type.String(),
});
type Versioned = Static<typeof Versioned>;

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
		leafValue: schema.leafValue,
	};
	return out;
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
		leafValue: schema.leafValue,
	};
	return out;
}

/**
 * Creates a codec which performs synchronous monolithic encoding of schema content.
 *
 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
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
