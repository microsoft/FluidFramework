/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";
import { gt, lt, parse } from "semver-ts";

import type { SemanticVersion } from "../compatUtils.js";
import { pkgVersion } from "../packageVersion.js";

/**
 * Descripe allowed type for properties in document schema.
 * Please note that for all property types we should use undefined to indicate that particular capability is off.
 * Using false, or some string value (like "off") will result in clients who do not understand that property failing, whereas
 * we want them to continue to collaborate alongside clients who support that capability, but such capability is shipping dark for now.
 * @internal
 */
export type DocumentSchemaValueType = string | string[] | true | number | undefined;

/**
 * ID Compressor mode.
 * "on" - compressor is On. It's loaded as part of container load. This mode is sticky - once on, compressor is On for all
 * sessions for a given document. This results in IContainerRuntime.idCompressor to be always available.
 * "delayed" - ID compressor bundle is loaded only on establishing of first delta connection, i.e. it does not impact boot of cotnainer.
 * In such mode IContainerRuntime.idCompressor is not made available (unless previous sessions of same document had it "On").
 * The only thing that is available is IContainerRuntime.generateDocumentUniqueId() that provides opportunistically short IDs.
 * undefined - ID compressor is not loaded.
 * While IContainerRuntime.generateDocumentUniqueId() is available, it will produce long IDs that are do not compress well.
 *
 * @legacy
 * @alpha
 */
export type IdCompressorMode = "on" | "delayed" | undefined;

/**
 * Document schema information.
 * Describes overall shape of document schema, including unknown (to this version) properties.
 *
 * Used by runtime to make a call if it can understand document schema.
 * If it can't, it should not continue with document and immediately fail, preventing random (cryptic) failures
 * down the road and potentially corrupting documents.
 * For now this structure and appropriate interpretation / behavior is focused only on runtime features.
 * In the future that could be interpolated to more areas, including DDSs used, and even possibly - application
 * schema.
 *
 * Runtime will ignore any properties at the root that it does not understand (i.e. IDocumentSchema.app), but will
 * stop (and fail session) on any unknown properties within "runtime" sub-tree.
 *
 * In most cases values preserved in the document will not dictate if such features should be enabled in a given session.
 * I.e. if compression is mentioned in document schema, this means that runtime version that opens such document must know
 * how to interpret such ops, but does not need to actually use compression itself. That said, some options could be
 * sticky, i.e. influence feature selection for all runtimes opening a document. ID compression is one such example.
 * Currently there is no mechanism to remove feature from this property bag, i.e. once compression was used, even if it's
 * disabled (through feature gate or code deployment), all existing documents that used compression will continue to fail
 * if opened by clients who do not support compression.
 *
 * For now we are limiting it to just plain properties, and only really simple types, but that can be changed in the future.
 *
 * @internal
 */
export interface IDocumentSchema {
	// Note: Incoming schemas from other clients may have additional root-level properties (i.e. IDocumentSchema.app)
	// that this client does not understand. The runtime will ignore these properties, unless they are within the
	// "runtime" sub-tree, in which case it will fail if it is unable to understand any runtime properties.

	/**
	 * Describes how data needed to understand the schema is stored in this structure.
	 * If runtime sees a version it does not understand, it should immediately fail and not
	 * attempt to interpret any further data.
	 */
	version: number;

	/**
	 * Sequence number when this schema became active.
	 */
	refSeq: number;

	/**
	 * Runtime configurations that affect the document schema. Other clients must understand these
	 * properties to be able to open the document.
	 */
	runtime: Record<string, DocumentSchemaValueType>;

	/**
	 * Info about this document that can be updated via Document Schema change op, but isn't required
	 * to be understood by all clients (unlike the rest of IDocumentSchema properties). Because of this,
	 * some older documents may not have this property, so it's an optional property.
	 */
	info?: IDocumentSchemaInfo;
}

/**
 * Informational properties of the document that are not subject to strict schema enforcement.
 *
 * @internal
 */
