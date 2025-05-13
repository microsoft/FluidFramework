/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base/internal";

import type { IJsonCodec } from "../codec/index.js";
import type { ChangeFamily, ChangeFamilyEditor, SchemaAndPolicy } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import type { EditManager, SummaryData } from "./editManager.js";
import type { EditManagerEncodingContext } from "./editManagerCodecs.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "./sharedTreeCore.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

const stringKey = "String";

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset> implements Summarizable {
	public readonly key = "EditManager";

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
		private readonly schemaAndPolicy?: SchemaAndPolicy,
	) {}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return this.summarizeCore(stringify);
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return this.summarizeCore(stringify);
	}

	private summarizeCore(stringify: SummaryElementStringifier): ISummaryTreeWithStats {
		const context: EditManagerEncodingContext =
			this.schemaAndPolicy !== undefined
				? { schema: this.schemaAndPolicy, idCompressor: this.idCompressor }
				: { idCompressor: this.idCompressor };
		const jsonCompatible = this.codec.encode(this.editManager.getSummaryData(), context);
		const dataString = stringify(jsonCompatible);
		return createSingleBlobSummary(stringKey, dataString);
	}

	public async load(
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
