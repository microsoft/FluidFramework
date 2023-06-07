/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
// TODO:
// It is unclear if we would want to use the TypeBox compiler
// (which generates code at runtime for maximum validation perf).
// This might be an issue with security policies (ex: no eval) and/or more bundle size that we want.
// We could disable validation or pull in a different validator (like ajv).
// Only using its validation when testing is another option.
// typebox documents using this internal module, so it should be ok to access.
// eslint-disable-next-line import/no-internal-modules
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { assert } from "@fluidframework/common-utils";
import {
	FieldKindIdentifierSchema,
	FieldStoredSchema,
	GlobalFieldKey,
	GlobalFieldKeySchema,
	LocalFieldKey,
	LocalFieldKeySchema,
	Named,
	SchemaData,
	TreeStoredSchema,
	TreeSchemaIdentifier,
	TreeSchemaIdentifierSchema,
	ValueSchema,
} from "../core";
import { brand, fail } from "../util";

const version = "1.0.0" as const;

const FieldSchemaFormatBase = Type.Object({
	kind: FieldKindIdentifierSchema,
	types: Type.Optional(Type.Array(TreeSchemaIdentifierSchema)),
});

const FieldSchemaFormat = Type.Intersect([FieldSchemaFormatBase], { additionalProperties: false });

const NamedLocalFieldSchemaFormat = Type.Intersect(
	[
		FieldSchemaFormatBase,
		Type.Object({
			name: LocalFieldKeySchema,
		}),
	],
	{ additionalProperties: false },
);

const NamedGlobalFieldSchemaFormat = Type.Intersect(
	[
		FieldSchemaFormatBase,
		Type.Object({
			name: GlobalFieldKeySchema,
		}),
	],
	{ additionalProperties: false },
);

const TreeSchemaFormat = Type.Object(
	{
		name: TreeSchemaIdentifierSchema,
		localFields: Type.Array(NamedLocalFieldSchemaFormat),
		globalFields: Type.Array(GlobalFieldKeySchema),
		extraLocalFields: FieldSchemaFormat,
		extraGlobalFields: Type.Boolean(),
		// TODO: don't use external type here.
		value: Type.Enum(ValueSchema),
	},
	{ additionalProperties: false },
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
const Format = Type.Object(
	{
		version: Type.Literal(version),
		treeSchema: Type.Array(TreeSchemaFormat),
		globalFieldSchema: Type.Array(NamedGlobalFieldSchemaFormat),
	},
	{ additionalProperties: false },
);

type Format = Static<typeof Format>;
type FieldSchemaFormat = Static<typeof FieldSchemaFormat>;
type TreeSchemaFormat = Static<typeof TreeSchemaFormat>;
type NamedLocalFieldSchemaFormat = Static<typeof NamedLocalFieldSchemaFormat>;
type NamedGlobalFieldSchemaFormat = Static<typeof NamedGlobalFieldSchemaFormat>;

const CompiledFormat = TypeCompiler.Compile(Format);

const Versioned = TypeCompiler.Compile(
	Type.Object({
		version: Type.String(),
	}),
);

function encodeRepo(repo: SchemaData): Format {
	const treeSchema: TreeSchemaFormat[] = [];
	const globalFieldSchema: NamedGlobalFieldSchemaFormat[] = [];
	for (const [name, schema] of repo.treeSchema) {
		treeSchema.push(encodeTree(name, schema));
	}
	for (const [name, schema] of repo.globalFieldSchema) {
		globalFieldSchema.push(encodeNamedField(name, schema));
	}
	treeSchema.sort(compareNamed);
	globalFieldSchema.sort(compareNamed);
	return {
		version,
		treeSchema,
		globalFieldSchema,
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

function encodeTree(name: TreeSchemaIdentifier, schema: TreeStoredSchema): TreeSchemaFormat {
	const out: TreeSchemaFormat = {
		name,
		extraGlobalFields: schema.extraGlobalFields,
		extraLocalFields: encodeField(schema.extraLocalFields),
		globalFields: [...schema.globalFields].sort(),
		localFields: [...schema.localFields]
			.map(([k, v]) => encodeNamedField(k, v))
			.sort(compareNamed),
		value: schema.value,
	};
	return out;
}

function encodeField(schema: FieldStoredSchema): FieldSchemaFormat {
	const out: FieldSchemaFormat = {
		kind: schema.kind.identifier,
	};
	if (schema.types !== undefined) {
		out.types = [...schema.types];
	}
	return out;
}

function encodeNamedField<T>(name: T, schema: FieldStoredSchema): FieldSchemaFormat & Named<T> {
	return {
		...encodeField(schema),
		name,
	};
}

function decode(f: Format): SchemaData {
	const globalFieldSchema: Map<GlobalFieldKey, FieldStoredSchema> = new Map();
	const treeSchema: Map<TreeSchemaIdentifier, TreeStoredSchema> = new Map();
	for (const field of f.globalFieldSchema) {
		globalFieldSchema.set(field.name, decodeField(field));
	}
	for (const tree of f.treeSchema) {
		treeSchema.set(brand(tree.name), decodeTree(tree));
	}
	return {
		globalFieldSchema,
		treeSchema,
	};
}

function decodeField(schema: FieldSchemaFormat): FieldStoredSchema {
	const out: FieldStoredSchema = {
		// TODO: maybe provide actual FieldKind objects here, error on unrecognized kinds.
		kind: { identifier: schema.kind },
		types: schema.types === undefined ? undefined : new Set(schema.types),
	};
	return out;
}

function decodeTree(schema: TreeSchemaFormat): TreeStoredSchema {
	const out: TreeStoredSchema = {
		extraGlobalFields: schema.extraGlobalFields,
		extraLocalFields: decodeField(schema.extraLocalFields),
		globalFields: new Set(schema.globalFields),
		localFields: new Map(
			schema.localFields.map((field): [LocalFieldKey, FieldStoredSchema] => [
				brand(field.name),
				decodeField(field),
			]),
		),
		value: schema.value,
	};
	return out;
}

/**
 * Synchronous monolithic summarization of schema content.
 *
 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
 *
 * @returns a snapshot of the schema as a string.
 */
export function getSchemaString(data: SchemaData): string {
	const encoded = encodeRepo(data);
	assert(Versioned.Check(encoded), 0x5c6 /* Encoded schema should be versioned */);
	assert(CompiledFormat.Check(encoded), 0x5c7 /* Encoded schema should validate */);
	// Currently no Fluid handles are used, so just use JSON.stringify.
	return JSON.stringify(encoded);
}

/**
 * Parses data, asserts format is the current one.
 */
export function parseSchemaString(data: string): SchemaData {
	// Currently no Fluid handles are used, so just use JSON.parse.
	const parsed = JSON.parse(data);
	if (!Versioned.Check(parsed)) {
		fail("invalid serialized schema: did not have a version");
	}
	// When more versions exist, we can switch on the version here.
	if (!CompiledFormat.Check(parsed)) {
		if (parsed.version !== version) {
			fail("Unexpected version for serialized schema");
		}
		fail("Serialized schema failed validation");
	}
	return decode(parsed);
}