export interface IDocumentSchemaInfo {
	/**
	 * The minimum version of the FF runtime that should be used to load this document.
	 * Will likely be advanced over time as applications pick up later FF versions.
	 *
	 * We use this to issue telemetry warning events if a client tries to open a document
	 * with a runtime version lower than this.
	 *
	 * See {@link @fluidframework/container-runtime#LoadContainerRuntimeParams} for additional details on `minVersionForCollab`.
	 *
	 * @remarks
	 * We use `SemanticVersion` instead of `MinimumVersionForCollab` since we may open future documents that with a
	 * minVersionForCollab version that `MinimumVersionForCollab` does not support.
	 */
	minVersionForCollab: SemanticVersion;
}

/**
 * Content of the type=ContainerMessageType.DocumentSchemaChange ops.
 * The meaning of refSeq field is different in such messages (compared to other usages of IDocumentSchemaCurrent)
 * ContainerMessageType.DocumentSchemaChange messages use CAS (Compare-and-swap) semantics, and convey
 * regSeq of last known schema change (known to a client proposing schema change).
 * @see InboundContainerRuntimeDocumentSchemaMessage
 * @internal
 */
export type IDocumentSchemaChangeMessageIncoming = IDocumentSchema;

/**
 * Similar to {@link IDocumentSchemaChangeMessageIncoming}, but used for outgoing schema messages.
 * @see OutboundContainerRuntimeDocumentSchemaMessage
 * @internal
 */
export type IDocumentSchemaChangeMessageOutgoing = IDocumentSchemaCurrent;

/**
 * Settings that this session would like to have, based on options and feature gates.
 *
 * WARNING: This type is used to infer IDocumentSchemaCurrent type!
 * Any changes here (including renaming of properties) are potentially changing document format and should be considered carefully!
 *
 * @internal
 */
export interface IDocumentSchemaFeatures {
	// Tells if client uses legacy behavior of changing schema.
	// - Legacy behavior - changing schema without leveraging schema change ops.
	// - New behavior - changes in schema require ops and take into affect with delay.
	explicitSchemaControl: boolean;
	compressionLz4: boolean;
	idCompressorMode: IdCompressorMode;
	opGroupingEnabled: boolean;
	createBlobPayloadPending: true | undefined;

	/**
	 * List of disallowed versions of the runtime.
	 * This option is sticky. Once a version of runtime is added to this list (when supplied to DocumentsSchemaController's constructor)
	 * it will be added to the list of disallowed versions and stored in document metadata.
	 * Each runtime checks if its version is in this list on container open. If it is, it immediately exits with error message
	 * indicating to the user that this version is no longer supported.
	 * Currently there is no mechanism to remove version from this list. I.e. If it was once added to the list,
	 * it gets added to any document metadata (documents that gets open by this runtime) and there is no way to clear it from document's
	 * metadata.
	 */
	disallowedVersions: string[];
}

/**
 * Current version known properties that define document schema
 * This must be bumped whenever the format of document schema or protocol for changing the current document schema changes
 * in a way that all old/new clients are required to understand.
 * Ex: Adding a new configuration property (under IDocumentSchema.runtime) does not require changing this version since there is logic
 * in old clients for handling new/unknown properties.
 * Ex: Adding a new property to IDocumentSchema.info does not require changing this version, since info properties are not required to be
 * understood by all clients.
 * Ex: Changing the 'document schema acceptance' mechanism from convert-and-swap to one requiring consensus does require changing this version
 * since all clients need to understand the new protocol.
 * @internal
 */
export const currentDocumentVersionSchema = 1;

/**
 * Current document schema.
 * This interface represents the schema that we currently understand and know the
 * structure of (which properties will be present).
 *
 * @internal
 */
export interface IDocumentSchemaCurrent extends Required<IDocumentSchema> {
	// This is the version of the schema that we currently understand.
	version: typeof currentDocumentVersionSchema;
	// This narrows the runtime property to only include the properties in IDocumentSchemaFeatures (all as optional)
	runtime: {
		[P in keyof IDocumentSchemaFeatures]?: IDocumentSchemaFeatures[P] extends boolean
			? true
			: IDocumentSchemaFeatures[P];
	};
}

