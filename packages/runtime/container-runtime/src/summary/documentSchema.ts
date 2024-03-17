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
export type DocumentSchemaValueType = string | boolean | number | string[] | undefined;

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

	// Sequence number when this schema became active.
	refSeq: number;
}

/**
 * The meaning of refSeq field is different in such messages (compared to other usages of IDocumentSchemaCurrent)
 * ContainerMessageType.DocumentSchemaChange messages use CAS (Compare-and-swap) semantics, and convey
 * regSeq of last known schema change (known to a client proposing schema change).
 * @see ContainerRuntimeDocumentSchemaMessage
 * @alpha
 */
export type IDocumentSchemaChangeMessage = IDocumentSchema;

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
	refSeq: number;

	// Tells if client uses legacy behavior of changing schema.
	// This means - changing schema without leveraging schema change ops.
	legacyBehaviour: boolean;

	// Should any of IGCRuntimeOptions be here?
	// Should sessionExpiryTimeoutMs be here?

	compressionAlgorithms?: CompressionAlgorithms[];
	chunkingEnabled?: true;
	idCompressorMode?: IdCompressorMode;
	opGroupingEnabled?: true;
};

const documentSchemaSupportedConfigs: Record<string, (string | boolean)[]> = {
	version: [currentDocumentVersionSchema],
	legacyBehaviour: [true, false],
	compressionAlgorithms: [CompressionAlgorithms.lz4],
	chunkingEnabled: [true],
	idCompressorMode: ["on", "delayed"],
	opGroupingEnabled: [true],
};

function validateDocumentSchemaProperty(
	value: string | boolean | number | undefined,
	allowedValues: DocumentSchemaValueType[],
) {
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
		case "undefined":
			break;
		default:
			return false;
	}
	return allowedValues.includes(value);
}

