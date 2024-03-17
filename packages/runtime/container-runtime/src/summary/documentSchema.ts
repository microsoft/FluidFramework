/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";

/**
 * ID Compressor mode.
 * "on" - compressor is On. It's loaded as part of container load. This mode is sticky - once on, compressor is On for all
 * sessions for a given document. This results in IContainerRuntime.idCompressor to be always available.
 * "delayed" - ID compressor bundle is loaded only on establishing of first delta connection, i.e. it does not impact boot of cotnainer.
 * In such mode IContainerRuntime.idCompressor is not made available (unless previous sessions of same document had it "On").
 * The only thing that is available is IContainerRuntime.generateDocumentUniqueId() that provides opportunistically short IDs.
 * "off" - ID compressor is not laoded (unless it is "on" due to previous session for same document having it "on").
 * While IContainerRuntime.generateDocumentUniqueId() is available, it will produce long IDs that are do not compress well.
 *
 * @alpha
 */
export type IdCompressorMode = "on" | "delayed" | undefined;

/**
 * Available compression algorithms for op compression.
 * @alpha
 */
export enum CompressionAlgorithms {
	lz4 = "lz4",
}

/**
 * Options for op compression.
 * @alpha
 */
export interface ICompressionSchema {
	/**
	 * The value the batch's content size must exceed for the batch to be compressed.
	 * By default the value is 600 * 1024 = 614400 bytes. If the value is set to `Infinity`, compression will be disabled.
	 */
	minimumBatchSizeInBytes: number;

	/**
	 * The compression algorithm that will be used to compress the op.
	 * By default the value is `lz4` which is the only compression algorithm currently supported.
	 */
	compressionAlgorithm: CompressionAlgorithms;
}

/** @alpha */
export type DocumentSchemaValueType = string | boolean | string[] | undefined;

/**
 * Document schema information.
 *
 * Used by runtime to make a call if it can understand document schema.
 * If it can't, it should not continue with document and immidiatly fail, preventing random (cryptic) failures
 * down the road and potentially corrupting documents.
 * For now this structure and appropriate interpretation / behavior is focused only on runtime features.
 * In the future that could be interpolated to more areas, including DDSs used, and even possibly - application
 * schema.
 *
 * In most cases values preserved in the document will not dictate if such features should be enabled in a given session.
 * I.e. if compression is mentioned in document schema, this means that runtime version that opens such file must know
 * how to interpret such ops, but does not need to actually use compression itself. That said, some options could be
 * sticky, i.e. influece feature selection for all runtimes openning a document. ID compression is one such example.
 * Currently there is no mechanism to remove feature from this property bag, i.e. once compression was used, even if it's
 * dissbled (through feature gate or code deployment), all existing documents that used compression will continue to fail
 * if opened by clients who do not support compression.
 *
 * For now we are limitting it to just plain properties, and only really simple types, but that can be changed in the future.
 *
 * @alpha
 */
export interface IDocumentSchema extends Record<string, DocumentSchemaValueType> {
	// version that describes how data is stored in this structure.
	// If runtime sees a version it does not understand, it should immidiatly fail and not
	// attempt to interpret any further dafa.
	version: string;
}

/** @alpha */
export interface IDocumentSchemaChangeMessage {
	/** @see ContainerRuntimeDocumentSchemaMessage */
	data: string;
}

/**
 * Current version known properties that define document schema
 * @alpha
 */
export const currentDocumentVersionSchema = "1.0";