/**
 * Document schema that is incoming from another client but validated to be "current".
 *
 * This interface represents when we have validated that an incoming IDocumentSchema object
 * is compatible with the current runtime (by calling `checkRuntimeCompatibility()`).
 * However, the `info` property is optional because some older documents may not have this property, but
 * `info` is not required to be understood by all clients to be compatible.
 */
interface IDocumentSchemaCurrentIncoming extends Omit<IDocumentSchemaCurrent, "info"> {
	info?: IDocumentSchemaInfo;
}

interface IProperty<T = unknown> {
	and: (persistedSchema: T, providedSchema: T) => T;
	or: (persistedSchema: T, providedSchema: T) => T;
	validate(t: unknown): boolean;
}

class TrueOrUndefined implements IProperty<true | undefined> {
	public and(persistedSchema?: true, providedSchema?: true): true | undefined {
		return persistedSchema === true && providedSchema === true ? true : undefined;
	}

	public or(persistedSchema?: true, providedSchema?: true): true | undefined {
		return persistedSchema === true || providedSchema === true ? true : undefined;
	}

	public validate(t: unknown): t is true | undefined {
		return t === undefined || t === true;
	}
}

class TrueOrUndefinedMax extends TrueOrUndefined {
	public and(persistedSchema?: true, providedSchema?: true): true | undefined {
		return this.or(persistedSchema, providedSchema);
	}
}

class MultiChoice implements IProperty<string | undefined> {
	constructor(private readonly choices: string[]) {}

	public and(persistedSchema?: string, providedSchema?: string): string | undefined {
		if (persistedSchema === undefined || providedSchema === undefined) {
			return undefined;
		}
		return this.choices[
			Math.min(this.choices.indexOf(persistedSchema), this.choices.indexOf(providedSchema))
		];
	}

	public or(persistedSchema?: string, providedSchema?: string): string | undefined {
		if (persistedSchema === undefined) {
			return providedSchema;
		}
		if (providedSchema === undefined) {
			return persistedSchema;
		}
		return this.choices[
			Math.max(this.choices.indexOf(persistedSchema), this.choices.indexOf(providedSchema))
		];
	}

	public validate(t: unknown): boolean {
		return t === undefined || (typeof t === "string" && this.choices.includes(t));
	}
}

class IdCompressorProperty extends MultiChoice {
	// document schema always wins!
	public and(persistedSchema?: string, providedSchema?: string): string | undefined {
		return persistedSchema;
	}
}

class CheckVersions implements IProperty<string[] | undefined> {
	public or(
		persistedSchema: string[] = [],
		providedSchema: string[] = [],
	): string[] | undefined {
		const set = new Set<string>([...persistedSchema, ...providedSchema]);
		return arrayToProp([...set.values()]);
	}

	// Once version is there, it stays there forever.
	public and(
		persistedSchema: string[] = [],
		providedSchema: string[] = [],
	): string[] | undefined {
		return this.or(persistedSchema, providedSchema);
	}

	public validate(t: unknown): boolean {
		return t === undefined || (Array.isArray(t) && !t.includes(pkgVersion));
	}
}

/**
 * Helper structure to valida if a schema is compatible with existing code.
 */
const documentSchemaSupportedConfigs = {
	explicitSchemaControl: new TrueOrUndefinedMax(), // once new behavior shows up, it's sticky
	idCompressorMode: new IdCompressorProperty(["delayed", "on"]),
	opGroupingEnabled: new TrueOrUndefined(),
	compressionLz4: new TrueOrUndefined(),
	createBlobPayloadPending: new TrueOrUndefined(),
	disallowedVersions: new CheckVersions(),
};

/**
 * Checks if a given schema is compatible with current code, i.e. if current code can understand all the features of that schema.
 * If schema is not compatible with current code, it throws an exception.
 * @param documentSchema - current schema
 */
