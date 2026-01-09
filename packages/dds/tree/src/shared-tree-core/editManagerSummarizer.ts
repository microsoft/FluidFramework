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
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
	type SummaryTreeBuilder,
} from "@fluidframework/runtime-utils/internal";

import { FluidClientVersion, type IJsonCodec } from "../codec/index.js";
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
import { summaryContentBlobKey as summaryContentBlobKeyV1ToV2 } from "./editManagerSummaryFormatV1ToV4.js";
import { summaryContentBlobKey as summaryContentBlobKeyV3 } from "./editManagerSummaryFormatV3.js";

/**
 * @deprecated Use version-specific blob keys from editManagerSummaryFormatV1toV2.js or editManagerSummaryFormatV3.js instead.
 * This export is maintained for backward compatibility with existing tests.
 * The storage key for EditManager summary content blob used in version 1 and version 2.
 */
export const stringKey = summaryContentBlobKeyV1ToV2;

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
	 * This version changes the key where the summary content is stored.
	 * This is not backward compatible with version 1 or 2.
	 */
	v3 = 3,
	/**
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v3,
}

const supportedVersions = new Set<EditManagerSummaryFormatVersion>([
	EditManagerSummaryFormatVersion.v1,
	EditManagerSummaryFormatVersion.v2,
	EditManagerSummaryFormatVersion.v3,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToEditManagerSummaryFormatVersion(
	version: MinimumVersionForCollab,
): EditManagerSummaryFormatVersion {
	return getConfigForMinVersionForCollab(version, {
		[lowestMinVersionForCollab]: EditManagerSummaryFormatVersion.v2,
		[FluidClientVersion.v2_81]: EditManagerSummaryFormatVersion.v3,
	});
}

/**
 * Gets the key for the blob containing the edit manager summary content based on the summary format version.
 * @param summaryFormatVersion - The version of the edit manager summary format.
 * @returns The key for the edit manager summary content blob.
 */
function getEditManagerSummaryContentKey(
	summaryFormatVersion: EditManagerSummaryFormatVersion | undefined,
): string {
	return summaryFormatVersion === undefined ||
		summaryFormatVersion < EditManagerSummaryFormatVersion.v3
		? summaryContentBlobKeyV1ToV2
		: summaryContentBlobKeyV3;
}

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset>
	extends VersionedSummarizer<EditManagerSummaryFormatVersion>
	implements Summarizable
{
	public static readonly key = "EditManager";
	private readonly writeSummaryContentBlobKey: string;

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
		this.writeSummaryContentBlobKey = getEditManagerSummaryContentKey(
			minVersionToEditManagerSummaryFormatVersion(minVersionForCollab),
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
		builder.addBlob(this.writeSummaryContentBlobKey, dataString);
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
		version: EditManagerSummaryFormatVersion | undefined,
	): Promise<void> {
		const summaryContentBlobKey = getEditManagerSummaryContentKey(version);
		const schemaBuffer: ArrayBufferLike = await services.readBlob(summaryContentBlobKey);

		// After the awaits, validate that the data is in a clean state.
		// This detects any data that could have been accidentally added through
		// invalid means and is about to be overwritten.
		assert(
			this.editManager.isEmpty(),
			0x42c /* There should not already be stored EditManager data when loading from summary */,
		);

		const summary = parse(bufferToString(schemaBuffer, "utf8")) as JsonCompatibleReadOnly;
		const data = this.codec.decode(summary, { idCompressor: this.idCompressor });
		this.editManager.loadSummaryData(data);
	}
}
