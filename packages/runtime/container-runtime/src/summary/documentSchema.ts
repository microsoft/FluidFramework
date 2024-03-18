/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { DataCorruptionError } from "@fluidframework/telemetry-utils";

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

/** @alpha */
export type DocumentSchemaValueType = string | boolean | number | undefined;

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
 * I.e. if compression is mentioned in document schema, this means that runtime version that opens such document must know
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
export interface IDocumentSchema {
	// version that describes how data is stored in this structure.
	// If runtime sees a version it does not understand, it should immidiatly fail and not
	// attempt to interpret any further dafa.
	version: string;

	// Sequence number when this schema became active.
	refSeq: number;

	runtime: Record<string, DocumentSchemaValueType>;
}

/**
 * Content of the type=ContainerMessageType.DocumentSchemaChange ops.
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
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IDocumentSchemaCurrent = {
	version: typeof currentDocumentVersionSchema;
	refSeq: number;

	runtime: {
		// Tells if client uses legacy behavior of changing schema.
		// - Legacy behavior - changing schema without leveraging schema change ops.
		// - New behavior - changes in schema require ops and take into affect with delay.
		newBehavior?: true;

		// Should any of IGCRuntimeOptions be here?
		// Should sessionExpiryTimeoutMs be here?

		idCompressorMode?: IdCompressorMode;
		opGroupingEnabled?: true;
		compressionLz4?: true;
	};
};

interface IProperty<T = unknown> {
	and: (t1: T, t2: T) => T;
	or: (t1: T, t2: T) => T;
	validate(t: unknown): boolean;
}

class TrueOrUndefined implements IProperty<true | undefined> {
	public and(t1?: true, t2?: true) {
		return t1 === true && t2 === true ? true : undefined;
	}

	public or(t1?: true, t2?: true) {
		return t1 === true || t2 === true ? true : undefined;
	}

	public validate(t: unknown) {
		return t === undefined || t === true;
	}
}

class TrueOrUndefinedMax extends TrueOrUndefined {
	public and(t1?: true, t2?: true) {
		return this.or(t1, t2);
	}
}

class MultiChoice implements IProperty<string | undefined> {
	constructor(private readonly choices: string[]) {}

	public and(t1?: string, t2?: string) {
		if (t1 === undefined || t2 === undefined) {
			return undefined;
		}
		return this.choices[Math.min(this.choices.indexOf(t1), this.choices.indexOf(t2))];
	}

	public or(t1?: string, t2?: string) {
		if (t1 === undefined || t2 === undefined) {
			return undefined;
		}
		return this.choices[Math.max(this.choices.indexOf(t1), this.choices.indexOf(t2))];
	}

	public validate(t: unknown) {
		return t === undefined || (typeof t === "string" && this.choices.includes(t));
	}
}

/**
 * Helper structure to valida if a schema is compatible with existing code.
 */
const documentSchemaSupportedConfigs = {
	newBehavior: new TrueOrUndefinedMax(), // once new behavior shows up, it's sticky
	idCompressorMode: new MultiChoice(["on", "delayed"]),
	opGroupingEnabled: new TrueOrUndefined(),
	compressionLz4: new TrueOrUndefined(),
};

/**
 * Checks if a given schema is compatible with current code, i.e. if current code can understand all the features of that schema.
 * If schema is not compatible with current code, it throws an exception.
 * @param documentSchema - current schema
 */