function checkRuntimeCompatibility(
	documentSchema: IDocumentSchema | undefined,
	schemaName: string,
): asserts documentSchema is IDocumentSchemaCurrentIncoming {
	// Back-compat - we can't do anything about legacy documents.
	// There is no way to validate them, so we are taking a guess that safe deployment processes used by a given app
	// do not run into compat problems.
	if (documentSchema === undefined) {
		return;
	}

	const msg = "Document can't be opened with current version of the code";
	if (documentSchema.version !== currentDocumentVersionSchema) {
		throw DataProcessingError.create(
			msg,
			"checkRuntimeCompat1",
			undefined, // message
			{
				runtimeSchemaVersion: documentSchema.version,
				currentRuntimeSchemaVersion: currentDocumentVersionSchema,
				schemaName,
			},
		);
	}

	let unknownProperty: string | undefined;

	const regSeq = documentSchema.refSeq;
	// defence in depth - it should not be possible to get here anything other than integer, but worth validating it.
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const value = documentSchema[unknownProperty];
		throw DataProcessingError.create(
			msg,
			"checkRuntimeCompat2",
			undefined, // message
			{
				codeVersion: currentDocumentVersionSchema,
				property: unknownProperty,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				value,
				schemaName,
			},
		);
	}
}

function and(
	persistedSchema: IDocumentSchemaCurrentIncoming,
	providedSchema: IDocumentSchemaCurrent,
): IDocumentSchemaCurrent {
	const runtime = {};
	for (const key of new Set([
		...Object.keys(persistedSchema.runtime),
		...Object.keys(providedSchema.runtime),
	])) {
		runtime[key] = (documentSchemaSupportedConfigs[key] as IProperty).and(
			persistedSchema.runtime[key],
			providedSchema.runtime[key],
		);
	}

	// We keep the persisted minVersionForCollab if present, even if the provided minVersionForCollab
	// is higher.
	const minVersionForCollab =
		persistedSchema.info?.minVersionForCollab ?? providedSchema.info.minVersionForCollab;

	return {
		version: currentDocumentVersionSchema,
		refSeq: persistedSchema.refSeq,
		info: { minVersionForCollab },
		runtime,
	};
}

function or(
	persistedSchema: IDocumentSchemaCurrentIncoming,
	providedSchema: IDocumentSchemaCurrent,
): IDocumentSchemaCurrent {
	const runtime = {};
	for (const key of new Set([
		...Object.keys(persistedSchema.runtime),
		...Object.keys(providedSchema.runtime),
	])) {
		runtime[key] = (documentSchemaSupportedConfigs[key] as IProperty).or(
			persistedSchema.runtime[key],
			providedSchema.runtime[key],
		);
	}

	// We take the greater of the persisted/provided minVersionForCollab
	const minVersionForCollab =
		persistedSchema.info === undefined
			? providedSchema.info.minVersionForCollab
			: gt(persistedSchema.info.minVersionForCollab, providedSchema.info.minVersionForCollab)
				? persistedSchema.info.minVersionForCollab
				: providedSchema.info.minVersionForCollab;

	return {
		version: currentDocumentVersionSchema,
		refSeq: persistedSchema.refSeq,
		info: { minVersionForCollab },
		runtime,
	};
}

/**
 * Determines if two schemas are the "same".
 * Schemas are considered **not** the same if a schema change op is required to make
 * the properties of `persistedSchema` match to the properties of `providedSchema`.
 */
function same(
	persistedSchema: IDocumentSchemaCurrentIncoming,
	providedSchema: IDocumentSchemaCurrent,
): boolean {
	if (
		persistedSchema.info === undefined ||
		lt(persistedSchema.info.minVersionForCollab, providedSchema.info.minVersionForCollab)
	) {
		// If the persisted schema's minVersionForCollab is undefined or less than the provided schema's
		// minVersionForCollab, then we should send a schema change op to update the minVersionForCollab.
		return false;
	}
	for (const key of new Set([
		...Object.keys(persistedSchema.runtime),
		...Object.keys(providedSchema.runtime),
	])) {
		// If schemas differ only by type of behavior, then we should not send schema change ops!
		if (
			key !== "explicitSchemaControl" &&
			persistedSchema.runtime[key] !== providedSchema.runtime[key]
		) {
			return false;
		}
	}
	return true;
}

