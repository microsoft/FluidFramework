/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKindIdentifier,
	FieldSchema,
	GlobalFieldKey,
	LocalFieldKey,
	Named,
	SchemaData,
	TreeSchema,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../core";
import { brand } from "../util";

const version = "1.0.0" as const;

/**
 * Format for encoding as json.
 *
 * For consistency all lists are sorted and undefined values are omitted.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 */
interface Format {
	version: typeof version;
	treeSchema: TreeSchemaFormat[];
	globalFieldSchema: NamedFieldSchemaFormat[];
}

interface TreeSchemaFormat {
	name: TreeSchemaIdentifier;
	localFields: NamedFieldSchemaFormat[];
	globalFields: GlobalFieldKey[];
	extraLocalFields: FieldSchemaFormat;
	extraGlobalFields: boolean;
	value: ValueSchema;
}

type NamedFieldSchemaFormat = FieldSchemaFormat & Named<string>;

interface FieldSchemaFormat {
	kind: FieldKindIdentifier;
	types?: TreeSchemaIdentifier[];
}

function encodeRepo(repo: SchemaData): Format {
	const treeSchema: TreeSchemaFormat[] = [];
	const globalFieldSchema: NamedFieldSchemaFormat[] = [];
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

function encodeTree(name: TreeSchemaIdentifier, schema: TreeSchema): TreeSchemaFormat {
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

function encodeField(schema: FieldSchema): FieldSchemaFormat {
	const out: FieldSchemaFormat = {
		kind: schema.kind,
	};
	if (schema.types !== undefined) {
		out.types = [...schema.types];
	}
	return out;
}

function encodeNamedField(name: string, schema: FieldSchema): NamedFieldSchemaFormat {
	return {
		...encodeField(schema),
		name,
	};
}

function decode(f: Format): SchemaData {
	const globalFieldSchema: Map<GlobalFieldKey, FieldSchema> = new Map();
	const treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	for (const field of f.globalFieldSchema) {
		globalFieldSchema.set(brand(field.name), decodeField(field));
	}
	for (const tree of f.treeSchema) {
		treeSchema.set(brand(tree.name), decodeTree(tree));
	}
	return {
		globalFieldSchema,
		treeSchema,
	};
}

function decodeField(schema: FieldSchemaFormat): FieldSchema {
	const out: FieldSchema = {
		kind: schema.kind,
		types: schema.types === undefined ? undefined : new Set(schema.types),
	};
	return out;
}

function decodeTree(schema: TreeSchemaFormat): TreeSchema {
	const out: TreeSchema = {
		extraGlobalFields: schema.extraGlobalFields,
		extraLocalFields: decodeField(schema.extraLocalFields),
		globalFields: new Set(schema.globalFields),
		localFields: new Map(
			schema.localFields.map((field): [LocalFieldKey, FieldSchema] => [
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
	// Currently no Fluid handles are used, so just use JSON.stringify.
	return JSON.stringify(encoded);
}

/**
 * Parses data, asserts format is the current one.
 */
export function parseSchemaString(data: string): SchemaData {
	// Currently no Fluid handles are used, so just use JSON.parse.
	const parsed = JSON.parse(data) as Format;
	assert(parsed.version === version, 0x3d7 /* Got unsupported schema format version */);
	return decode(parsed);
}
