/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidClientVersion, ICodecOptions } from "../../codec/index.js";
import { SchemaVersion } from "../../core/index.js";
import {
	defaultSchemaPolicy,
	encodeTreeSchema,
	makeSchemaCodec,
} from "../../feature-libraries/index.js";
import {
	clientVersionToSchemaVersion,
	type FormatV1,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/schema-index/index.js";
import type { JsonCompatible } from "../../util/index.js";
import { normalizeFieldSchema, type ImplicitFieldSchema } from "../schemaTypes.js";
import { simpleToStoredSchema } from "../toStoredSchema.js";
import type { SchemaCompatibilityStatus } from "./tree.js";
import { SchemaCompatibilityTester } from "./schemaCompatibilityTester.js";
import type { SimpleTreeSchema } from "../simpleSchema.js";

/**
 * Dumps the "persisted" schema subset of the provided `schema` into a deterministic JSON-compatible, semi-human-readable format.
 *
 * @param schema - The schema to dump.
 *
 * @remarks
 * This can be used to help inspect schema for debugging, and to save a snapshot of schema to help detect and review changes to an applications schema.
 * This format is also compatible with {@link ViewContent.schema}, {@link comparePersistedSchema} and {@link persistedToSimpleSchema}.
 *
 * This only includes the "persisted" subset of schema information, which means the portion which gets included in documents.
 * It thus uses "persisted" keys, see {@link FieldProps.key}.
 *
 * If two schema have identical "persisted" schema, then they are considered {@link SchemaCompatibilityStatus.isEquivalent|equivalent}.
 *
 * See also {@link comparePersistedSchema}.
 *
 * @example
 * An application could use this API to generate a `schema.json` file when it first releases,
 * then test that the schema is sill compatible with documents from that version with a test like :
 * ```typescript
 * assert.deepEqual(extractPersistedSchema(MySchema, FluidClientVersion.v2_0), require("./schema.json"));
 * ```
 *
 * @privateRemarks
 * This currently uses the schema summary format, but that could be changed to something more human readable (particularly if the encoded format becomes less human readable).
 * This intentionally does not leak the format types in the API.
 *
 * Public API surface uses "persisted" terminology while internally we use "stored".
 * @alpha
 */
export function extractPersistedSchema(
	schema: SimpleTreeSchema,
	oldestCompatibleClient: FluidClientVersion,
): JsonCompatible {
	const stored = simpleToStoredSchema(schema);
	const schemaWriteVersion = clientVersionToSchemaVersion(oldestCompatibleClient);
	return encodeTreeSchema(stored, schemaWriteVersion);
}

/**
 * Compares two schema extracted using {@link extractPersistedSchema}.
 * Reports the same compatibility that {@link TreeView.compatibility} would report if
 * opening a document that used the `persisted` schema and provided `view` to {@link ViewableTree.viewWith}.
 *
 * @param persisted - Schema persisted for a document. Typically persisted alongside the data and assumed to describe that data.
 * @param view - Schema which would be used to view persisted content.
 * @param options - {@link ICodecOptions} used when parsing the provided schema.
 * @param canInitialize - Passed through to the return value unchanged and otherwise unused.
 * @returns The {@link SchemaCompatibilityStatus} a {@link TreeView} would report for this combination of schema.
 *
 * @remarks
 * This uses the persisted formats for schema, meaning it only includes data which impacts compatibility.
 * It also uses the persisted format so that this API can be used in tests to compare against saved schema from previous versions of the application.
 *
 * @example
 * An application could use {@link extractPersistedSchema} to generate a `schema.json` file for various versions of the app,
 * then test that documents using those schema can be upgraded to work with the current schema using a test like:
 * ```typescript
 * assert(
 * 	comparePersistedSchema(
 * 		require("./schema.json"),
 * 		MySchema,
 * 		{ jsonValidator: typeboxValidator },
 * 		false,
 * 	).canUpgrade,
 * );
 * ```
 * @alpha
 */
export function comparePersistedSchema(
	persisted: JsonCompatible,
	view: ImplicitFieldSchema,
	options: ICodecOptions,
): Omit<SchemaCompatibilityStatus, "canInitialize"> {
	// Any version can be passed down to makeSchemaCodec here.
	// We only use the decode part, which always dispatches to the correct codec based on the version in the data, not the version passed to `makeSchemaCodec`.
	const schemaCodec = makeSchemaCodec(options, SchemaVersion.v1);
	const stored = schemaCodec.decode(persisted as FormatV1);
	const viewSchema = new SchemaCompatibilityTester(
		defaultSchemaPolicy,
		{},
		normalizeFieldSchema(view),
	);
	return viewSchema.checkCompatibility(stored);
}