function boolToProp(b: boolean): true | undefined {
	return b ? true : undefined;
}

function arrayToProp(arr: string[]): string[] | undefined {
	return arr.length === 0 ? undefined : arr;
}

/* eslint-disable jsdoc/check-indentation */

/**
 * Controller of document schema.
 *
 * Recommended pre-reading: https://github.com/microsoft/FluidFramework/blob/main/packages/dds/SchemaVersioning.md
 *
 * This class manages current document schema and transitions between document schemas.
 * At the moment, it only focuses on subset of document schema, specifically - how FluidFramework runtime serializes data
 * (summary and op format), features & capabilities that a version of runtime has to support and understand in
 * order to collaborate on a document.
 * New features that modify document format have to be included in document schema definition.
 * Usage of such features could only happen after document schema has been updated to reflect such feature.
 *
 * This formality allows clients that do not understand such features to fail right away when they observe
 * document schema listing capabilities that such client does not understand.
 * Old clients will fail in predictable way. This allows us to
 * 1) Immediately see such issues and adjust if features are enabled too early, before changes have been saturated.
 * 2) There is no way to get to 100% saturation with new code. Even if we have 99.99% saturation, there are
 *    still 0.01% of clients who will fail. Failing early and predictably ensures they have no chance to limp along
 *    and potentially corrupt the document. This is especially true for summarizer client, who could simply "undo"
 *    changes it does not understands.
 *
 * It's important to note how it overlaps with feature gates and safe velocity.
 * If new feature was in use, that resulted in a number of documents referencing such feature in document schema.
 * But, developers (through code deployment or feature gates) could disable usage of such features.
 * That will stop a process of further document schema changes (for documents that were not using such feature).
 * And documents that already list such capability in their schema will continue to do so. Later ensures that old
 * clients who do not understand such feature will continue to fail to open such documents, as such documents very
 * likely contain data in a new format.
 *
 * Controller operates with 4 schemas:
 * - document schema: whatever we loaded from summary metadata + ops. It follows eventuall consistency rules (i.e. like DDS).
 * - desired schema - what client is asking for to have (i.e. all the desired settings, based on runtime options / feature gates).
 * - session schema - current session schema. It's "and" of the above two schemas.
 * - future schema - "or" of document and desires schemas.
 *
 * "or" & "and" operators are defined individually for each property. For Boolean properties it's literally &&, || operators.
 * But for other properties it's more nuanced.
 *
 * Whenver document schema does not match future schema, controller will send an op that attempts to changs documents schema to
 * future schema.
 *
 * Users of this class need to use DocumentsSchemaController.sessionSchema to determine what features can be used.
 *
 * There are two modes this class can operate:
 * 1) Legacy mode. In such mode it does not issue any ops to change document schema. Any changes happen implicitly,
 *    right away, and new features are available right away
 * 2) Non-legacy mode. In such mode any changes to schema require an op roundtrip. This class will manage such transitions.
 *    However code should assume that any new features that were not enabled in a given document will not be available
 *    for a given session. That's because this session may never send any ops (including read-only documents). Or it may
 *    fail to convert schema.
 *    This class promises eventual movement forward. I.e. if new feature is allowed (let's say - through feature gates),
 *    then eventually all documents that are modified will have that feature reflected in their schema. It could require
 *    multiple reloads / new sessions to get there (depends on if code reacts to schema changes right away, or only consults
 *    schema on document load).
 *
 * How schemas are changed (in non-legacy mode):
 * If a client needs to change a schema, it will attempt to do so as part of normal ops sending process.
 * Changes happen in CAS (Compare-and-swap) fashion, i.e. client tells current schema and schema it wants to change to.
 * When a number of clients race to change a schema, then only one of them will win, all others will fail because they will
 * reference old schema that is no longer in effect.
 * Clients can retry, but current implementation is simply - they will not (and will rely on next session / reload to do
 * recalc and decide if schema needs to be changed or not).
 *
 * @internal
 * @sealed
 */
