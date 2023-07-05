/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { ICodecOptions, IJsonCodec } from "../codec";
import {
	cachedValue,
	ChangeFamily,
	ICachedValue,
	recordDependency,
	ChangeFamilyEditor,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "./sharedTreeCore";
import { EditManager, SummaryData } from "./editManager";
import { makeEditManagerCodec } from "./editManagerCodecs";

/**
 * The storage key for the blob in the summary containing EditManager data
 */
const blobKey = "Blob";

const stringKey = "String";

const formatVersion = 0;

/**
 * Provides methods for summarizing and loading an `EditManager`
 */
export class EditManagerSummarizer<TChangeset> implements Summarizable {
	public readonly key = "EditManager";

	private readonly editDataBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

	// Note: since there is only one format, this can just be cached on the class.
	// With more write formats active, it may make sense to keep around the "usual" format codec
	// (the one for the current persisted configuration) and resolve codecs for different versions
	// as necessary (e.g. an upgrade op came in, or the configuration changed within the collab window
	// and an op needs to be interpreted which isn't written with the current configuration).
	private readonly codec: IJsonCodec<SummaryData<TChangeset>, string>;
	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly editManager: EditManager<
			ChangeFamilyEditor,
			TChangeset,
			ChangeFamily<ChangeFamilyEditor, TChangeset>
		>,
		options: ICodecOptions,
	) {
		const changesetCodec = this.editManager.changeFamily.codecs.resolve(formatVersion);
		this.codec = makeEditManagerCodec(changesetCodec, options);
		this.editDataBlob = cachedValue(async (observer) => {
			recordDependency(observer, this.editManager);
			const encodedSummary = this.codec.encode(this.editManager.getSummaryData());
			// For now we are not chunking the edit data, but still put it in a reusable blob:
			return this.runtime.uploadBlob(IsoBuffer.from(JSON.stringify(encodedSummary)));
		});
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const dataString = this.codec.encode(this.editManager.getSummaryData());
		return createSingleBlobSummary(stringKey, dataString);
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const editDataBlobHandle = await this.editDataBlob.get();
		const content = stringify(editDataBlobHandle);
		return createSingleBlobSummary(blobKey, content);
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
		let schemaBuffer: ArrayBufferLike;
		if (await services.contains(blobKey)) {
			const handleBuffer = await services.readBlob(blobKey);
			const handleString = bufferToString(handleBuffer, "utf-8");
			const handle = parse(handleString) as IFluidHandle<ArrayBufferLike>;
			schemaBuffer = await handle.get();
		} else {
			assert(
				await services.contains(stringKey),
				0x42b /* EditManager data is required in summary */,
			);
			schemaBuffer = await services.readBlob(stringKey);
		}

		// After the awaits, validate that the data is in a clean state.
		// This detects any data that could have been accidentally added through
		// invalid means and is about to be overwritten.
		assert(
			this.editManager.isEmpty(),
			0x42c /* There should not already be stored EditManager data when loading from summary */,
		);

		const dataString = bufferToString(schemaBuffer, "utf-8");
		const data = this.codec.decode(dataString);
		this.editManager.loadSummaryData(data);
	}
}