function checkRuntimeCompatibility(documentSchema?: IDocumentSchema) {
	// Back-compat - we can't do anything about legacy documents.
	// There is no way to validate them, so we are taking a guess that safe deployment processes used by a given app
	// do not run into compat problems.
	if (documentSchema === undefined) {
		return;
	}

	const msg = "Document can't be opened with current version of the code";
	if (documentSchema.version !== currentDocumentVersionSchema) {
		throw new DataCorruptionError(msg, {
			version: documentSchema.version,
			codeVersion: currentDocumentVersionSchema,
		});
	}

	let unknownProperty: string | undefined;

	const regSeq = documentSchema.refSeq;
	if (typeof regSeq !== "number" || regSeq < 0 || !Number.isInteger(regSeq)) {
		unknownProperty = "refSeq";
	} else if (documentSchema.runtime === null || typeof documentSchema.runtime !== "object") {
		unknownProperty = "runtime";
	} else {
		for (const [name, value] of Object.entries(documentSchema.runtime)) {
			const validator = documentSchemaSupportedConfigs[name] as IProperty | undefined;
			if (validator === undefined || !validator.validate(value)) {
				unknownProperty = `runtime/${name}`;
			}
		}
	}

	if (unknownProperty !== undefined) {
		const value = documentSchema[unknownProperty];
		throw new DataCorruptionError(msg, {
			codeVersion: currentDocumentVersionSchema,
			property: unknownProperty,
			value,
		});
	}
}

function and(sc1: IDocumentSchemaCurrent, sc2: IDocumentSchemaCurrent): IDocumentSchemaCurrent {
	const runtime = {};
	for (const key of new Set([...Object.keys(sc1.runtime), ...Object.keys(sc2.runtime)])) {
		runtime[key] = (documentSchemaSupportedConfigs[key] as IProperty).and(
			sc1.runtime[key],
			sc2.runtime[key],
		);
	}
	return {
		version: currentDocumentVersionSchema,
		refSeq: sc1.refSeq,
		runtime,
	} as unknown as IDocumentSchemaCurrent;
}

function or(sc1: IDocumentSchemaCurrent, sc2: IDocumentSchemaCurrent): IDocumentSchemaCurrent {
	const runtime = {};
	for (const key of new Set([...Object.keys(sc1.runtime), ...Object.keys(sc2.runtime)])) {
		runtime[key] = (documentSchemaSupportedConfigs[key] as IProperty).or(
			sc1.runtime[key],
			sc2.runtime[key],
		);
	}
	return {
		version: currentDocumentVersionSchema,
		refSeq: sc1.refSeq,
		runtime,
	} as unknown as IDocumentSchemaCurrent;
}

function same(sc1: IDocumentSchemaCurrent, sc2: IDocumentSchemaCurrent): boolean {
	for (const key of new Set([...Object.keys(sc1.runtime), ...Object.keys(sc2.runtime)])) {
		// If schemas differ only by type of behavior, then we should not send schema change ops!
		if (key !== "newBehavior" && sc1.runtime[key] !== sc2.runtime[key]) {
			return false;
		}
	}
	return true;
}

function boolToProp(b: boolean) {
	return b ? true : undefined;
}

/* eslint-disable jsdoc/check-indentation */

/**
 * Controller of document schema.
 *
 * This class manages current document schema and transitions between document schemas.
 * New features that modify document format have to be included in document schema definition.
 * Usage of such features could only happen after document schema has been updated to reflect such feature.
 *
 * This formalaty allows clients that do not understand such features to fail right away when they observe
 * document schema listing capabilities that such client does not understand.
 * Old clients will fail in predictable way. This allows us to
 * 1) Immidiatly see such issues and adjust if features are enabled too early, before changes have been saturated.
 * 2) There is no way to get to 100% saturation with new code. Even if we have 99.99% saturation, there are
 *    still 0.01% of clients who will fail. Failing early and predictably ensures they have no chance to limp along
 *    and potentially corrupt the document. This is especially true for summarizer client, who could simply "undo"
 *    changes it does not understands.
 *
 * It's importatant to note how it overlaps with feature gates and safe velocity.
 * If new feature was in use, that resulted in a number of documents referencing such feature in document schema.
 * But, developers (through code depployment or feature gates) could disable usage of such features.
 * That will stop a process of further document schema changes (for documents that were not using such feature).
 * And documents that already list such capability in their schema will continue to do so. Later ensures that old
 * clients who do not understand such feature will continue to fail to open such documents, as such documents very
 * likely contain data in a new format.
 *
 * Users of this class need to use DocumentsSchemaController.sessionSchema to determine what features can be used.
 *
 * There are two modes this class can operate:
 * 1) Legacy mode. In such mode it does not issue any ops to change document schema. Any changes happen implicitly,
 *    right away, and new features are available right away
 * 2) Non-legacy mode. In such mode any changes to schema require an op rountrip. This class will manage such transitions.
 *    However code should assume that any new features that were not enabled in a given document will not be available
 *    for a given session. That's because this session may never send any ops (including read-only documents). Or it may
 *    fail to convert schema.
 *    This class promises eventually movement forward. I.e. if new feature is allowed (let's say - through feature gates),
 *    then eventually all documents that are modified will have that feature refleced in their schema. But it may require
 *    multiple reloads / new sessions to get there.
 *
 * How schemas are changed (in non-legacy mode):
 * If a client needs to change a schema, it will attempt to do so as part of normal ops sending process.
 * Changes happen in CAS (Compare-and-swap) fashion, i.e. client tells current schema and schema it wants to change to.
 * When a number of clients race to change a schema, then only one of them will win, all others will fail because they will
 * reference old schema that is no longer in effect.
 * Clients can retry, but current implementation is simply - they will not (and will rely on next session / reload to do
 * recalc and decide if schema needs to be changed or not).
 *
 * @alpha
 */