export class DocumentsSchemaController {
	private explicitSchemaControl: boolean;

	/**
	 * Have we generated a DocumentSchemaChange op and we're waiting for the ack?
	 * This is used to ensure that we do not generate multiple schema change ops - this client should only ever send one (if any).
	 */
	private opPending = false;

	// schema coming from document metadata (snapshot we loaded from)
	private documentSchema: IDocumentSchema;

	// desired schema, based on feature gates / runtime options.
	// This includes requests to enable to disable functionality
	private readonly desiredSchema: IDocumentSchemaCurrent;

	// OR() of document schema and desired schema. It enables all the features that are enabled in either of schemas.
	private futureSchema: IDocumentSchemaCurrent | undefined;

	// Current schema this session operates with.
	// 1) Legacy mode (explicitSchemaControl === false): this is same as desired schema - all options that were requested to be on are on, and all options requested to be off are off.
	// 2) Non-legacy mode (explicitSchemaControl === true): this is AND() of document schema and desired schema. Only options that are enabled in both are enabled here.
	//    If there are any options that are not enabled in document schema, but are enabled in desired schema, then attempt to change schema
	//    (and enable such options) will be made through the session.
	public sessionSchema: IDocumentSchemaCurrent;

	/**
	 * Constructs DocumentsSchemaController that controls current schema and processes around it, including changes in schema.
	 * @param existing - Is the document existing document, or a new doc.
	 * @param documentMetadataSchema - current document's schema, if present.
	 * @param features - features of the document schema that current session wants to see enabled.
	 * @param onSchemaChange - callback that is called whenever schema is changed (not called on creation / load, only when processing document schema change ops)
	 * @param info - Informational properties of the document that are not subject to strict schema enforcement
	 * @param logger - telemetry logger from the runtime
	 */
	constructor(
		existing: boolean,
		snapshotSequenceNumber: number,
		documentMetadataSchema: IDocumentSchema | undefined,
		features: IDocumentSchemaFeatures,
		private readonly onSchemaChange: (schema: IDocumentSchemaCurrent) => void,
		info: IDocumentSchemaInfo,
		logger: ITelemetryLoggerExt,
	) {
		// For simplicity, let's only support new schema features for explicit schema control mode
		assert(
			features.disallowedVersions.length === 0 || features.explicitSchemaControl,
			0x949 /* not supported */,
		);

		// We check the document's metadata to see if there is a minVersionForCollab. If it's not an existing document or
		// if the document is older, then it won't have one. If it does have a minVersionForCollab, we check if it's greater
		// than this client's runtime version. If so, we log a telemetry event to warn the customer that the client is outdated.
		// Note: We only send a warning because we will confirm via `checkRuntimeCompatibility` if this client **can** understand
		// the existing document's schema. We still want to issue a warning regardless if this client can or cannot understand the
		// schema since it may be a sign that the customer is not properly waiting for saturation before updating their
		// `minVersionForCollab` value, which could cause disruptions to users in the future.
		const existingMinVersionForCollab = documentMetadataSchema?.info?.minVersionForCollab;
		if (
			existingMinVersionForCollab !== undefined &&
			gt(existingMinVersionForCollab, pkgVersion) &&
			// We also want to avoid sending the telemetry warning for dev builds, since they currently are formatted as
			// `0.0.0-#####-test`. This will cause the telemetry warning to constantly fire.
			// TODO: This can be removed after ADO:41351
			!isDevBuild(pkgVersion)
		) {
			const warnMsg = `WARNING: The version of Fluid Framework used by this client (${pkgVersion}) is not supported by this document! Please upgrade to version ${existingMinVersionForCollab} or later to ensure compatibility.`;
			logger.sendTelemetryEvent({
				eventName: "MinVersionForCollabWarning",
				message: warnMsg,
			});
		}

		// Desired schema by this session - almost all props are coming from arguments
		this.desiredSchema = {
			version: currentDocumentVersionSchema,
			refSeq: documentMetadataSchema?.refSeq ?? 0,
			info,
			runtime: {
				explicitSchemaControl: boolToProp(features.explicitSchemaControl),
				compressionLz4: boolToProp(features.compressionLz4),
				idCompressorMode: features.idCompressorMode,
				opGroupingEnabled: boolToProp(features.opGroupingEnabled),
				createBlobPayloadPending: features.createBlobPayloadPending,
				disallowedVersions: arrayToProp(features.disallowedVersions),
			},
		};

		// Schema coming from document metadata (snapshot we loaded from), or if no document exists
		// (this is a new document) then this is the same as desiredSchema (same as session schema in such case).
		// Latter is important sure that's what will go into summary.
		this.documentSchema = existing
			? (documentMetadataSchema ??
				({
					version: currentDocumentVersionSchema,
					// see comment in summarizeDocumentSchema() on why it has to stay zero
					refSeq: 0,
					info,
					// If it's existing document and it has no schema, then it was written by legacy client.
					// If it's a new document, then we define it's legacy-related behaviors.
					runtime: {
						explicitSchemaControl: boolToProp(!existing && features.explicitSchemaControl),
					},
				} satisfies IDocumentSchemaCurrent))
			: this.desiredSchema;

		checkRuntimeCompatibility(this.documentSchema, "document");
		this.validateSeqNumber(this.documentSchema.refSeq, snapshotSequenceNumber, "summary");

		// Use legacy behavior only if both document and options tell us to use legacy.
		// Otherwise it's no longer legacy time!
		this.explicitSchemaControl =
			this.documentSchema.runtime.explicitSchemaControl === true ||
			features.explicitSchemaControl;

		// Calculate
		// - current session schema (overlap of document schema and desired schema)
		// - future schema to propose (concatination of document schema and desired schema)
		if (!this.explicitSchemaControl || !existing) {
			this.sessionSchema = this.desiredSchema;
			assert(
				boolToProp(this.explicitSchemaControl) ===
					this.sessionSchema.runtime.explicitSchemaControl,
				0x94a /* explicitSchemaControl */,
			);
			this.futureSchema = undefined;
		} else {
			this.sessionSchema = and(this.documentSchema, this.desiredSchema);
			this.futureSchema = or(this.documentSchema, this.desiredSchema);
			assert(this.sessionSchema.runtime.explicitSchemaControl === true, 0x94b /* legacy */);
			assert(this.futureSchema.runtime.explicitSchemaControl === true, 0x94c /* legacy */);
			if (same(this.documentSchema, this.futureSchema)) {
				this.futureSchema = undefined;
			}
		}

		// Validate that schema we are operating in is actually a schema we consider compatible with current runtime.
		checkRuntimeCompatibility(this.desiredSchema, "desired");
		checkRuntimeCompatibility(this.sessionSchema, "session");
		checkRuntimeCompatibility(this.futureSchema, "future");
	}

