/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	TreeStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	schemaFormat,
	BrandedTreeNodeSchemaDataFormat,
	decodeFieldSchema,
	encodeFieldSchema,
	storedSchemaDecodeDispatcher,
} from "../../core";
import { brand, compareNamed, fail, fromErased } from "../../util";
import { ICodecOptions, IJsonCodec } from "../../codec";
import { Format, TreeNodeSchemaFormat, Versioned } from "./format";

export function encodeRepo(repo: TreeStoredSchema): Format {
	const treeNodeSchema: TreeNodeSchemaFormat[] = [];
	const rootFieldSchema = encodeFieldSchema(repo.rootFieldSchema);
	for (const [name, schema] of repo.nodeSchema) {
		treeNodeSchema.push(encodeTree(name, schema));
	}
	treeNodeSchema.sort(compareNamed);
	return {
		version: schemaFormat.version,
		nodeSchema: treeNodeSchema,
		rootFieldSchema,
	};
}

function encodeTree(
	name: TreeNodeSchemaIdentifier,
	schema: TreeNodeStoredSchema,
): TreeNodeSchemaFormat {
	const out: TreeNodeSchemaFormat = {
		name,
		data: fromErased<BrandedTreeNodeSchemaDataFormat>(schema.encode()),
	};
	return out;
}
function decodeTree(schema: TreeNodeSchemaFormat): TreeNodeStoredSchema {
	return storedSchemaDecodeDispatcher.dispatch(schema.data);
}

function decode(f: Format): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const tree of f.nodeSchema) {
		nodeSchema.set(brand(tree.name), decodeTree(tree));
	}
	return {
		rootFieldSchema: decodeFieldSchema(f.rootFieldSchema),
		nodeSchema,
	};
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

			const extraValidator = validator.compile(schemaFormat.FieldSchemaFormat);
			assert(
				extraValidator.check(encoded.rootFieldSchema),
				"rootFieldSchema schema should validate",
			);

			assert(formatValidator.check(encoded), 0x5c7 /* Encoded schema should validate */);
			return encoded;
		},
		decode: (data: Format) => {
			if (!versionedValidator.check(data)) {
				fail("invalid serialized schema: did not have a version");
			}
			// When more versions exist, we can switch on the version here.
			if (data.version !== schemaFormat.version) {
				fail("Unexpected version for serialized schema");
			}
			if (!formatValidator.check(data)) {
				fail("Serialized schema failed validation");
			}
			return decode(data);
		},
	};
}