export class DocumentsSchemaController {
	private newBehavior: boolean;
	private sendOp = true;

	// schema coming from document metadata (snapshot we loaded from)
	private documentSchema: IDocumentSchemaCurrent;

	// desired schema, based on feature gates / runtime options.
	// This includes requests to enable to disable functionality
	private readonly desiredSchema: IDocumentSchemaCurrent;

	// OR() of document schema and desired schema. It enables all the features that are enabled in either of schemas.
	private futureSchema: IDocumentSchemaCurrent | undefined;

	// Current schema this session operates with.
	// 1) Legacy mode: this is same as desired schema - all options that were requested to be on are on, and all options requested to be off are off.
	// 2) Non-legacy mode: this is AND() of document schema and desired schema. Only options that are enabled in both are enabled here.
	//    If there are any options that are not enabled in document schema, but are enabled in desired schema, then attempt to change schema
	//    (and enable such options) will be made through the session.
	public sessionSchema: IDocumentSchemaCurrent;

	/**
	 * Constructs DocumentsSchemaController that controls current schema and processes around it, including changes in schema.
	 * @param newBehavior - Tells if schema changes are done implicitly (without ops - legacy behavior), or go through formal schema change ops process.
	 * @param existing - Is the document existing document, or a new doc.
	 * @param documentMetadataSchema - current document's schema, if present.
	 * @param compressionAlgorithm - desired compression algorith to use
	 * @param idCompressorModeArg - desired ID compressor mode to use
	 * @param groupedBatchingEnabled - true if it's desired to use op grouping.
	 */
	constructor(
		newBehavior: boolean,
		existing: boolean,
		documentMetadataSchema: IDocumentSchema | undefined,
		compressionLz4: boolean,
		idCompressorMode: IdCompressorMode,
		groupedBatchingEnabled: boolean,
		private readonly onSchemaChange: (schema: IDocumentSchemaCurrent) => void,
	) {
		checkRuntimeCompatibility(documentMetadataSchema);

		this.documentSchema =
			(documentMetadataSchema as IDocumentSchemaCurrent) ??
			({
				version: currentDocumentVersionSchema,
				// see comment in summarizeDocumentSchema() on why it has to stay zero
				refSeq: 0,
				// If it's existing document and it has no schema, then it was written by legacy client.
				// If it's a new document, then we define it's legacy-related behaviors.
				runtime: {
					newBehavior: boolToProp(!existing && newBehavior),
				},
			} satisfies IDocumentSchemaCurrent);

		// Use legacy behavior only if both document and options tell us to use legacy.
		// Otherwise it's no longer legacy time!
		this.newBehavior = this.documentSchema.runtime.newBehavior === true || newBehavior;

		this.desiredSchema = {
			version: currentDocumentVersionSchema,
			refSeq: this.documentSchema.refSeq,
			runtime: {
				newBehavior: boolToProp(newBehavior),
				compressionLz4: boolToProp(compressionLz4),
				idCompressorMode,
				opGroupingEnabled: boolToProp(groupedBatchingEnabled),
			},
		};

		if (!this.newBehavior || !existing) {
			this.sessionSchema = this.desiredSchema;
			assert(
				boolToProp(this.newBehavior) === this.sessionSchema.runtime.newBehavior,
				"newBehavior",
			);
			this.futureSchema = undefined;
		} else {
			this.sessionSchema = and(this.documentSchema, this.desiredSchema);
			this.futureSchema = or(this.documentSchema, this.desiredSchema);
			assert(this.sessionSchema.runtime.newBehavior === true, "legacy");
			assert(this.futureSchema.runtime.newBehavior === true, "legacy");
			if (same(this.documentSchema, this.futureSchema)) {
				this.futureSchema = undefined;
			}
		}

		// Validate that schema we are operating in is actually a schema we consider compatible with current runtime.
		checkRuntimeCompatibility(this.sessionSchema);
		checkRuntimeCompatibility(this.futureSchema);
	}

