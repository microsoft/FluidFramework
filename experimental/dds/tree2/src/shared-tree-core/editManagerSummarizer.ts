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
import { IMultiFormatCodec } from "../codec";
import { JsonCompatibleReadOnly, mapIterable } from "../util";
import {
	cachedValue,
	ChangeFamily,
	ICachedValue,
	recordDependency,
	SessionId,
	ChangeFamilyEditor,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "./sharedTreeCore";
import {
	Commit,
	EditManager,
	SequencedCommit,
	SummarySessionBranch,
	SummaryData,
} from "./editManager";

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
	private readonly changesetCodec: IMultiFormatCodec<TChangeset>;
	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly editManager: EditManager<
			ChangeFamilyEditor,
			TChangeset,
			ChangeFamily<ChangeFamilyEditor, TChangeset>
		>,
	) {
		this.changesetCodec = this.editManager.changeFamily.codecs.resolve(formatVersion);
		this.editDataBlob = cachedValue(async (observer) => {
			recordDependency(observer, this.editManager);
			const dataString = stringifySummary(
				this.editManager.getSummaryData(),
				this.changesetCodec,
			);
			// For now we are not chunking the edit data, but still put it in a reusable blob:
			return this.runtime.uploadBlob(IsoBuffer.from(dataString));
		});
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const dataString = stringifySummary(this.editManager.getSummaryData(), this.changesetCodec);
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
		const data = parseSummary(dataString, this.changesetCodec);
		this.editManager.loadSummaryData(data);
	}
}

/**
 * The in-memory data that summaries contain, in a JSON-compatible format.
 * Used as an implementation detail of {@link parseSummary} and {@link stringifySummary}.
 */
interface ReadonlyJsonSummaryData {
	readonly trunk: readonly Readonly<SequencedCommit<JsonCompatibleReadOnly>>[];
	readonly branches: readonly [
		SessionId,
		Readonly<SummarySessionBranch<JsonCompatibleReadOnly>>,
	][];
}

export function parseSummary<TChangeset>(
	summary: string,
	codec: IMultiFormatCodec<TChangeset>,
): SummaryData<TChangeset> {
	const decodeCommit = <T extends Commit<JsonCompatibleReadOnly>>(commit: T) => ({
		...commit,
		change: codec.json.decode(commit.change),
	});

	const json: ReadonlyJsonSummaryData = JSON.parse(summary);

	return {
		trunk: json.trunk.map(decodeCommit),
		branches: new Map(
			mapIterable(json.branches, ([sessionId, branch]) => [
				sessionId,
				{ ...branch, commits: branch.commits.map(decodeCommit) },
			]),
		),
	};
}

export function stringifySummary<TChangeset>(
	data: SummaryData<TChangeset>,
	codec: IMultiFormatCodec<TChangeset>,
): string {
	const encodeCommit = <T extends Commit<TChangeset>>(commit: T) => ({
		...commit,
		change: codec.json.encode(commit.change),
	});

	const json: ReadonlyJsonSummaryData = {
		trunk: data.trunk.map(encodeCommit),
		branches: Array.from(data.branches.entries(), ([sessionId, branch]) => [
			sessionId,
			{ ...branch, commits: branch.commits.map(encodeCommit) },
		]),
	};

	return JSON.stringify(json);
}
