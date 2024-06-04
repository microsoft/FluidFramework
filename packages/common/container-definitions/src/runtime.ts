/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidObject,
	IDisposable,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IClientDetails,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISummaryTree,
} from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	ISnapshot,
	IDocumentMessage,
	ISnapshotTree,
	ISummaryContent,
	IVersion,
	MessageType,
} from "@fluidframework/driver-definitions/internal";

import type { IAudience } from "./audience.js";
import type { IDeltaManager } from "./deltas.js";
import type { ICriticalContainerError } from "./error.js";
import type { ILoader } from "./loader.js";

/**
 * The attachment state of some Fluid data (e.g. a container or data store), denoting whether it is uploaded to the
 * service.  The transition from detached to attached state is a one-way transition.
 * @public
 */
export enum AttachState {
	/**
	 * In detached state, the data is only present on the local client's machine.  It has not yet been uploaded
	 * to the service.
	 */
	Detached = "Detached",

	/**
	 * In attaching state, the data has started the upload to the service, but has not yet completed.
	 */
	Attaching = "Attaching",

	/**
	 * In attached state, the data has completed upload to the service.  It can be accessed by other clients after
	 * reaching attached state.
	 */
	Attached = "Attached",
}

/**
 * The IRuntime represents an instantiation of a code package within a Container.
 * Primarily held by the ContainerContext to be able to interact with the running instance of the Container.
 * @alpha
 */
export interface IRuntime extends IDisposable {
	/**
	 * Notifies the runtime of a change in the connection state
	 */
	setConnectionState(connected: boolean, clientId?: string);

	/**
	 * Processes the given op (message)
	 */
	process(message: ISequencedDocumentMessage, local: boolean);

	/**
	 * Processes the given signal
	 */
	// TODO: use `unknown` instead (API breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	processSignal(message: any, local: boolean);

	/**
	 * Create a summary. Used when attaching or serializing a detached container.
	 *
	 * @param blobRedirectTable - A table passed during the attach process. While detached, blob upload is supported
	 * using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the
	 * new storage IDs so requests can be redirected.
	 */
	createSummary(blobRedirectTable?: Map<string, string>): ISummaryTree;

	/**
	 * Propagate the container state when container is attaching or attached.
	 * @param attachState - State of the container.
	 */
	setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;

	/**
	 * Get pending local state in a serializable format to be given back to a newly loaded container
	 */
	getPendingLocalState(props?: IGetPendingLocalStateProps): unknown;

	/**
	 * Notify runtime that we have processed a saved message, so that it can do async work (applying
	 * stashed ops) after having processed it.
	 */
	notifyOpReplay?(message: ISequencedDocumentMessage): Promise<void>;

	/**
	 * Exposes the entryPoint for the container runtime.
	 * Use this as the primary way of getting access to the user-defined logic within the container runtime.
	 *
	 * @see {@link IContainer.getEntryPoint}
	 */
	getEntryPoint(): Promise<FluidObject>;
}

/**
 * Payload type for IContainerContext.submitBatchFn()
 * @alpha
 */
export interface IBatchMessage {
	contents?: string;
	metadata?: Record<string, unknown>;
	compression?: string;
	referenceSequenceNumber?: number;
}

/**
 * IContainerContext is fundamentally just the set of things that an IRuntimeFactory (and IRuntime) will consume from the
 * loader layer.  It gets passed into the IRuntimeFactory.instantiateRuntime call.  Only include members on this interface
 * if you intend them to be consumed/called from the runtime layer.
 *
 * TODO: once `@alpha` tag is removed, `unknown` should be removed from submitSignalFn
 * @see {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/7462}
 * @alpha
 */
