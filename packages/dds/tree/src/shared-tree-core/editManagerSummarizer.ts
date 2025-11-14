/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { FluidClientVersion, type IJsonCodec } from "../codec/index.js";
import type { ChangeFamily, ChangeFamilyEditor, SchemaAndPolicy } from "../core/index.js";
import {
	brand,
	readAndParseSnapshotBlob,
	type Brand,
	type JsonCompatibleReadOnly,
} from "../util/index.js";

import type { EditManager, SummaryData } from "./editManager.js";
import type { EditManagerEncodingContext } from "./editManagerCodecs.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "./sharedTreeCore.js";

const stringKey = "String";

/**
 * The storage key for the blob containing metadata for the edit manager's summary.
 */
export const editManagerMetadataKey = ".metadata";

/**
 * The summary version of the edit manager.
 *
 * @remarks
 * The metadata does not get written for version v0, this value is only for clarity, and is used for asserting that there is no version property when loading old summaries without a metadata blob.
 * v1: Adds a metadata blob to the summary, containing the version of the summary.
 */
export const EditManagerSummaryVersion = {
	v0: 0,
	v1: 1,
} as const;
export type EditManagerSummaryVersion = Brand<
	(typeof EditManagerSummaryVersion)[keyof typeof EditManagerSummaryVersion],
	"EditManagerSummaryVersion"
>;

/**
 * The type for the metadata in edit manager's summary.
 * Using type definition instead of interface to make this compatible with JsonCompatible.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EditManagerSummaryMetadata = {
	readonly version: EditManagerSummaryVersion;
};

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToEditManagerSummaryVersion(
	version: MinimumVersionForCollab,
): EditManagerSummaryVersion {
	return version < FluidClientVersion.v2_73
		? brand(EditManagerSummaryVersion.v0)
		: brand(EditManagerSummaryVersion.v1);
}

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset> implements Summarizable {
	public readonly key = "EditManager";

	/**
	 * The summary version to write in the metadata for the edit manager summary.
	 */
	private readonly summaryWriteVersion: EditManagerSummaryVersion;

	public constructor(
		private readonly editManager: EditManager<
			ChangeFamilyEditor,
			TChangeset,
			ChangeFamily<ChangeFamilyEditor, TChangeset>
		>,
		private readonly codec: IJsonCodec<
			SummaryData<TChangeset>,
			JsonCompatibleReadOnly,
			JsonCompatibleReadOnly,
			EditManagerEncodingContext
		>,
		private readonly idCompressor: IIdCompressor,
		minVersionForCollab: MinimumVersionForCollab,
		private readonly schemaAndPolicy?: SchemaAndPolicy,
	) {
		this.summaryWriteVersion = minVersionToEditManagerSummaryVersion(minVersionForCollab);
	}

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		return this.summarizeCore(props.stringify);
	}

	private summarizeCore(stringify: SummaryElementStringifier): ISummaryTreeWithStats {
		const context: EditManagerEncodingContext =
			this.schemaAndPolicy !== undefined
				? { schema: this.schemaAndPolicy, idCompressor: this.idCompressor }
				: { idCompressor: this.idCompressor };
		const jsonCompatible = this.codec.encode(this.editManager.getSummaryData(), context);
		const dataString = stringify(jsonCompatible);

		const builder = new SummaryTreeBuilder();
		builder.addBlob(stringKey, dataString);
		// Add metadata if the summary version is v1 or higher.
		if (this.summaryWriteVersion >= EditManagerSummaryVersion.v1) {
			const metadata: EditManagerSummaryMetadata = {
				version: this.summaryWriteVersion,
			};
			builder.addBlob(editManagerMetadataKey, JSON.stringify(metadata));
		}
		return builder.getSummaryTree();
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(editManagerMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<EditManagerSummaryMetadata>(
				editManagerMetadataKey,
				services,
				parse,
			);
			assert(
				metadata.version === EditManagerSummaryVersion.v1,
				"Unsupported edit manager summary",
			);
		}

		const schemaBuffer: ArrayBufferLike = await services.readBlob(stringKey);

		// After the awaits, validate that the data is in a clean state.
		// This detects any data that could have been accidentally added through
		// invalid means and is about to be overwritten.
		assert(
			this.editManager.isEmpty(),
			0x42c /* There should not already be stored EditManager data when loading from summary */,
		);

		const summary = parse(bufferToString(schemaBuffer, "utf-8")) as JsonCompatibleReadOnly;
		const data = this.codec.decode(summary, { idCompressor: this.idCompressor });
		this.editManager.loadSummaryData(data);
	}
}
