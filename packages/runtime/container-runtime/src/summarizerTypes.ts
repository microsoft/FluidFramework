/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IEvent,
    IEventProvider,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { Deferred } from "@fluidframework/common-utils";
import {
    IFluidRouter,
    IFluidRunnable,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { ContainerWarning, IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { ISummaryStats } from "@fluidframework/runtime-definitions";
import { IConnectableRuntime } from "./runWhileConnectedCoordinator";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideSummarizer>> { }
}

export const ISummarizer: keyof IProvideSummarizer = "ISummarizer";

export interface IProvideSummarizer {
    readonly ISummarizer: ISummarizer;
}

export interface ISummarizerInternalsProvider {
    /** Encapsulates the work to walk the internals of the running container to generate a summary */
    generateSummary(options: IGenerateSummaryOptions): Promise<GenerateSummaryData>;

    /** Callback whenever a new SummaryAck is received, to update internal tracking state */
    refreshLatestSummaryAck(
        proposalHandle: string,
        ackHandle: string,
        summaryLogger: ITelemetryLogger,
    ): Promise<void>;
}

export interface ISummarizingWarning extends ContainerWarning {
    readonly errorType: "summarizingError";
    readonly logged: boolean;
}

export interface ISummarizerRuntime extends IConnectableRuntime {
    readonly logger: ITelemetryLogger;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly summarizerClientId: string | undefined;
    nextSummarizerD?: Deferred<ISummarizer>;
    closeFn(): void;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "disconnected", listener: () => void): this;
    removeListener(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
}

export interface IGenerateSummaryOptions {
    /** True to generate the full tree with no handle reuse optimizations; defaults to false */
    fullTree?: boolean,
    /** True to ask the server what the latest summary is first */
    refreshLatestAck: boolean,
    /** Logger to use for correlated summary events */
    summaryLogger: ITelemetryLogger,
}

export interface IGeneratedSummaryStats extends ISummaryStats {
    dataStoreCount: number;
    summarizedDataStoreCount: number;
}
export interface IBaseSummaryData {
    readonly referenceSequenceNumber: number;
}
export interface IGenerateSummaryData {
    readonly summaryStats: IGeneratedSummaryStats;
    readonly generateDuration: number;
}
export interface IUploadSummaryData {
    readonly handle: string;
    readonly uploadDuration: number;
}
export interface ISubmitSummaryData {
    readonly clientSequenceNumber: number;
    readonly submitOpDuration: number;
}
export type GenerateSummaryData =
    ({ error: any; } & (
        | ({ stage: "aborted"; } & IBaseSummaryData)
        | ({ stage: "generated"; } & IGenerateSummaryData & IBaseSummaryData)
        | ({ stage: "uploaded"; } & IUploadSummaryData & IGenerateSummaryData & IBaseSummaryData)
    ))
    | ({ stage: "submitted"; } & ISubmitSummaryData & IUploadSummaryData & IGenerateSummaryData & IBaseSummaryData);

export type SummarizerStopReason =
    /** Summarizer client failed to summarize in all 3 consecutive attempts. */
    | "failToSummarize"
    /**
     * Summarizer client detected that its parent is no longer elected the summarizer.
     * Normally, the parent client would realize it is disconnected first and call stop
     * giving a "parentNotConnected" stop reason. If the summarizer client attempts to
     * generate a summary and realizes at that moment that the parent is not elected,
     * only then will it stop itself with this message.
     */
    | "parentNoLongerSummarizer"
    /** Parent client reported that it is no longer connected. */
    | "parentNotConnected"
    /**
     * Parent client reported that it is no longer elected the summarizer.
     * This is the normal flow; a disconnect will always trigger the parent
     * client to no longer be elected as responsible for summaries. Then it
     * tries to stop its spawned summarizer client.
     */
    | "parentShouldNotSummarize"
    /** Parent client reported that it is disposed. */
    | "disposed";

export interface ISummarizerEvents extends IEvent {
    /**
     * An event indicating that the Summarizer is having problems summarizing
     */
    (event: "summarizingError", listener: (error: ISummarizingWarning) => void);
}

export interface ISummarizer
    extends IEventProvider<ISummarizerEvents>, IFluidRouter, IFluidRunnable, IFluidLoadable {
    /**
     * Returns a promise that will be resolved with the next Summarizer after context reload
     */
    setSummarizer(): Promise<ISummarizer>;
    stop(reason?: SummarizerStopReason): void;
    run(onBehalfOf: string): Promise<void>;
    updateOnBehalfOf(onBehalfOf: string): void;
}
