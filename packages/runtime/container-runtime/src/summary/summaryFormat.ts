/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	readAndParse,
	blobHeadersBlobName as blobNameForBlobHeaders,
} from "@fluidframework/driver-utils";
import {
	ISequencedDocumentMessage,
	ISnapshotTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	channelsTreeName,
	gcTreeKey,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { IGCMetadata } from "../gc/index.js";

type OmitAttributesVersions<T> = Omit<T, "snapshotFormatVersion" | "summaryFormatVersion">;
interface IFluidDataStoreAttributes0 {
	readonly snapshotFormatVersion?: undefined;
	readonly summaryFormatVersion?: undefined;
	pkg: string;
	/**
	 * This tells whether a data store is root. Root data stores are never collected.
	 * Non-root data stores may be collected if they are not used. If this is not present, default it to
	 * true. This will ensure that older data stores are incorrectly collected.
	 */
	readonly isRootDataStore?: boolean;
}
interface IFluidDataStoreAttributes1 extends OmitAttributesVersions<IFluidDataStoreAttributes0> {
	readonly snapshotFormatVersion: "0.1";
	readonly summaryFormatVersion?: undefined;
}
interface IFluidDataStoreAttributes2 extends OmitAttributesVersions<IFluidDataStoreAttributes1> {
	/** Switch from snapshotFormatVersion to summaryFormatVersion */
	readonly snapshotFormatVersion?: undefined;
	readonly summaryFormatVersion: 2;
	/**
	 * True if channels are not isolated in .channels subtrees, otherwise isolated.
	 * This is required in both datastore attributes as well as the root container,
	 * because reused summary handles may cause different format versions in each
	 * datastore subtree within the summary.
	 */
	readonly disableIsolatedChannels?: true;
}
/**
 * Added IFluidDataStoreAttributes similar to IChannelAttributes which will tell the attributes of a
 * store like the package, snapshotFormatVersion to take different decisions based on a particular
 * snapshotFormatVersion.
 */
export type ReadFluidDataStoreAttributes =
	| IFluidDataStoreAttributes0
	| IFluidDataStoreAttributes1
	| IFluidDataStoreAttributes2;
export type WriteFluidDataStoreAttributes = IFluidDataStoreAttributes1 | IFluidDataStoreAttributes2;

export function getAttributesFormatVersion(attributes: ReadFluidDataStoreAttributes): number {
	if (attributes.summaryFormatVersion) {
		/**
		 * Version 2+: Introduces .channels trees for isolation of
		 * channel trees from data store objects.
		 */
		return attributes.summaryFormatVersion;
	} else if (attributes.snapshotFormatVersion === "0.1") {
		/**
		 * Version 1: from this version the pkg within the data store
		 * attributes blob is a JSON array rather than a string.
		 */
		return 1;
	}
	/**
	 * Version 0: format version is missing from summary.
	 * This indicates it is an older version.
	 */
	return 0;
}

export function hasIsolatedChannels(attributes: ReadFluidDataStoreAttributes): boolean {
	return !!attributes.summaryFormatVersion && !attributes.disableIsolatedChannels;
}

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
export type IdCompressorMode = "on" | "delayed" | "off";

/**
 * Available compression algorithms for op compression.
 * @alpha
 */
export enum CompressionAlgorithms {
	lz4 = "lz4",
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

/**
 * Current version known properties that define document schema
 */
export const currentDocumentVersionSchema = "1.0";

export interface IDocumentSchemaCurrent {
	version: typeof currentDocumentVersionSchema;

	// Should any of IGCRuntimeOptions be here?
	// Should sessionExpiryTimeoutMs be here?

	compressionAlgorithms?: CompressionAlgorithms[];
	chunkingEnabled?: true;
	idCompressorMode?: IdCompressorMode;
	opGroupingEnabled?: true;
}

export const documentSchemaSupportedConfigs: Record<string, (string | boolean)[]> = {
	version: [currentDocumentVersionSchema],
	compressionAlgorithms: [CompressionAlgorithms.lz4],
	chunkingEnabled: [true],
	idCompressorMode: ["on", "delayed"],
	opGroupingEnabled: [true],
};

/**
 * @alpha
 */
export interface IContainerRuntimeMetadata extends ICreateContainerMetadata, IGCMetadata {
	readonly summaryFormatVersion: 1;
	/** The last message processed at the time of summary. Only primitive property types are added to the summary. */
	readonly message: ISummaryMetadataMessage | undefined;
	/** True if channels are not isolated in .channels subtrees, otherwise isolated. */
	readonly disableIsolatedChannels?: true;
	/** The summary number for a container's summary. Incremented on summaries throughout its lifetime. */
	readonly summaryNumber?: number;
	/** GUID to identify a document in telemetry */
	readonly telemetryDocumentId?: string;

	readonly documentSchema?: IDocumentSchema;
}

/**
 * @alpha
 */
export interface ICreateContainerMetadata {
	/** Runtime version of the container when it was first created */
	createContainerRuntimeVersion?: string;
	/** Timestamp of the container when it was first created */
	createContainerTimestamp?: number;
}

/**
 * The properties of an ISequencedDocumentMessage to be stored in the metadata blob in summary.
 * @alpha
 */
export type ISummaryMetadataMessage = Pick<
	ISequencedDocumentMessage,
	| "clientId"
	| "clientSequenceNumber"
	| "minimumSequenceNumber"
	| "referenceSequenceNumber"
	| "sequenceNumber"
	| "timestamp"
	| "type"
>;

/**
 * Extracts the properties from an ISequencedDocumentMessage as defined by ISummaryMetadataMessage. This message is
 * added to the metadata blob in summary.
 */
export const extractSummaryMetadataMessage = (
	message?: ISequencedDocumentMessage,
): ISummaryMetadataMessage | undefined =>
	message === undefined
		? undefined
		: {
				clientId: message.clientId,
				clientSequenceNumber: message.clientSequenceNumber,
				minimumSequenceNumber: message.minimumSequenceNumber,
				referenceSequenceNumber: message.referenceSequenceNumber,
				sequenceNumber: message.sequenceNumber,
				timestamp: message.timestamp,
				type: message.type,
		  };

export function getMetadataFormatVersion(metadata?: IContainerRuntimeMetadata): number {
	/**
	 * Version 2+: Introduces runtime sequence number for data verification.
	 *
	 * Version 1+: Introduces .metadata blob and .channels trees for isolation of
	 * data store trees from container-level objects.
	 * Also introduces enableGC option stored in the summary.
	 *
	 * Version 0: metadata blob missing; format version is missing from summary.
	 * This indicates it is an older version.
	 */
	return metadata?.summaryFormatVersion ?? 0;
}

export const aliasBlobName = ".aliases";
export const metadataBlobName = ".metadata";
export const chunksBlobName = ".chunks";
export const electedSummarizerBlobName = ".electedSummarizer";
export const blobsTreeName = ".blobs";
export const idCompressorBlobName = ".idCompressor";
export const blobHeadersBlobName = blobNameForBlobHeaders;

export function rootHasIsolatedChannels(metadata?: IContainerRuntimeMetadata): boolean {
	return !!metadata && !metadata.disableIsolatedChannels;
}

export const protocolTreeName = ".protocol";

/**
 * List of tree IDs at the container level which are reserved.
 * This is for older versions of summaries that do not yet have an
 * isolated data stores namespace. Without the namespace, this must
 * be used to prevent name collisions with data store IDs.
 */
export const nonDataStorePaths = [
	protocolTreeName,
	".logTail",
	".serviceProtocol",
	blobsTreeName,
	gcTreeKey,
	idCompressorBlobName,
];

export const dataStoreAttributesBlobName = ".component";

/**
 * Modifies summary tree and stats to put tree under .channels tree.
 *
 * @param summarizeResult - Summary tree and stats to modify
 *
 * @example
 *
 * Converts from:
 *
 * ```typescript
 * {
 *     type: SummaryType.Tree,
 *     tree: { a: {...}, b: {...}, c: {...} },
 * }
 * ```
 *
 * to:
 *
 * ```typescript
 * {
 *     type: SummaryType.Tree,
 *     tree: {
 *         ".channels": {
 *             type: SummaryType.Tree,
 *             tree: { a: {...}, b: {...}, c: {...} }
 *         },
 *     },
 * }
 * ```
 *
 * And adds +1 to treeNodeCount in stats.
 */
export function wrapSummaryInChannelsTree(summarizeResult: ISummaryTreeWithStats): void {
	summarizeResult.summary = {
		type: SummaryType.Tree,
		tree: { [channelsTreeName]: summarizeResult.summary },
	};
	summarizeResult.stats.treeNodeCount++;
}

export async function getFluidDataStoreAttributes(
	storage: IDocumentStorageService,
	snapshot: ISnapshotTree,
): Promise<ReadFluidDataStoreAttributes> {
	const attributes = await readAndParse<ReadFluidDataStoreAttributes>(
		storage,
		snapshot.blobs[dataStoreAttributesBlobName],
	);
	// Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
	// For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
	// However the feature of loading a detached container from snapshot, is added when the
	// snapshotFormatVersion is at least "0.1" (1), so we don't expect it to be anything else.
	const formatVersion = getAttributesFormatVersion(attributes);
	assert(formatVersion > 0, 0x1d5 /* Invalid snapshot format version */);
	return attributes;
}
