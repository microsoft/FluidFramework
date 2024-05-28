/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base/internal";

import { IJsonCodec } from "../codec/index.js";
import { ChangeFamily, ChangeFamilyEditor, SchemaAndPolicy } from "../core/index.js";
import { JsonCompatibleReadOnly } from "../util/index.js";

import { EditManager, SummaryData } from "./editManager.js";
import { EditManagerEncodingContext } from "./editManagerCodecs.js";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "./sharedTreeCore.js";

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
			this.schemaAndPolicy !== undefined ? { schema: this.schemaAndPolicy } : {};
		const jsonCompatible = this.codec.encode(this.editManager.getSummaryData(), context);
		const dataString = stringify(jsonCompatible);
		return createSingleBlobSummary(stringKey, dataString);
	}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		// TODO: Properly implement garbage collection. Right now, garbage collection is performed automatically
		// by the code in SharedObject (from which SharedTreeCore extends). The `runtime.uploadBlob` API delegates
		// to the `BlobManager`, which automatically populates the summary with ISummaryAttachment entries for each
		// blob.
		return {
			gcNodes: {},
		};
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
		const data = this.codec.decode(summary, {});
		this.editManager.loadSummaryData(data);
	}
}
