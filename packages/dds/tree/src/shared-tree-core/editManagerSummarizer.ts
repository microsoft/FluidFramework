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
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import type { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import type { IJsonCodec } from "../codec/index.js";
import type { ChangeFamily, ChangeFamilyEditor, SchemaAndPolicy } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { EditManager, SummaryData } from "./editManager.js";
import type { EditManagerEncodingContext } from "./editManagerCodecs.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "./summaryTypes.js";
import { VersionedSummarizer } from "./versionedSummarizer.js";

export const stringKey = "String";

/**
 * The versions for the edit manager summary format.
 */
export const enum EditManagerSummaryFormatVersion {
	/**
	 * This version represents summary format before summary versioning was introduced.
	 */
	v1 = 1,
	/**
	 * This version adds metadata to the summary. This is backward compatible with version 1.
	 */
	v2 = 2,
	/**
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v2,
}

const supportedVersions = new Set<EditManagerSummaryFormatVersion>([
	EditManagerSummaryFormatVersion.v1,
	EditManagerSummaryFormatVersion.v2,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToEditManagerSummaryFormatVersion(
	version: MinimumVersionForCollab,
): EditManagerSummaryFormatVersion {
	// Currently, version 2 is written which adds metadata blob to the summary.
	return EditManagerSummaryFormatVersion.v2;
}

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset>
	extends VersionedSummarizer<EditManagerSummaryFormatVersion>
	implements Summarizable
{
	public static readonly key = "EditManager";
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
		super(
			EditManagerSummarizer.key,
			minVersionToEditManagerSummaryFormatVersion(minVersionForCollab),
			supportedVersions,
			true /* supportPreVersioningFormat */,
		);
	}

	protected summarizeInternal(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
		builder: SummaryTreeBuilder;
	}): void {
		const { stringify, builder } = props;
		const context: EditManagerEncodingContext =
			this.schemaAndPolicy === undefined
				? { idCompressor: this.idCompressor }
				: { schema: this.schemaAndPolicy, idCompressor: this.idCompressor };
		const jsonCompatible = this.codec.encode(this.editManager.getSummaryData(), context);
		const dataString = stringify(jsonCompatible);
		builder.addBlob(stringKey, dataString);
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
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
