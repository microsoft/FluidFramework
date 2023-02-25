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
import { JsonCompatibleReadOnly, mapIterable } from "../util";
import {
	cachedValue,
	ChangeFamily,
	Commit,
	EditManager,
	ICachedValue,
	SummaryData,
	recordDependency,
	SessionId,
	SummaryBranch,
	SequencedCommit,
	ChangeEncoder,
} from "../core";
import {
	Index,
	SummaryElement,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../shared-tree-core";

/**
 * The storage key for the blob in the summary containing EditManager data
 */
const blobKey = "Blob";

const stringKey = "String";

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Remove commits when they are no longer in the collab window
// TODO: Try to reduce this to a single type parameter
// TODO: Move logic into Rebaser if possible
export class EditManagerIndex<TChangeset, TChangeFamily extends ChangeFamily<any, TChangeset>>
	implements Index, SummaryElement
{
	public readonly summaryElement?: SummaryElement = this;
	public readonly key = "EditManager";

	private readonly editDataBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly editManager: EditManager<TChangeset, TChangeFamily>,
	) {
		this.editDataBlob = cachedValue(async (observer) => {
			recordDependency(observer, this.editManager);
			const dataString = stringifySummary(
				this.editManager.getSummaryData(),
				this.editManager.changeFamily.encoder,
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
		const dataString = stringifySummary(
			this.editManager.getSummaryData(),
			this.editManager.changeFamily.encoder,
		);
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
		const data = parseSummary(dataString, this.editManager.changeFamily.encoder);
		this.editManager.loadSummaryData(data);
	}
}

/**
 * The in-memory data that summaries contain, in a JSON-compatible format.
 * Used as an implementation detail of {@link parseSummary} and {@link stringifySummary}.
 */
interface ReadonlyJsonSummaryData {
	readonly trunk: readonly Readonly<SequencedCommit<JsonCompatibleReadOnly>>[];
	readonly branches: readonly [SessionId, Readonly<SummaryBranch<JsonCompatibleReadOnly>>][];
}

export interface CommitEncoder<TChange, TCommit extends Commit<TChange>> {
	readonly encode: (commit: TCommit) => SequencedCommit<JsonCompatibleReadOnly>;
	readonly decode: (commit: SequencedCommit<JsonCompatibleReadOnly>) => SequencedCommit<TChange>;
}

export function parseSummary<TChangeset>(
	summary: string,
	encoder: ChangeEncoder<TChangeset>,
): SummaryData<TChangeset> {
	const decodeCommit = <T extends Commit<JsonCompatibleReadOnly>>(commit: T) => ({
		...commit,
		change: encoder.decodeJson(0, commit.change),
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
	encoder: ChangeEncoder<TChangeset>,
): string {
	const encodeCommit = <T extends Commit<TChangeset>>(commit: T) => ({
		...commit,
		change: encoder.encodeForJson(0, commit.change),
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
