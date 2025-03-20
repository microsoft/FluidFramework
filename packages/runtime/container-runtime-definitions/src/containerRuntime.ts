/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttachState } from "@fluidframework/container-definitions";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type {
	FluidObject,
	IEvent,
	IEventProvider,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import type { IClientDetails } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type {
	FlushMode,
	IContainerRuntimeBase,
	IContainerRuntimeBaseEvents,
	IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";

/**
 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 * @legacy
 * @alpha
 */
export interface IContainerRuntimeWithResolveHandle_Deprecated extends IContainerRuntime {
	readonly IFluidHandleContext: IFluidHandleContext;
	resolveHandle(request: IRequest): Promise<IResponse>;
}

/**
 * Events emitted by {@link IContainerRuntime}.
 * @legacy
 * @alpha
 * @sealed
 */
export interface IContainerRuntimeEvents
	extends IContainerRuntimeBaseEvents,
		ISummarizerEvents {
	(event: "dirty" | "disconnected" | "saved" | "attached", listener: () => void);
	(event: "connected", listener: (clientId: string) => void);
}

/**
 * @legacy
 * @alpha
 * @sealed
 */
export type SummarizerStopReason =
	/**
	 * Summarizer client failed to summarize in all attempts.
	 */
	| "failToSummarize"
	/**
	 * Parent client reported that it is no longer connected.
	 */
	| "parentNotConnected"
	/**
	 * Parent client reported that it is no longer elected the summarizer.
	 * This is the normal flow; a disconnect will always trigger the parent
	 * client to no longer be elected as responsible for summaries. Then it
	 * tries to stop its spawned summarizer client.
	 */
	| "notElectedParent"
	/**
	 * We are not already running the summarizer and we are not the current elected client id.
	 */
	| "notElectedClient"
	/**
	 * Summarizer client was disconnected
	 */
	| "summarizerClientDisconnected"
	/**
	 * running summarizer threw an exception
	 */
	| "summarizerException"
	/**
	 * The previous summary state on the summarizer is not the most recently acked summary. this also happens when the
	 * first submitSummary attempt fails for any reason and there's a 2nd summary attempt without an ack
	 */
	| "latestSummaryStateStale";

/**
 * @legacy
 * @alpha
 * @sealed
 */
export interface ISummarizeEventProps {
	result: "success" | "failure" | "canceled";
	currentAttempt: number;
	maxAttempts: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error?: any;
	/**
	 * Result message of a failed summarize attempt
	 */
	failureMessage?: string;
	/**
	 * Was this summarize attempt part of the lastSummary process?
	 */
	isLastSummary?: boolean;
}

/**
 * @legacy
 * @alpha
 * @sealed
 */
export interface ISummarizerObservabilityProps {
	numUnsummarizedRuntimeOps: number;
	numUnsummarizedNonRuntimeOps: number;
}

/**
 * @legacy
 * @alpha
 * @sealed
 */
export interface ISummarizerEvents extends IEvent {
	(
		event: "summarize",
		listener: (props: ISummarizeEventProps & ISummarizerObservabilityProps) => void,
	);
	(
		event: "summarizeAllAttemptsFailed",
		listener: (
			props: Omit<ISummarizeEventProps, "result"> & ISummarizerObservabilityProps,
		) => void,
	);
	(
		event: "summarizerStop",
		listener: (
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			props: { stopReason: SummarizerStopReason; error?: any } & ISummarizerObservabilityProps,
		) => void,
	);
	(
		event: "summarizerStart",
		listener: (props: { onBehalfOf: string } & ISummarizerObservabilityProps) => void,
	);
	(
		event: "summarizerStartupFailed",
		listener: (
			props: { reason: SummarizerStopReason } & ISummarizerObservabilityProps,
		) => void,
	);
}

/**
 * @legacy
 * @alpha
 * @sealed
 */
export type IContainerRuntimeBaseWithCombinedEvents = IContainerRuntimeBase &
	IEventProvider<IContainerRuntimeEvents>;

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 * @legacy
 * @alpha
 * @sealed
 */
export interface IContainerRuntime
	extends IProvideFluidDataStoreRegistry,
		IContainerRuntimeBaseWithCombinedEvents {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly options: Record<string | number, any>;
	readonly clientId: string | undefined;
	readonly clientDetails: IClientDetails;
	readonly connected: boolean;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly storage: IDocumentStorageService;
	readonly flushMode: FlushMode;
	readonly scope: FluidObject;
	/**
	 * Indicates the attachment state of the container to a host service.
	 */
	readonly attachState: AttachState;

	/**
	 * Returns true if document is dirty, i.e. there are some pending local changes that
	 * either were not sent out to delta stream or were not yet acknowledged.
	 */
	readonly isDirty: boolean;

	/**
	 * Get an absolute url for a provided container-relative request.
	 * Returns undefined if the container isn't attached to storage.
	 * @param relativeUrl - A relative request within the container
	 */
	getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
}