	public summarizeDocumentSchema(refSeq: number): IDocumentSchema | undefined {
		// For legacy behavior, we can write nothing (return undefined).
		// It does not buy us anything, as whatever written in summary does not actualy impact clients operating in legacy mode.
		// But it will help with transition out of legacy mode, as clients transitioning out of it would be able to use all the
		// features that are mentioned in schema right away, without a need to go through schema transition (and thus for a session or
		// two losing ability to use all the features)

		const schema = this.newBehavior ? this.documentSchema : this.desiredSchema;

		// It's important to keep refSeq at zero in legacy mode, such that transition out of it is simple and we do not have
		// race conditions. If we put any other number (including latest seq number), then we will have two clients
		// (loading from two different summaries) with different numbers, and eventual consistency will be broken as schema
		// change ops will be interpretted differently by those two clients.
		assert(this.newBehavior || schema.refSeq === 0, "refSeq should be zero");

		return schema;
	}

	public onMessageSent(send: (content: IDocumentSchemaChangeMessage) => void) {
		if (this.sendOp && this.futureSchema !== undefined) {
			assert(
				this.newBehavior && this.futureSchema.runtime.newBehavior === true,
				"not legacy",
			);
			send({
				...this.futureSchema,
				refSeq: this.documentSchema.refSeq,
			});
		}
		this.sendOp = false;
	}

	public processDocumentSchemaOp(message: IDocumentSchemaChangeMessage, local: boolean) {
		assert(message.refSeq >= this.documentSchema.refSeq, "");
		if (message.refSeq !== this.documentSchema.refSeq) {
			// CAS failed
			return;
		}

		// This assert should be after checking for successful CAS above.
		// This will ensure we do not trip on our own messages that are no longer wanted as we processed someone else schema change message.
		assert(!local || (this.newBehavior && this.futureSchema !== undefined), "not sending ops");

		// Changes are in effect. Immidiatly check that this client understands these changes
		checkRuntimeCompatibility(message);

		this.documentSchema = message as IDocumentSchemaCurrent;
		this.sessionSchema = and(this.documentSchema, this.desiredSchema);

		// legacy behavior is automatically off for the document once someone sends a schema op -
		// from now on it's fully controlled by ops.
		// This is very important, as summarizeDocumentSchema() should use this new schema!
		this.newBehavior = true;

		// Stop attempting changing schema.
		// If it was local op, then we succeeded and do not need to try again.
		// If it was remote op, then some changes happened to schema.
		// We would need to recalculate this.futureSchema by mering changes that we just received.
		// Avoid this complexity for now - a new client session (loading from new summary with these changes)
		// will automatically do this recalculation and will figure out
		this.futureSchema = undefined;

		this.onSchemaChange(this.sessionSchema);
	}

	public onDisconnect() {
		this.sendOp = true;
	}
}

/* eslint-enable jsdoc/check-indentation */