function checkRuntimeCompatibility(documentSchema?: IDocumentSchema) {
	// Back-compat - we can't do anything about legacy documents.
	// There is no way to validate them, so we are taking a guess that safe deployment processes used by a given app
	// do not run into compat problems.
	if (documentSchema === undefined) {
		return;
	}

	let unknownProperty: string | undefined;

	for (const [name, value] of Object.entries(documentSchema)) {
		const allowedValues = documentSchemaSupportedConfigs[name];
		if (name === "refSeq") {
			if (typeof value !== "number" || value < 0 || !Number.isInteger(value)) {
				unknownProperty = name;
			}
		} else if (allowedValues === undefined) {
			unknownProperty = name;
		} else if (Array.isArray(value)) {
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

/** @alpha */
export class DocumentsSchemaController {
	private legacyBehaviour: boolean;
	private readonly futureSchema: IDocumentSchemaCurrent;
	private oldDocumentSchema: IDocumentSchemaCurrent;
	private sendOp = false;
	private attemptToSendOps: boolean = true;

	public get currentSchema() {
		return this.legacyBehaviour ? this.futureSchema : this.oldDocumentSchema;
	}

	constructor(
		legacyBehaviour: boolean,
		existing: boolean,
		documentMetadataSchema: IDocumentSchema | undefined,
		compressionAlgorithm: CompressionAlgorithms | undefined,
		idCompressorModeArg: IdCompressorMode,
		groupedBatchingEnabled: boolean,
	) {
		this.oldDocumentSchema = (documentMetadataSchema as IDocumentSchemaCurrent) ?? {
			version: currentDocumentVersionSchema,
			// see comment in summarizeDocumentSchema() on why it has to stay zero
			refSeq: 0,
			// It probably does not matter that much that we put true for for existig files.
			// But logically, if it's existing file and it has no schema, then it was written by legacy client.
			// If it's a new file, then we define it's legacy status.
			legacyBehaviour: existing ? true : legacyBehaviour,
		};

		// Use legacy behavior only if both document and options tell us to use it.
		// Otherwise it's no longer legacy time!
		this.legacyBehaviour = this.oldDocumentSchema.legacyBehaviour && legacyBehaviour;

		checkRuntimeCompatibility(documentMetadataSchema);

		// Enabling the IdCompressor is a one-way operation and we only want to
		// allow new containers to turn it on.
		// This setting has to be sticky for correctness:
		// 1) if compressior is OFF, it can't be enabled, as already running clients (in given document session) do not know
		//    how to process compressor ops
		// 2) if it's ON, then all sessions should load compressor right away
		// 3) Same logic applies for "delayed" mode
		// Maybe in the future we will need to enabled (and figure how to do it safely) "delayed" -> "on" change.
		// We could do "off" -> "on" transtition too, if all clients start loading compressor (but not using it initially) and do so for a while -
		// this will allow clients to eventually to disregard "off" setting (when it's safe so) and start using compressor in future sessions.
		// Everyting is possible, but it needs to be designed and executed carefully, when such need arises.
		const idCompressorMode = !existing
			? idCompressorModeArg
			: this.oldDocumentSchema.idCompressorMode;

		const compressionSchemas: CompressionAlgorithms[] =
			this.oldDocumentSchema.compressionAlgorithms ?? [];
		if (
			compressionAlgorithm !== undefined &&
			!compressionSchemas.includes(compressionAlgorithm)
		) {
			compressionSchemas.push(compressionAlgorithm);
		}

		this.futureSchema = {
			version: currentDocumentVersionSchema,
			refSeq: this.oldDocumentSchema.refSeq,
			legacyBehaviour: this.legacyBehaviour,
			compressionAlgorithms: compressionSchemas,
			chunkingEnabled: true,
			idCompressorMode,
			opGroupingEnabled:
				this.oldDocumentSchema.opGroupingEnabled ?? groupedBatchingEnabled
					? true
					: undefined,
		};

		// Validate that schema we are operating in is actually a schema we consider compatible with current runtime.
		checkRuntimeCompatibility(this.futureSchema);

		// setup state relative to sending ops
		this.onDisconnect();
	}

	public summarizeDocumentSchema(refSeq: number): IDocumentSchema | undefined {
		// For legacy behavior, we can write nothing (return undefined).
		// It does not buy us anything, as whatever written in summary does not actualy impact clients operating in legacy mode.
		// But it will help with transition out of legacy mode, as clients transitioning out of would be able to use all the features they
		// are using today right away, without a need to go through schema transition (and thus for a session or two losing ability to use all the features)

		const schema = this.currentSchema;

		// It's important to keep refSeq at zero in legacy mode, such that transition out of it is simple and we do not have
		// race conditions. If we put any other number (including latest seq number), then we will have two clients
		// (loading from two different summaries) with different numbers, and eventual consistency will be broken as schema change ops will be
		//  interpretted differently by those two clients.
		assert(!this.legacyBehaviour || schema.refSeq === 0, "refSeq should be zero");

		return schema;
	}

	public onMessageSent(send: (content: IDocumentSchemaChangeMessage) => void) {
		if (this.sendOp) {
			this.sendOp = false;
			assert(!this.legacyBehaviour && !this.futureSchema.legacyBehaviour, "not legacy");
			send({
				...this.futureSchema,
				refSeq: this.oldDocumentSchema.refSeq,
			});
		}
	}

	public processDocumentSchemaOp(message: IDocumentSchemaChangeMessage, local: boolean) {
		assert(!local || !this.legacyBehaviour, "not sending ops");
		assert(message.refSeq >= this.oldDocumentSchema.refSeq, "");
		if (message.refSeq !== this.oldDocumentSchema.refSeq) {
			// CAS failed
			return;
		}

		// Changes are in effect. Immidiatly check that this client understands these changes
		checkRuntimeCompatibility(message);

		this.oldDocumentSchema = message as IDocumentSchemaCurrent;

		// legacy behavior is automatically off for the file once someone sends a schema op -
		// from now on it's fully controlled by ops.
		// This is very important, as summarizeDocumentSchema() should use this new schema!
		this.legacyBehaviour = false;

		// Stop attempting changing schema.
		// If it was local op, then we succeeded and do not need to try again.
		// If it was remote op, then some changes happened to schema.
		// We would need to recalculate this.futureSchema by mering changes that we just received.
		// Avoid this complexity for now - a new client session (loading from new summary with these changes)
		// will automatically do this recalculation and will figure out
		this.attemptToSendOps = false;
		this.sendOp = false;
	}

	public onDisconnect() {
		this.sendOp = !this.legacyBehaviour && this.attemptToSendOps;
	}
}