	public summarizeDocumentSchema(
		refSeq: number,
	): IDocumentSchema | IDocumentSchemaCurrent | undefined {
		// For legacy behavior, we could write nothing (return undefined).
		// It does not buy us anything, as whatever written in summary does not actually impact clients operating in legacy mode.
		// But writing current used config (and assuming most of the clients settle on same config over time) will help with transition
		// out of legacy mode, as clients transitioning out of it would be able to use all the
		// features that are mentioned in schema right away, without a need to go through schema transition (and thus for a session or
		// two losing ability to use all the features)
		const schema = this.explicitSchemaControl ? this.documentSchema : this.desiredSchema;

		// It's important to keep refSeq at zero in legacy mode, such that transition out of it is simple and we do not have
		// race conditions. If we put any other number (including latest seq number), then we will have two clients
		// (loading from two different summaries) with different numbers, and eventual consistency will be broken as schema
		// change ops will be interpretted differently by those two clients.
		assert(
			this.explicitSchemaControl || schema.refSeq === 0,
			0x94d /* refSeq should be zero */,
		);

		return schema;
	}

	/**
	 * Called by Container runtime whenever it is about to send some op.
	 * It gives opportunity for controller to issue its own ops - we do not want to send ops if there are no local changes in document.
	 * Please consider note above constructor about race conditions - current design is to generate op only once in a session lifetime.
	 * @returns Optional message to send.
	 */
	public maybeGenerateSchemaMessage(): IDocumentSchemaChangeMessageOutgoing | undefined {
		if (this.futureSchema !== undefined && !this.opPending) {
			this.opPending = true;
			assert(
				this.explicitSchemaControl && this.futureSchema.runtime.explicitSchemaControl === true,
				0x94e /* not legacy */,
			);
			return this.futureSchema;
		}
	}