/**
 * Current document schema.
 * * @alpha
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IDocumentSchemaCurrent = {
	version: typeof currentDocumentVersionSchema;

	// Should any of IGCRuntimeOptions be here?
	// Should sessionExpiryTimeoutMs be here?

	compressionAlgorithms?: CompressionAlgorithms[];
	chunkingEnabled?: true;
	idCompressorMode?: IdCompressorMode;
	opGroupingEnabled?: true;
};

const documentSchemaSupportedConfigs: Record<string, (string | boolean)[]> = {
	version: [currentDocumentVersionSchema],
	compressionAlgorithms: [CompressionAlgorithms.lz4],
	chunkingEnabled: [true],
	idCompressorMode: ["on", "delayed"],
	opGroupingEnabled: [true],
};

function validateDocumentSchemaProperty(
	value: string | boolean | undefined,
	allowedValues: DocumentSchemaValueType[],
) {
	if (value === undefined) {
		return true;
	}
	const type = typeof value;

	if (
		(type !== "string" && type !== "boolean") ||
		allowedValues === undefined ||
		!allowedValues.includes(value)
	) {
		return false;
	}
	return true;
}

export function checkRuntimeCompatibility(documentSchema?: IDocumentSchema) {
	// Back-compat - we can't do anything about legacy documents.
	// There is no way to validate them, so we are taking a guess that safe deployment processes used by a given app
	// do not run into compat problems.
	if (documentSchema === undefined) {
		return;
	}

	let unknownProperty: string | undefined;

	for (const [name, value] of Object.entries(documentSchema)) {
		const allowedValues = documentSchemaSupportedConfigs[name];
		if (Array.isArray(value)) {
			for (const v of value) {
				if (!validateDocumentSchemaProperty(v, allowedValues)) {
					unknownProperty = name;
				}
			}
		} else {
			if (!validateDocumentSchemaProperty(value, allowedValues)) {
				unknownProperty = name;
			}
		}
	}

	if (documentSchema.version !== currentDocumentVersionSchema || unknownProperty !== undefined) {
		const nameInfo =
			unknownProperty === undefined
				? ""
				: `: Property ${unknownProperty} = ${documentSchema[unknownProperty]}`;
		throw new Error(`document can't be opened with current version of the code${nameInfo}`);
	}
}

function isSameDocumentSchemaValues(v1: DocumentSchemaValueType, v2: DocumentSchemaValueType) {
	if (!Array.isArray(v2) || !Array.isArray(v1)) {
		return v1 === v2;
	}
	if (v1.length !== v2.length) {
		return false;
	}
	for (let i = 0; i < v1.length; i++) {
		if (v1[i] !== v2[i]) {
			return false;
		}
	}
	return true;
}

export function diffDocumentSchemas(
	oldSchema: IDocumentSchemaCurrent,
	newSchema: IDocumentSchemaCurrent,
) {
	const diff: Partial<IDocumentSchema> = {};

	// If there is a version change in schema, then use full schema definition, do not attempt to do any comparison.
	if (newSchema.version !== oldSchema.version) {
		return newSchema;
	}

	for (const [name, value] of Object.entries(newSchema)) {
		if (!isSameDocumentSchemaValues(oldSchema[name], value)) {
			diff[name] = value;
			// version should be always there!
			diff.version = newSchema.version;
		}
	}

	return diff.version !== undefined ? diff : undefined;
}

/** @alpha */
export class DocumentsSchemaController {
	public readonly currentSchema: IDocumentSchemaCurrent;

	constructor(
		existing: boolean,
		public readonly documentMetadataSchema: IDocumentSchema | undefined,
		compressionAlgorithm: CompressionAlgorithms | undefined,
		idCompressorMode: IdCompressorMode,
		groupedBatchingEnabled: boolean,
	) {
		const oldDocumentSchema: IDocumentSchemaCurrent =
			(documentMetadataSchema as IDocumentSchemaCurrent) ?? {
				version: currentDocumentVersionSchema,
			};

		// Enabling the IdCompressor is a one-way operation and we only want to
		// allow new containers to turn it on
		if (existing) {
			// This setting has to be sticky for correctness:
			// 1) if compressior is OFF, it can't be enabled, as already running clients (in given document session) do not know
			//    how to process compressor ops
			// 2) if it's ON, then all sessions should load compressor right away
			// 3) Same logic applies for "delayed" mode
			// Maybe in the future we will need to enabled (and figure how to do it safely) "delayed" -> "on" change.
			// We could do "off" -> "on" transtition too, if all clients start loading compressor (but not using it initially) and do so for a while -
			// this will allow clients to eventually to disregard "off" setting (when it's safe so) and start using compressor in future sessions.
			// Everyting is possible, but it needs to be designed and executed carefully, when such need arises.
			idCompressorMode = (documentMetadataSchema as IDocumentSchemaCurrent)?.idCompressorMode;
		}

		const compressionSchemas: CompressionAlgorithms[] =
			oldDocumentSchema.compressionAlgorithms ?? [];
		if (
			compressionAlgorithm !== undefined &&
			!compressionSchemas.includes(compressionAlgorithm)
		) {
			compressionSchemas.push(compressionAlgorithm);
		}

		this.currentSchema = {
			version: currentDocumentVersionSchema,
			compressionAlgorithms: compressionSchemas,
			chunkingEnabled: true,
			idCompressorMode,
			opGroupingEnabled:
				oldDocumentSchema.opGroupingEnabled ?? groupedBatchingEnabled ? true : undefined,
		};

		// Validate that schema we are operating in is actually a schema we consider compatible with current runtime.
		checkRuntimeCompatibility(this.currentSchema);

		// If it's a new file, there is no need to advertise schema, it will be written into the document on document creation.
		const diffSchema = !existing
			? undefined
			: diffDocumentSchemas(oldDocumentSchema, this.currentSchema);
		assert(
			Object.keys(oldDocumentSchema).length === 2 || diffSchema === undefined,
			"temp test",
		);
	}

	public onMessageSent() {}

	public processDocumentSchemaOp(message: IDocumentSchemaChangeMessage) {}

	public onDisconnect() {}
}
