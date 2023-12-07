/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { ICodecOptions, IJsonCodec } from "../codec";
import { ChangeFamily, ChangeFamilyEditor, EncodedRevisionTag, RevisionTag } from "../core";
import { JsonCompatibleReadOnly } from "../util";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "./sharedTreeCore";
import { EditManager, SummaryData } from "./editManager";
import { makeEditManagerCodec } from "./editManagerCodecs";

const stringKey = "String";

const formatVersion = 0;

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset> implements Summarizable {
	public readonly key = "EditManager";

	// Note: since there is only one format, this can just be cached on the class.
	// With more write formats active, it may make sense to keep around the "usual" format codec
	// (the one for the current persisted configuration) and resolve codecs for different versions
	// as necessary (e.g. an upgrade op came in, or the configuration changed within the collab window
	// and an op needs to be interpreted which isn't written with the current configuration).
	private readonly codec: IJsonCodec<SummaryData<TChangeset>>;
	public constructor(
		private readonly editManager: EditManager<
			ChangeFamilyEditor,
			TChangeset,
			ChangeFamily<ChangeFamilyEditor, TChangeset>
		>,
		revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
		options: ICodecOptions,
	) {
		const changesetCodec = this.editManager.changeFamily.codecs.resolve(formatVersion);
		this.codec = makeEditManagerCodec(changesetCodec, revisionTagCodec, options);
	}

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
		const jsonCompatible = this.codec.encode(this.editManager.getSummaryData());
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
		const data = this.codec.decode(summary);
		this.editManager.loadSummaryData(data);
	}
}