	private validateSeqNumber(
		schemaSeqNumber: number,
		lastKnowSeqNumber: number,
		message: string,
	): void {
		if (!Number.isInteger(schemaSeqNumber) || !(schemaSeqNumber <= lastKnowSeqNumber)) {
			throw DataProcessingError.create(
				"DocSchema: Incorrect sequence number",
				"checkRuntimeCompat3",
				undefined, // message
				{
					schemaSeqNumber,
					sequenceNumber: lastKnowSeqNumber,
					message,
				},
			);
		}
	}

	/**
	 * Process document schema change messages
	 * Called by ContainerRuntime whenever it sees document schema messages.
	 * @param contents - contents of the messages
	 * @param local - whether op is local
	 * @param sequenceNumber - sequence number of the op
	 * @returns - true if schema was accepted, otherwise false (rejected due to failed CAS)
	 */
	public processDocumentSchemaMessages(
		contents: IDocumentSchemaChangeMessageIncoming[],
		local: boolean,
		sequenceNumber: number,
	): boolean {
		for (const content of contents) {
			this.validateSeqNumber(content.refSeq, this.documentSchema.refSeq, "content.refSeq");
			this.validateSeqNumber(this.documentSchema.refSeq, sequenceNumber, "refSeq");
			// validate is strickly less, not equal
			assert(
				this.documentSchema.refSeq < sequenceNumber,
				0x950 /* time should move forward only! */,
			);

			if (content.refSeq !== this.documentSchema.refSeq) {
				// CAS failed
				return false;
			}

			// This assert should be after checking for successful CAS above.
			// This will ensure we do not trip on our own messages that are no longer wanted as we processed someone else schema change message.
			assert(
				!local || (this.explicitSchemaControl && this.futureSchema !== undefined),
				0x951 /* not sending ops */,
			);

			// Changes are in effect. Immediately check that this client understands these changes
			checkRuntimeCompatibility(content, "change");
			const schema = {
				...content,
				refSeq: sequenceNumber,
			} satisfies IDocumentSchemaCurrentIncoming;
			this.documentSchema = schema;
			this.sessionSchema = and(schema, this.desiredSchema);
			assert(this.sessionSchema.refSeq === sequenceNumber, 0x97d /* seq# */);

			// legacy behavior is automatically off for the document once someone sends a schema op -
			// from now on it's fully controlled by ops.
			// This is very important, as summarizeDocumentSchema() should use this new schema!
			this.explicitSchemaControl = true;

			// Stop attempting changing schema.
			// If it was local op, then we succeeded and do not need to try again.
			// If it was remote op, then some changes happened to schema.
			// We would need to recalculate this.futureSchema by merging changes that we just received.
			// Avoid this complexity for now - a new client session (loading from new summary with these changes)
			// will automatically do this recalculation and will figure out
			this.futureSchema = undefined;

			this.onSchemaChange(this.sessionSchema);
		}
		return true;
	}

	/**
	 * Indicates the pending op was not ack'd and we may try to send it again if needed.
	 */
	public pendingOpNotAcked(): void {
		this.opPending = false;
	}
}

/**
 * Determines if a given version is a dev-build (i.e. `0.0.0-#####-test`).
 */
function isDevBuild(version: string): boolean {
	const parsed = parse(version);
	return parsed !== null && parsed.prerelease.includes("test");
}

/* eslint-enable jsdoc/check-indentation */
