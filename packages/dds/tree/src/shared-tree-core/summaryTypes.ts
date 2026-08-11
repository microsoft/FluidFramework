/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";

// TODO: Organize this to be adjacent to persisted types.
/**
 * The storage key for the subtree containing all summarizable indexes in the SharedTree summary.
 */
export const summarizablesTreeKey = "indexes";

/**
 * The storage key for the blob containing metadata for the summarizable's summary.
 */
export const summarizablesMetadataKey = ".metadata";

/**
 * Specifies the behavior of a component that puts data in a summary.
 */
export interface Summarizable {
	/**
	 * Field name in summary json under which this element stores its data.
	 */
	readonly key: string;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#(IChannel:interface).summarize}
	 * @param stringify - Serializes the contents of the component (including {@link (IFluidHandle:interface)}s) for storage.
	 * @param fullTree - A flag indicating whether the attempt should generate a full
	 * summary tree without any handles for unchanged subtrees. It should only be set to true when generating
	 * a summary from the entire container. The default value is false.
	 * @param trackState - An optimization for tracking state of objects across summaries. If the state
	 * of an object did not change since last successful summary, an
	 * {@link @fluidframework/protocol-definitions#ISummaryHandle} can be used
	 * instead of re-summarizing it. If this is `false`, the expectation is that you should never
	 * send an `ISummaryHandle`, since you are not expected to track state. The default value is true.
	 * @param telemetryContext - See {@link @fluidframework/runtime-definitions#ITelemetryContext}.
	 * @param incrementalSummaryContext - See {@link @fluidframework/runtime-definitions#IExperimentalIncrementalSummaryContext}.
	 */
	summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats;

	/**
	 * Allows the component to perform custom loading. The storage service is scoped to this component and therefore
	 * paths in this component will not collide with those in other components, even if they are the same string.
	 * @param service - Storage used by the component
	 * @param parse - Parses serialized data from storage into runtime objects for the component
	 */
	load(service: IChannelStorageService, parse: SummaryElementParser): Promise<void>;
}

/**
 * Serializes the given contents into a string acceptable for storing in summaries, i.e. all
 * Fluid handles have been replaced appropriately by an IFluidSerializer
 */
export type SummaryElementStringifier = (contents: unknown) => string;

/**
 * Parses a serialized/summarized string into an object, rehydrating any Fluid handles as necessary
 */
export type SummaryElementParser = (contents: string) => unknown;

/**
 * The type for the metadata in the summarizable's summary.
 * The metadata is stored under the {@link summarizablesMetadataKey} key in the summary.
 * @remarks
 * This is common metadata used by all summarizables. If a summarizable needs to add more metadata,
 * it should define its own metadata type that extends this type.
 */
// Using type definition instead of interface to make this compatible with JsonCompatible.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SharedTreeSummarizableMetadata = {
	/** The version of the SharedTree summary. */
	readonly version: number;
};

/**
 * The versions for the SharedTree summary format.
 */
export const enum SharedTreeSummaryFormatVersion {
	/**
	 * This version represents summary format before summary versioning was introduced.
	 */
	v1 = 1,
	/**
	 * This version adds metadata to the summary. This is backward compatible with version 1.
	 */
	v2 = 2,
	/**
	 * The latest version of the SharedTree summary. Must be updated when a new version is added.
	 */
	vLatest = v2,
}

export const supportedSharedTreeSummaryFormatVersions =
	new Set<SharedTreeSummaryFormatVersion>([
		SharedTreeSummaryFormatVersion.v1,
		SharedTreeSummaryFormatVersion.v2,
	]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
export function minVersionToSharedTreeSummaryFormatVersion(
	version: MinimumVersionForCollab,
): SharedTreeSummaryFormatVersion {
	// Currently, version 2 is written which adds metadata blob to the summary.
	return SharedTreeSummaryFormatVersion.v2;
}
