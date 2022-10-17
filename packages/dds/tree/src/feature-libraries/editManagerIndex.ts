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
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ChangeEncoder, ChangeFamily } from "../change-family";
import {
    Index,
    SummaryElement,
    SummaryElementParser,
    SummaryElementStringifier,
} from "../shared-tree-core";
import { JsonCompatibleReadOnly } from "../util";
import {
    Branch,
    Commit,
    EditManager,
    MutableSummaryData,
    ReadonlySummaryData,
    SessionId,
} from "../edit-manager";
import { cachedValue, ICachedValue, recordDependency } from "../dependency-tracking";

/**
 * The storage key for the blob in the summary containing EditManager data
 */
const blobKey = "EditManagerBlob";

const stringKey = "EditManagerString";

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Remove commits when they are no longer in the collab window
// TODO: Try to reduce this to a single type parameter
// TODO: Move logic into Rebaser if possible
export class EditManagerIndex<TChangeset, TChangeFamily extends ChangeFamily<any, TChangeset>>
    implements Index<TChangeset>, SummaryElement
{
    public readonly summaryElement?: SummaryElement = this;
    public readonly key = "EditManager";

    private readonly commitEncoder: CommitEncoder<TChangeset>;

    private readonly editDataBlob: ICachedValue<Promise<IFluidHandle<ArrayBufferLike>>>;

    public constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly editManager: EditManager<TChangeset, TChangeFamily>,
    ) {
        this.commitEncoder = commitEncoderFromChangeEncoder(editManager.changeFamily.encoder);
        this.editDataBlob = cachedValue(async (observer) => {
            recordDependency(observer, this.editManager);
            const dataString = encodeSummary(this.editManager.getSummaryData(), this.commitEncoder);
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
        const builder = new SummaryTreeBuilder();
        const dataString = encodeSummary(this.editManager.getSummaryData(), this.commitEncoder);
        builder.addBlob(stringKey, dataString);
        return builder.getSummaryTree();
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        const editDataBlobHandle = await this.editDataBlob.get();
        const builder = new SummaryTreeBuilder();
        builder.addBlob(blobKey, stringify(editDataBlobHandle));
        return builder.getSummaryTree();
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
        const [hasString, hasBlob] = await Promise.all([
            services.contains(stringKey),
            services.contains(blobKey),
        ]);
        assert(hasString || hasBlob, "EditManager data is required in summary");
        let schemaBuffer: ArrayBufferLike;
        if (hasBlob) {
            const handleBuffer = await services.readBlob(blobKey);
            const handleString = bufferToString(handleBuffer, "utf-8");
            const handle = parse(handleString) as IFluidHandle<ArrayBufferLike>;
            schemaBuffer = await handle.get();
        } else {
            schemaBuffer = await services.readBlob(stringKey);
        }

        // After the awaits, validate that the data is in a clean state.
        // This detects any data that could have been accidentally added through
        // invalid means and is about to be overwritten.
        assert(
            this.editManager.isEmpty(),
            "There should not already be stored EditManager data when loading from summary",
        );

        const dataString = bufferToString(schemaBuffer, "utf-8");
        this.editManager.loadSummaryData((data: MutableSummaryData<TChangeset>) => {
            loadSummary(dataString, this.commitEncoder, data);
        });
    }
}

/**
 * The in-memory data that summaries contain, in a JSON-compatible format.
 * Used as an implementation detail of {@link loadSummary} and {@link encodeSummary}.
 */
interface ReadonlyJsonSummaryData {
    readonly trunk: readonly Readonly<Commit<JsonCompatibleReadOnly>>[];
    readonly branches: readonly [SessionId, Readonly<Branch<JsonCompatibleReadOnly>>][];
}

export interface CommitEncoder<TChange> {
    readonly encode: (commit: Commit<TChange>) => Commit<JsonCompatibleReadOnly>;
    readonly decode: (commit: Commit<JsonCompatibleReadOnly>) => Commit<TChange>;
}

export function commitEncoderFromChangeEncoder<TChangeset>(
    changeEncoder: ChangeEncoder<TChangeset>,
): CommitEncoder<TChangeset> {
    return {
        encode: (commit: Commit<TChangeset>): Commit<JsonCompatibleReadOnly> => ({
            ...commit,
            changeset: changeEncoder.encodeForJson(0, commit.changeset),
        }),
        decode: (commit: Commit<JsonCompatibleReadOnly>): Commit<TChangeset> => ({
            ...commit,
            changeset: changeEncoder.decodeJson(0, commit.changeset),
        }),
    };
}

export function loadSummary<TChange>(
    summary: string,
    encoder: CommitEncoder<TChange>,
    repo: MutableSummaryData<TChange>,
): void {
    const decode = (c: Commit<JsonCompatibleReadOnly>) => encoder.decode(c);
    const { trunk, branches } = repo;
    const json: ReadonlyJsonSummaryData = JSON.parse(summary);
    for (const commit of json.trunk) {
        trunk.push(decode(commit));
    }
    for (const [k, b] of json.branches) {
        const branch: Branch<TChange> = { ...b, localChanges: b.localChanges.map(decode) };
        branches.set(k, branch);
    }
}

export function encodeSummary<TChange>(
    data: ReadonlySummaryData<TChange>,
    encoder: CommitEncoder<TChange>,
): string {
    const encode = (c: Commit<TChange>) => encoder.encode(c);
    const json: ReadonlyJsonSummaryData = {
        trunk: data.trunk.map(encode),
        branches: Array.from(data.branches.entries(), ([k, b]) => [
            k,
            { ...b, localChanges: b.localChanges.map(encode) },
        ]),
    };
    return JSON.stringify(json);
}
