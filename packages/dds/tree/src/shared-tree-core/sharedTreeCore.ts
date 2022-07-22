/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IChannelAttributes, IChannelStorageService, IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ITelemetryContext, ISummaryTreeWithStats, IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { toDelta } from "../changeset";
import { ChangeRebaser, FinalFromChangeRebaser, Rebaser, RevisionTag } from "../rebase";
import { AnchorSet, Delta } from "../tree";
import { fail } from "../util";
import { LazyPageTree } from "./lazyPageTree";

/**
 * Generic shared tree, which needs to be configured with indexes, field kinds and a history policy to be used.
 *
 * TODO: actually implement
 * TODO: is history policy a detail of what indexes are used, or is there something else to it?
 */
export class SharedTreeCore<TChangeRebaser extends ChangeRebaser<any, any, any>> extends LazyPageTree {
    public readonly rebaser: Rebaser<TChangeRebaser>;

    /**
     * The revision that is currently viewed as the head of the local branch.
     * Updated when calling by the indexes' newLocalState.
     */
    private localState: RevisionTag;

    private sequencedRevision: RevisionTag;

    /**
     * @param id - The id of the shared object
     * @param runtime - The IFluidDataStoreRuntime which contains the shared object
     * @param attributes - Attributes of the shared object
     */
    public constructor(
        private readonly indexes: Index<FinalFromChangeRebaser<TChangeRebaser>>[],
        changeRebaser: TChangeRebaser,
        private readonly anchors: AnchorSet,

        // Base class arguments
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
        super(id, runtime, attributes, telemetryContextPrefix);
        this.rebaser = new Rebaser(changeRebaser);
        this.localState = this.rebaser.empty;
        this.sequencedRevision = this.rebaser.empty;
    }

    // TODO: SharedObject's merging of the two summary methods into summarizeCore is not what we want here:
    // We might want to not subclass it, or override/reimplement most of its functionality.
    protected summarizeCore(serializer: IFluidSerializer, telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        // TODO: Do something like this loop for most of the methods in here.
        for (const index of this.indexes) {
            index.summaryElement?.getAttachSummary();
        }
        throw new Error("Method not implemented.");
    }

    protected async loadCore(services: IChannelStorageService): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        const changes = fail("Method not implemented.");
        const srcRevision = fail("Method not implemented.");
        const [sequencedRevision, finalChange] = this.rebaser.rebase(changes, srcRevision, this.sequencedRevision);
        for (const index of this.indexes) {
            index.sequencedChange?.(finalChange);
        }
        this.sequencedRevision = sequencedRevision;

        const newLocalRevisionHead = fail("TODO: rebase local changes onto new sequencedRevision");
        this.updateLocalState(newLocalRevisionHead);
    }
    protected onDisconnect() {
        throw new Error("Method not implemented.");
    }
    protected applyStashedOp(content: any): unknown {
        throw new Error("Method not implemented.");
    }

    // TODO: custom getGCData.

    // TODO: call this after local or remote edits.
    private updateLocalState(revision: RevisionTag): void {
        // TODO: maybe unify these two calls into rebaser as an optimziation.
        this.rebaser.rebaseAnchors(this.anchors, this.localState, revision);
        const delta = toDelta(this.rebaser.getResolutionPath(this.localState, revision));
        for (const index of this.indexes) {
            index.newLocalState?.(delta);
        }
        this.localState = revision;
    }
}

/**
 * Observes Changesets (after rebase), after writes data into summaries when requested.
 */
export interface Index<TChangeset> {
    /**
     * @param change - change that was just sequenced.
     * @param derivedFromLocal - iff provided, change was a local change (from this session)
     * which is now sequenced (and thus no longer local).
     */
    sequencedChange?(change: TChangeset, derivedFromLocal?: TChangeset): void;

    newLocalChange?(change: TChangeset): void;

    /**
     * @param changeDelta - composed changeset from previous local state
     * (state after all sequenced then local changes are accounted for) to current local state.
     * May involve effects of a new sequenced change (including rebasing of local changes onto it),
     * or a new local change. Called after either sequencedChange or newLocalChange.
     */
    newLocalState?(changeDelta: Delta.Root): void;

    /**
     * If provided, records data into summaries.
     */
    readonly summaryElement?: SummaryElement;
}

export interface SummaryElement {
    /**
     * Field name in summary json under which this element stores its data.
     *
     * TODO: define how this is used (ex: how does user of index consume this before calling loadCore).
     */
    readonly key: string;

    // See IChannel
    getAttachSummary(
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats;

    // See IChannel
    summarize(
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats>;

    // See ISharedObject
    // TODO: how do we many this work synchronously when using blobs that reference blobs?
    getGCData(fullGC?: boolean): IGarbageCollectionData;

    // See SharedObjectCore
    loadCore(services: IChannelStorageService): Promise<void>;
}