export interface IContainerContext {
	/**
	 * Not recommended for general use, is used in some cases to control various runtime behaviors.
	 *
	 * @remarks
	 * Used to be ILoaderOptions, this is staging for eventual removal.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly options: Record<string | number, any>;
	readonly clientId: string | undefined;
	readonly clientDetails: IClientDetails;
	readonly storage: IDocumentStorageService;
	readonly connected: boolean;
	readonly baseSnapshot: ISnapshotTree | undefined;
	/**
	 * @deprecated Please use submitBatchFn & submitSummaryFn
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number;
	/**
	 * @returns clientSequenceNumber of last message in a batch
	 */
	readonly submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number) => number;
	readonly submitSummaryFn: (
		summaryOp: ISummaryContent,
		referenceSequenceNumber?: number,
	) => number;
	readonly submitSignalFn: (contents: unknown, targetClientId?: string) => void;
	readonly disposeFn?: (error?: ICriticalContainerError) => void;
	readonly closeFn: (error?: ICriticalContainerError) => void;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly quorum: IQuorumClients;
	readonly audience: IAudience;
	readonly loader: ILoader;
	// The logger implementation, which would support tagged events, should be provided by the loader.
	readonly taggedLogger: ITelemetryBaseLogger;
	pendingLocalState?: unknown;

	/**
	 * Ambient services provided with the context
	 */
	readonly scope: FluidObject;

	/**
	 * Get an absolute url for a provided container-relative request.
	 * @param relativeUrl - A relative request within the container
	 *
	 * TODO: Optional for backwards compatibility. Make non-optional in version 0.19
	 */
	getAbsoluteUrl?(relativeUrl: string): Promise<string | undefined>;

	/**
	 * Indicates the attachment state of the container to a host service.
	 */
	readonly attachState: AttachState;

	getLoadedFromVersion(): IVersion | undefined;

	updateDirtyContainerState(dirty: boolean): void;

	readonly supportedFeatures?: ReadonlyMap<string, unknown>;

	/**
	 * WARNING: this id is meant for telemetry usages ONLY, not recommended for other consumption
	 * This id is not supposed to be exposed anywhere else. It is dependant on usage or drivers
	 * and scenarios which can change in the future.
	 * @deprecated 2.0.0-internal.5.2.0 - The docId is already logged by the {@link IContainerContext.taggedLogger} for
	 * telemetry purposes, so this is generally unnecessary for telemetry.
	 * If the id is needed for other purposes it should be passed to the consumer explicitly.
	 *
	 * @privateremarks Tracking in AB#5714
	 */
	readonly id: string;

	/**
	 * This contains all parts of a snapshot like blobContents, ops etc.
	 */
	readonly snapshotWithContents?: ISnapshot;
}

/**
 * @alpha
 */
export const IRuntimeFactory: keyof IProvideRuntimeFactory = "IRuntimeFactory";

/**
 * @alpha
 */
export interface IProvideRuntimeFactory {
	readonly IRuntimeFactory: IRuntimeFactory;
}

/**
 * Exported module definition
 *
 * Provides the entry point for the ContainerContext to load the proper IRuntime
 * to start up the running instance of the Container.
 * @alpha
 */
export interface IRuntimeFactory extends IProvideRuntimeFactory {
	/**
	 * Instantiates a new IRuntime for the given IContainerContext to proxy to
	 * This is the main entry point to the Container's business logic
	 *
	 * @param context - container context to be supplied to the runtime
	 * @param existing - whether to instantiate for the first time or from an existing context
	 */
	instantiateRuntime(context: IContainerContext, existing: boolean): Promise<IRuntime>;
}

/**
 * Defines list of properties expected for getPendingLocalState
 * @alpha
 */
export interface IGetPendingLocalStateProps {
	/**
	 * Indicates the container will close after getting the pending state. Used internally
	 * to wait for blobs to be attached to a DDS and collect generated ops before closing.
	 */
	readonly notifyImminentClosure: boolean;

	/**
	 * Abort signal to stop waiting for blobs to get attached to a DDS. When triggered,
	 * only blobs attached will be collected in the pending state.
	 * Intended to be used in the very rare scenario in which getLocalPendingState go stale due
	 * to a blob failed to be referenced. Such a blob will be lost but the rest of the state will
	 * be preserved and collected.
	 */
	readonly stopBlobAttachingSignal?: AbortSignal;

	/**
	 * Date to be used as the starting time of a session. This date is updated in case we refresh the
	 * base snapshot since we won't be referencing ops older than the new snapshot.
	 */
	readonly sessionExpiryTimerStarted?: number;

	/**
	 * Snapshot sequence number. It will help the runtime to know which ops should still be stashed.
	 */
	readonly snapshotSequenceNumber?: number;
}
