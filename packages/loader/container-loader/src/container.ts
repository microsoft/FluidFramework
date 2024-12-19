/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/consistent-function-scoping */

import {
	TypedEventEmitter,
	performance,
	type ILayerCompatDetails,
} from "@fluid-internal/client-utils";
import {
	AttachState,
	IAudience,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	ContainerWarning,
	IBatchMessage,
	ICodeDetailsLoader,
	IContainer,
	IContainerEvents,
	IContainerLoadMode,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidModuleWithDetails,
	IGetPendingLocalStateProps,
	IProvideFluidCodeDetailsComparer,
	IProvideRuntimeFactory,
	IRuntime,
	isFluidCodeDetails,
	IDeltaManager,
	ReadOnlyInfo,
	type ILoader,
} from "@fluidframework/container-definitions/internal";
import {
	FluidObject,
	IEvent,
	IRequest,
	ITelemetryBaseProperties,
	LogLevel,
} from "@fluidframework/core-interfaces";
import { type ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import { assert, isPromiseLike, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IClient,
	IClientDetails,
	IQuorumClients,
	ISequencedClient,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshot,
	IThrottlingWarning,
	IUrlResolver,
	ICommittedProposal,
	IDocumentAttributes,
	IDocumentMessage,
	IQuorumProposals,
	ISequencedProposal,
	ISnapshotTree,
	ISummaryContent,
	IVersion,
	MessageType,
	ISequencedDocumentMessage,
	ISignalMessage,
	type ConnectionMode,
	type IContainerPackageInfo,
} from "@fluidframework/driver-definitions/internal";
import {
	getSnapshotTree,
	OnlineStatus,
	isCombinedAppAndProtocolSummary,
	isInstanceOfISnapshot,
	isOnline,
	readAndParse,
	runWithRetry,
	type CombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils/internal";
import {
	type TelemetryEventCategory,
	ITelemetryLoggerExt,
	EventEmitterWithErrorHandling,
	GenericError,
	IFluidErrorBase,
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	connectedEventName,
	createChildLogger,
	createChildMonitoringContext,
	formatTick,
	normalizeError,
	raiseConnectedEvent,
	wrapError,
	loggerToMonitoringContext,
	type ITelemetryErrorEventExt,
} from "@fluidframework/telemetry-utils/internal";
import structuredClone from "@ungap/structured-clone";
import { v4 as uuid } from "uuid";

import {
	AttachProcessProps,
	AttachmentData,
	runRetriableAttachProcess,
} from "./attachment.js";
import { Audience } from "./audience.js";
import { ConnectionManager } from "./connectionManager.js";
import { ConnectionState } from "./connectionState.js";
import {
	IConnectionStateHandler,
	createConnectionStateHandler,
} from "./connectionStateHandler.js";
import { ContainerContext } from "./containerContext.js";
import { ContainerStorageAdapter } from "./containerStorageAdapter.js";
import {
	IConnectionDetailsInternal,
	IConnectionManagerFactoryArgs,
	IConnectionStateChangeReason,
	ReconnectMode,
	getPackageName,
} from "./contracts.js";
import { DeltaManager, IConnectionArgs } from "./deltaManager.js";
import { validateRuntimeCompatibility } from "./layerCompatState.js";
// eslint-disable-next-line import/no-deprecated
import { IDetachedBlobStorage, ILoaderOptions, RelativeLoader } from "./loader.js";
import {
	serializeMemoryDetachedBlobStorage,
	createMemoryDetachedBlobStorage,
	tryInitializeMemoryDetachedBlobStorage,
} from "./memoryBlobStorage.js";
import { NoopHeuristic } from "./noopHeuristic.js";
import { pkgVersion } from "./packageVersion.js";
import { IQuorumSnapshot } from "./protocol/index.js";
import {
	IProtocolHandler,
	ProtocolHandler,
	ProtocolHandlerBuilder,
	protocolHandlerShouldProcessSignal,
} from "./protocol.js";
import { initQuorumValuesFromCodeDetails } from "./quorum.js";
import {
	type IPendingContainerState,
	type IPendingDetachedContainerState,
	SerializedStateManager,
} from "./serializedStateManager.js";
import {
	ISnapshotTreeWithBlobContents,
	combineAppAndProtocolSummary,
	combineSnapshotTreeAndSnapshotBlobs,
	getDetachedContainerStateFromSerializedContainer,
	getDocumentAttributes,
	getProtocolSnapshotTree,
	getSnapshotTreeAndBlobsFromSerializedContainer,
	runSingle,
} from "./utils.js";

const detachedContainerRefSeqNumber = 0;

const dirtyContainerEvent = "dirty";
const savedContainerEvent = "saved";

const packageNotFactoryError = "Code package does not implement IRuntimeFactory";

/**
 * @internal
 */
export interface IContainerLoadProps {
	/**
	 * The resolved url of the container being loaded
	 */
	readonly resolvedUrl: IResolvedUrl;
	/**
	 * Control which snapshot version to load from.  See IParsedUrl for detailed information.
	 */
	readonly version: string | undefined;
	/**
	 * Loads the Container in paused state if true, unpaused otherwise.
	 */
	readonly loadMode?: IContainerLoadMode;

	/**
	 * The pending state serialized from a previous container instance
	 */
	readonly pendingLocalState?: IPendingContainerState;
}

/**
 * @internal
 */
export interface IContainerCreateProps {
	/**
	 * Disables the Container from reconnecting if false, allows reconnect otherwise.
	 */
	readonly canReconnect?: boolean;
	/**
	 * Client details provided in the override will be merged over the default client.
	 */
	readonly clientDetailsOverride?: IClientDetails;

	/**
	 * The url resolver used by the loader for resolving external urls
	 * into Fluid urls such that the container specified by the
	 * external url can be loaded.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory take the Fluid url provided
	 * by the resolved url and constructs all the necessary services
	 * for communication with the container's server.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The code loader handles loading the necessary code
	 * for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * A property bag of options used by various layers
	 * to control features
	 */
	// eslint-disable-next-line import/no-deprecated
	readonly options: ILoaderOptions;

	/**
	 * Scope is provided to all container and is a set of shared
	 * services for container's to integrate with their host environment.
	 */
	readonly scope: FluidObject;

	/**
	 * The logger downstream consumers should construct their loggers from
	 */
	readonly subLogger: ITelemetryLoggerExt;

	/**
	 * Blobs storage for detached containers.
	 */
	// eslint-disable-next-line import/no-deprecated
	readonly detachedBlobStorage?: IDetachedBlobStorage;

	/**
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder;
}

/**
 * Waits until container connects to delta storage and gets up-to-date.
 *
 * Useful when resolving URIs and hitting 404, due to container being loaded from (stale) snapshot and not being
 * up to date. Host may chose to wait in such case and retry resolving URI.
 *
 * Warning: Will wait infinitely for connection to establish if there is no connection.
 * May result in deadlock if Container.disconnect() is called and never followed by a call to Container.connect().
 *
 * @returns `true`: container is up to date, it processed all the ops that were know at the time of first connection.
 *
 * `false`: storage does not provide indication of how far the client is. Container processed all the ops known to it,
 * but it maybe still behind.
 *
 * @throws an error beginning with `"Container closed"` if the container is closed before it catches up.
 * @legacy
 * @alpha
 */
export async function waitContainerToCatchUp(container: IContainer): Promise<boolean> {
	// Make sure we stop waiting if container is closed.
	if (container.closed) {
		throw new UsageError("waitContainerToCatchUp: Container closed");
	}

	return new Promise<boolean>((resolve, reject) => {
		const deltaManager = container.deltaManager;

		const closedCallback = (err?: ICriticalContainerError | undefined): void => {
			container.off("closed", closedCallback);
			const baseMessage = "Container closed while waiting to catch up";
			reject(
				err === undefined
					? new GenericError(baseMessage)
					: wrapError(
							err,
							(innerMessage) => new GenericError(`${baseMessage}: ${innerMessage}`),
						),
			);
		};
		container.on("closed", closedCallback);

		// Depending on config, transition to "connected" state may include the guarantee
		// that all known ops have been processed.  If so, we may introduce additional wait here.
		// Waiting for "connected" state in either case gets us at least to our own Join op
		// which is a reasonable approximation of "caught up"
		const waitForOps = (): void => {
			assert(
				container.connectionState === ConnectionState.CatchingUp ||
					container.connectionState === ConnectionState.Connected,
				0x0cd /* "Container disconnected while waiting for ops!" */,
			);
			const hasCheckpointSequenceNumber = deltaManager.hasCheckpointSequenceNumber;

			const connectionOpSeqNumber = deltaManager.lastKnownSeqNumber;
			assert(
				deltaManager.lastSequenceNumber <= connectionOpSeqNumber,
				0x266 /* "lastKnownSeqNumber should never be below last processed sequence number" */,
			);
			if (deltaManager.lastSequenceNumber === connectionOpSeqNumber) {
				container.off("closed", closedCallback);
				resolve(hasCheckpointSequenceNumber);
				return;
			}
			const callbackOps = (message: ISequencedDocumentMessage): void => {
				if (connectionOpSeqNumber <= message.sequenceNumber) {
					container.off("closed", closedCallback);
					resolve(hasCheckpointSequenceNumber);
					deltaManager.off("op", callbackOps);
				}
			};
			deltaManager.on("op", callbackOps);
		};

		// We can leverage DeltaManager's "connect" event here and test for ConnectionState.Disconnected
		// But that works only if service provides us checkPointSequenceNumber
		// Our internal testing is based on R11S that does not, but almost all tests connect as "write" and
		// use this function to catch up, so leveraging our own join op as a fence/barrier
		if (container.connectionState === ConnectionState.Connected) {
			waitForOps();
			return;
		}

		const callback = (): void => {
			container.off(connectedEventName, callback);
			waitForOps();
		};
		container.on(connectedEventName, callback);

		if (container.connectionState === ConnectionState.Disconnected) {
			container.connect();
		}
	});
}

const getCodeProposal = (quorum: IQuorumProposals): unknown =>
	quorum.get("code") ?? quorum.get("code2");

/**
 * Helper function to report to telemetry cases where operation takes longer than expected (200ms)
 * @param logger - logger to use
 * @param eventName - event name
 * @param action - functor to call and measure
 */
export async function ReportIfTooLong(
	logger: ITelemetryLoggerExt,
	eventName: string,
	action: () => Promise<ITelemetryBaseProperties>,
): Promise<void> {
	const event = PerformanceEvent.start(logger, { eventName });
	const props = await action();
	if (event.duration > 200) {
		event.end(props);
	}
}

const summarizerClientType = "summarizer";

interface IContainerLifecycleEvents extends IEvent {
	(event: "runtimeInstantiated", listener: () => void): void;
	(event: "disposed", listener: () => void): void;
}

export class Container
	extends EventEmitterWithErrorHandling<IContainerEvents>
	implements IContainer, IContainerExperimental
{
	/**
	 * Load an existing container.
	 */
	public static async load(
		loadProps: IContainerLoadProps,
		createProps: IContainerCreateProps,
	): Promise<Container> {
		const { version, pendingLocalState, loadMode, resolvedUrl } = loadProps;

		const container = new Container(createProps, loadProps);

		return PerformanceEvent.timedExecAsync(
			container.mc.logger,
			{ eventName: "Load", ...loadMode },
			async (event) =>
				new Promise<Container>((resolve, reject) => {
					const defaultMode: IContainerLoadMode = { opsBeforeReturn: "cached" };
					// if we have pendingLocalState, anything we cached is not useful and we shouldn't wait for connection
					// to return container, so ignore this value and use undefined for opsBeforeReturn
					const mode: IContainerLoadMode = pendingLocalState
						? { ...(loadMode ?? defaultMode), opsBeforeReturn: undefined }
						: (loadMode ?? defaultMode);

					const onClosed = (err?: ICriticalContainerError): void => {
						// pre-0.58 error message: containerClosedWithoutErrorDuringLoad
						reject(err ?? new GenericError("Container closed without error during load"));
					};
					container.on("closed", onClosed);

					container
						.load(version, mode, resolvedUrl, pendingLocalState)
						.finally(() => {
							container.removeListener("closed", onClosed);
						})
						.then(
							(props) => {
								event.end({ ...props });
								resolve(container);
							},
							(error) => {
								const err = normalizeError(error);
								// Depending where error happens, we can be attempting to connect to web socket
								// and continuously retrying (consider offline mode)
								// Host has no container to close, so it's prudent to do it here
								// Note: We could only dispose the container instead of just close but that would
								// the telemetry where users sometimes search for ContainerClose event to look
								// for load failures. So not removing this at this time.
								container.close(err);
								container.dispose(err);
								onClosed(err);
							},
						);
				}),
			{ start: true, end: true, cancel: "generic" },
		);
	}

	/**
	 * Create a new container in a detached state.
	 */
	public static async createDetached(
		createProps: IContainerCreateProps,
		codeDetails: IFluidCodeDetails,
	): Promise<Container> {
		const container = new Container(createProps);

		return PerformanceEvent.timedExecAsync(
			container.mc.logger,
			{ eventName: "CreateDetached" },
			async (_event) => {
				await container.createDetached(codeDetails);
				return container;
			},
			{ start: true, end: true, cancel: "generic" },
		);
	}

	/**
	 * Create a new container in a detached state that is initialized with a
	 * snapshot from a previous detached container.
	 * @param createProps - Config options for this new container instance
	 * @param snapshot - A stringified {@link IPendingDetachedContainerState}, e.g. generated via {@link serialize}
	 */
	public static async rehydrateDetachedFromSnapshot(
		createProps: IContainerCreateProps,
		snapshot: string,
	): Promise<Container> {
		const container = new Container(createProps);

		return PerformanceEvent.timedExecAsync(
			container.mc.logger,
			{ eventName: "RehydrateDetachedFromSnapshot" },
			async (_event) => {
				const detachedContainerState: IPendingDetachedContainerState =
					getDetachedContainerStateFromSerializedContainer(snapshot);
				await container.rehydrateDetachedFromSnapshot(detachedContainerState);
				return container;
			},
			{ start: true, end: true, cancel: "generic" },
		);
	}

	// Tells if container can reconnect on losing fist connection
	// If false, container gets closed on loss of connection.
	private readonly _canReconnect: boolean;
	private readonly clientDetailsOverride: IClientDetails | undefined;
	private readonly urlResolver: IUrlResolver;
	private readonly serviceFactory: IDocumentServiceFactory;
	private readonly codeLoader: ICodeDetailsLoader;
	// eslint-disable-next-line import/no-deprecated
	private readonly options: ILoaderOptions;
	private readonly scope: FluidObject;
	private readonly subLogger: ITelemetryLoggerExt;
	// eslint-disable-next-line import/no-deprecated
	private readonly detachedBlobStorage: IDetachedBlobStorage | undefined;
	private readonly protocolHandlerBuilder: ProtocolHandlerBuilder;
	private readonly client: IClient;

	private readonly mc: MonitoringContext;

	/**
	 * Used by the RelativeLoader to spawn a new Container for the same document.  Used to create the summarizing client.
	 */
	public readonly clone: (
		loadProps: IContainerLoadProps,
		createParamOverrides: Partial<IContainerCreateProps>,
	) => Promise<Container>;

	/**
	 * Lifecycle state of the container, used mainly to prevent re-entrancy and telemetry
	 *
	 * States are allowed to progress to further states:
	 * "loading" - "loaded" - "closing" - "disposing" - "closed" - "disposed"
	 *
	 * For example, moving from "closed" to "disposing" is not allowed since it is an earlier state.
	 *
	 * loading: Container has been created, but is not yet in normal/loaded state
	 * loaded: Container is in normal/loaded state
	 * closing: Container has started closing process (for re-entrancy prevention)
	 * disposing: Container has started disposing process (for re-entrancy prevention)
	 * closed: Container has closed
	 * disposed: Container has been disposed
	 */
	private _lifecycleState:
		| "loading"
		| "loaded"
		| "closing"
		| "disposing"
		| "closed"
		| "disposed" = "loading";

	private setLoaded(): void {
		// It's conceivable the container could be closed when this is called
		// Only transition states if currently loading
		if (this._lifecycleState === "loading") {
			this._lifecycleState = "loaded";

			// Connections transitions are delayed till we are loaded.
			// This is done by holding ops and signals until the end of load sequence
			// (calling this.handleDeltaConnectionArg() after setLoaded() call)
			// If this assert fires, it means our logic managing connection flow is wrong, and the logic below is also wrong.
			assert(
				this.connectionState !== ConnectionState.Connected,
				0x969 /* not connected yet */,
			);

			// Track membership changes and update connection state accordingly
			// We do this call here, instead of doing it in initializeProtocolState() due to pendingLocalState.
			// When we load from stashed state, we let connectionStateHandler know about clientId from previous container instance.
			// But we will play trailing ops from snapshot, including potentially playing join & leave ops for that same clientId!
			// In other words, if connectionStateHandler has access to Quorum early in load sequence, it will see events (in stashed ops mode)
			// in the order that is not possible in real life, that it may not expect.
			// Ideally, we should supply pendingLocalState?.clientId here as well, not in constructor, but it does not matter (at least today)
			this.connectionStateHandler.initProtocol(this.protocolHandler);

			// Propagate current connection state through the system.
			const readonly = this.readOnlyInfo.readonly ?? false;
			// This call does not look like needed any more, with delaying all connection-related events past loaded phase.
			// Yet, there could be some customer code that would break if we do not deliver it.
			// Will be removed in further PRs with proper changeset.
			this.setContextConnectedState(false /* connected */, readonly);
			// Deliver delayed calls to DeltaManager - we ignored "connect" events while loading.
			const cm = this._deltaManager.connectionManager;
			if (cm.connected) {
				const details = cm.connectionDetails;
				assert(details !== undefined, 0x96a /* should have details if connected */);
				this.connectionStateHandler.receivedConnectEvent(details);
			}
		}
	}

	public get closed(): boolean {
		return (
			this._lifecycleState === "closing" || this._lifecycleState === "closed" || this.disposed
		);
	}

	protected get loaded(): boolean {
		return this._lifecycleState === "loaded";
	}

	public get disposed(): boolean {
		return this._lifecycleState === "disposing" || this._lifecycleState === "disposed";
	}

	/**
	 * The error that caused the container to close or dispose.
	 *
	 * @remarks If the container is closed and then disposed, both with errors given, this will expose the close error only.
	 */
	public get closedWithError(): ICriticalContainerError | undefined {
		return this._closedWithError;
	}
	private _closedWithError?: ICriticalContainerError;

	private readonly storageAdapter: ContainerStorageAdapter;

	private readonly _deltaManager: DeltaManager<ConnectionManager>;
	private service: IDocumentService | undefined;

	private _runtime: IRuntime | undefined;
	private get runtime(): IRuntime {
		if (this._runtime === undefined) {
			throw new Error("Attempted to access runtime before it was defined");
		}
		return this._runtime;
	}
	private _protocolHandler: IProtocolHandler | undefined;
	private get protocolHandler(): IProtocolHandler {
		if (this._protocolHandler === undefined) {
			throw new Error("Attempted to access protocolHandler before it was defined");
		}
		return this._protocolHandler;
	}

	/**
	 * During initialization we pause the inbound queues. We track this state to ensure we only call resume once
	 */
	private inboundQueuePausedFromInit = true;
	private connectionCount = 0;
	private readonly connectionTransitionTimes: number[] = [];
	private _loadedFromVersion: IVersion | undefined;
	private _dirtyContainer = false;
	private attachmentData: AttachmentData = { state: AttachState.Detached };
	private readonly serializedStateManager: SerializedStateManager;
	private readonly _containerId: string;

	private lastVisible: number | undefined;
	private readonly visibilityEventHandler: (() => void) | undefined;
	private readonly connectionStateHandler: IConnectionStateHandler;
	private readonly clientsWhoShouldHaveLeft = new Set<string>();
	private _containerMetadata: Readonly<Record<string, string>> = {};

	private setAutoReconnectTime = performance.now();

	private noopHeuristic: NoopHeuristic | undefined;

	private get connectionMode(): ConnectionMode {
		return this._deltaManager.connectionManager.connectionMode;
	}

	public get resolvedUrl(): IResolvedUrl | undefined {
		/**
		 * All attached containers will have a document service,
		 * this is required, as attached containers are attached to
		 * a service. Detached containers will neither have a document
		 * service or a resolved url as they only exist locally.
		 * in order to create a document service a resolved url must
		 * first be obtained, this is how the container is identified.
		 * Because of this, the document service's resolved url
		 * is always the same as the containers, as we had to
		 * obtain the resolved url, and then create the service from it.
		 */
		return this.service?.resolvedUrl;
	}

	public get readOnlyInfo(): ReadOnlyInfo {
		return this._deltaManager.readOnlyInfo;
	}

	public get containerMetadata(): Record<string, string> {
		return this._containerMetadata;
	}

	/**
	 * Sends signal to runtime (and data stores) to be read-only.
	 * Hosts may have read only views, indicating to data stores that no edits are allowed.
	 * This is independent from this._readonlyPermissions (permissions) and this.connectionMode
	 * (server can return "write" mode even when asked for "read")
	 * Leveraging same "readonly" event as runtime & data stores should behave the same in such case
	 * as in read-only permissions.
	 * But this.active can be used by some DDSes to figure out if ops can be sent
	 * (for example, read-only view still participates in code proposals / upgrades decisions)
	 *
	 * Forcing Readonly does not prevent DDS from generating ops. It is up to user code to honour
	 * the readonly flag. If ops are generated, they will accumulate locally and not be sent. If
	 * there are pending in the outbound queue, it will stop sending until force readonly is
	 * cleared.
	 *
	 * @param readonly - set or clear force readonly.
	 */
	public forceReadonly(readonly: boolean): void {
		this._deltaManager.connectionManager.forceReadonly(readonly);
	}

	public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
		return this._deltaManager;
	}

	public get connectionState(): ConnectionState {
		return this.connectionStateHandler.connectionState;
	}

	private get connected(): boolean {
		return this.connectionStateHandler.connectionState === ConnectionState.Connected;
	}

	/**
	 * clientId of the latest connection. Changes only once client is connected, caught up and fully loaded.
	 * Changes to clientId are delayed through container loading sequence and delived once container is fully loaded.
	 * clientId does not reset on lost connection - old value persists until new connection is fully established.
	 */
	public get clientId(): string | undefined {
		return this.protocolHandler.audience.getSelf()?.clientId;
	}

	private get isInteractiveClient(): boolean {
		return this.deltaManager.clientDetails.capabilities.interactive;
	}

	private supportGetSnapshotApi(): boolean {
		const supportGetSnapshotApi: boolean =
			this.mc.config.getBoolean("Fluid.Container.UseLoadingGroupIdForSnapshotFetch2") ===
				true && this.service?.policies?.supportGetSnapshotApi === true;
		return supportGetSnapshotApi;
	}

	/**
	 * Get the code details that are currently specified for the container.
	 * @returns The current code details if any are specified, undefined if none are specified.
	 */
	public getSpecifiedCodeDetails(): IFluidCodeDetails | undefined {
		return this.getCodeDetailsFromQuorum();
	}

	private _loadedCodeDetails: IFluidCodeDetails | undefined;
	/**
	 * Get the code details that were used to load the container.
	 * @returns The code details that were used to load the container if it is loaded, undefined if it is not yet
	 * loaded.
	 */
	public getLoadedCodeDetails(): IFluidCodeDetails | undefined {
		return this._loadedCodeDetails;
	}

	/**
	 * Get the package info for the code details that were used to load the container.
	 * @returns The package info for the code details that were used to load the container if it is loaded, undefined otherwise
	 */
	public getContainerPackageInfo?(): IContainerPackageInfo | undefined {
		return getPackageName(this._loadedCodeDetails);
	}

	private _loadedModule: IFluidModuleWithDetails | undefined;

	/**
	 * Retrieves the audience associated with the document
	 */
	public get audience(): IAudience {
		return this.protocolHandler.audience;
	}

	/**
	 * Returns true if container is dirty.
	 * Which means data loss if container is closed at that same moment
	 * Most likely that happens when there is no network connection to Relay Service
	 */
	public get isDirty(): boolean {
		return this._dirtyContainer;
	}

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.entryPoint}
	 */
	public async getEntryPoint(): Promise<FluidObject> {
		if (this._disposed) {
			throw new UsageError("The context is already disposed");
		}
		if (this._runtime !== undefined) {
			return this._runtime.getEntryPoint?.();
		}
		return new Promise<FluidObject>((resolve, reject) => {
			const runtimeInstantiatedHandler = (): void => {
				assert(
					this._runtime !== undefined,
					0x5a3 /* runtimeInstantiated fired but runtime is still undefined */,
				);
				resolve(this._runtime.getEntryPoint?.());
				this._lifecycleEvents.off("disposed", disposedHandler);
			};
			const disposedHandler = (): void => {
				reject(new Error("ContainerContext was disposed"));
				this._lifecycleEvents.off("runtimeInstantiated", runtimeInstantiatedHandler);
			};
			this._lifecycleEvents.once("runtimeInstantiated", runtimeInstantiatedHandler);
			this._lifecycleEvents.once("disposed", disposedHandler);
		});
	}

	private readonly _lifecycleEvents = new TypedEventEmitter<IContainerLifecycleEvents>();

	constructor(
		createProps: IContainerCreateProps,
		loadProps?: Pick<IContainerLoadProps, "pendingLocalState">,
	) {
		super((name, error) => {
			this.mc.logger.sendErrorEvent(
				{
					eventName: "ContainerEventHandlerException",
					name: typeof name === "string" ? name : undefined,
				},
				error,
			);
			this.close(normalizeError(error));
		});

		const {
			canReconnect,
			clientDetailsOverride,
			urlResolver,
			documentServiceFactory,
			codeLoader,
			options,
			scope,
			subLogger,
			detachedBlobStorage,
			protocolHandlerBuilder,
		} = createProps;

		this.connectionTransitionTimes[ConnectionState.Disconnected] = performance.now();
		const pendingLocalState = loadProps?.pendingLocalState;

		this._canReconnect = canReconnect ?? true;
		this.clientDetailsOverride = clientDetailsOverride;
		this.urlResolver = urlResolver;
		this.serviceFactory = documentServiceFactory;
		this.codeLoader = codeLoader;
		// Warning: this is only a shallow clone. Mutation of any individual loader option will mutate it for
		// all clients that were loaded from the same loader (including summarizer clients).
		// Tracking alternative ways to handle this in AB#4129.
		this.options = { ...options };
		this.scope = scope;
		this.protocolHandlerBuilder =
			protocolHandlerBuilder ??
			((
				attributes: IDocumentAttributes,
				quorumSnapshot: IQuorumSnapshot,
				sendProposal: (key: string, value: unknown) => number,
			): ProtocolHandler =>
				new ProtocolHandler(
					attributes,
					quorumSnapshot,
					sendProposal,
					new Audience(),
					(clientId: string) => this.clientsWhoShouldHaveLeft.has(clientId),
				));

		// Note that we capture the createProps here so we can replicate the creation call when we want to clone.
		this.clone = async (
			_loadProps: IContainerLoadProps,
			createParamOverrides: Partial<IContainerCreateProps>,
		): Promise<Container> => {
			return Container.load(_loadProps, {
				...createProps,
				...createParamOverrides,
			});
		};

		this._containerId = uuid();

		this.client = Container.setupClient(
			this._containerId,
			options.client,
			this.clientDetailsOverride,
		);

		// Create logger for data stores to use
		const type = this.client.details.type;
		const interactive = this.client.details.capabilities.interactive;
		const clientType = `${interactive ? "interactive" : "noninteractive"}${
			type !== undefined && type !== "" ? `/${type}` : ""
		}`;

		// Need to use the property getter for docId because for detached flow we don't have the docId initially.
		// We assign the id later so property getter is used.
		this.subLogger = createChildLogger({
			logger: subLogger,
			properties: {
				all: {
					clientType, // Differentiating summarizer container from main container
					containerId: this._containerId,
					docId: () => this.resolvedUrl?.id,
					containerAttachState: () => this.attachState,
					containerLifecycleState: () => this._lifecycleState,
					containerConnectionState: () => ConnectionState[this.connectionState],
					serializedContainer: pendingLocalState !== undefined,
				},
				// we need to be judicious with our logging here to avoid generating too much data
				// all data logged here should be broadly applicable, and not specific to a
				// specific error or class of errors
				error: {
					// load information to associate errors with the specific load point
					dmInitialSeqNumber: () => this._deltaManager?.initialSequenceNumber,
					dmLastProcessedSeqNumber: () => this._deltaManager?.lastSequenceNumber,
					dmLastKnownSeqNumber: () => this._deltaManager?.lastKnownSeqNumber,
					containerLoadedFromVersionId: () => this._loadedFromVersion?.id,
					containerLoadedFromVersionDate: () => this._loadedFromVersion?.date,
					// message information to associate errors with the specific execution state
					// dmLastMsqSeqNumber: if present, same as dmLastProcessedSeqNumber
					dmLastMsqSeqNumber: () => this.deltaManager?.lastMessage?.sequenceNumber,
					dmLastMsqSeqTimestamp: () => this.deltaManager?.lastMessage?.timestamp,
					dmLastMsqSeqClientId: () =>
						this.deltaManager?.lastMessage?.clientId === null
							? "null"
							: this.deltaManager?.lastMessage?.clientId,
					dmLastMsgClientSeq: () => this.deltaManager?.lastMessage?.clientSequenceNumber,
					connectionStateDuration: () =>
						performance.now() - this.connectionTransitionTimes[this.connectionState],
				},
			},
		});

		// Prefix all events in this file with container-loader
		this.mc = createChildMonitoringContext({ logger: this.subLogger, namespace: "Container" });

		this._deltaManager = this.createDeltaManager();

		this.connectionStateHandler = createConnectionStateHandler(
			{
				logger: this.mc.logger,
				// WARNING: logger on this context should not including getters like containerConnectionState above (on this.subLogger),
				// as that will result in attempt to dereference this.connectionStateHandler from this call while it's still undefined.
				mc: loggerToMonitoringContext(subLogger),
				connectionStateChanged: (value, oldState, reason) => {
					this.logConnectionStateChangeTelemetry(value, oldState, reason);
					if (this.loaded) {
						this.propagateConnectionState(
							value === ConnectionState.Disconnected
								? reason
								: undefined /* disconnectedReason */,
						);
					}
				},
				shouldClientJoinWrite: () => this._deltaManager.connectionManager.shouldJoinWrite(),
				maxClientLeaveWaitTime: options.maxClientLeaveWaitTime,
				logConnectionIssue: (
					eventName: string,
					category: TelemetryEventCategory,
					details?: ITelemetryBaseProperties,
				) => {
					const mode = this.connectionMode;
					// We get here when socket does not receive any ops on "write" connection, including
					// its own join op.
					// Report issues only if we already loaded container - op processing is paused while container is loading,
					// so we always time-out processing of join op in cases where fetching snapshot takes a minute.
					// It's not a problem with op processing itself - such issues should be tracked as part of boot perf monitoring instead.
					this._deltaManager.logConnectionIssue({
						eventName,
						mode,
						category: this._lifecycleState === "loading" ? "generic" : category,
						duration:
							performance.now() - this.connectionTransitionTimes[ConnectionState.CatchingUp],
						...(details === undefined ? {} : { details: JSON.stringify(details) }),
					});

					// This assert is important for many reasons:
					// 1) Cosmetic / OCE burden: It's useless to raise NoJoinOp error events, if we are loading, as that's most
					//    likely to happen if snapshot loading takes too long. During this time we are not processing ops so there is no
					//    way to move to "connected" state, and thus "NoJoin" timer would fire (see
					//    IConnectionStateHandler.logConnectionIssue() callback and related code in ConnectStateHandler class implementation).
					//    But these events do not tell us anything about connectivity pipeline / op processing pipeline,
					//    only that boot is slow, and we have events for that.
					// 2) Doing recovery below is useless in loading mode, for the reasons described above. At the same time we can't
					//    not do it, as maybe we lost JoinSignal for "self", and when loading is done, we never move to connected
					//    state. So we would have to do (in most cases) useless infinite reconnect loop while we are loading.
					assert(
						this.loaded,
						0x96b /* connection issues can be raised only after container is loaded */,
					);

					// If this is "write" connection, it took too long to receive join op. But in most cases that's due
					// to very slow op fetches and we will eventually get there.
					// For "read" connections, we get here due to join signal for "self" not arriving on time.
					// Attempt to recover by reconnecting.
					if (mode === "read" && category === "error") {
						const reason = { text: "NoJoinSignal" };
						this.disconnectInternal(reason);
						this.connectInternal({ reason, fetchOpsFromStorage: false });
					}
				},
				clientShouldHaveLeft: (clientId: string) => {
					this.clientsWhoShouldHaveLeft.add(clientId);
				},
				onCriticalError: (error: unknown) => {
					this.close(normalizeError(error));
				},
			},
			this.deltaManager,
			pendingLocalState?.clientId,
		);

		this.on(savedContainerEvent, () => {
			this.connectionStateHandler.containerSaved();
		});

		// We expose our storage publicly, so it's possible others may call uploadSummaryWithContext() with a
		// non-combined summary tree (in particular, ContainerRuntime.submitSummary).  We'll intercept those calls
		// using this callback and fix them up.
		const addProtocolSummaryIfMissing = (
			summaryTree: ISummaryTree,
		): CombinedAppAndProtocolSummary =>
			isCombinedAppAndProtocolSummary(summaryTree) === true
				? summaryTree
				: combineAppAndProtocolSummary(summaryTree, this.captureProtocolSummary());

		// Whether the combined summary tree has been forced on by either the supportedFeatures flag by the service or the the loader option or the monitoring context
		const enableSummarizeProtocolTree =
			this.mc.config.getBoolean("Fluid.Container.summarizeProtocolTree2") ??
			options.summarizeProtocolTree;

		this.detachedBlobStorage =
			detachedBlobStorage ??
			(this.mc.config.getBoolean("Fluid.Container.MemoryBlobStorageEnabled") === true
				? createMemoryDetachedBlobStorage()
				: undefined);

		this.storageAdapter = new ContainerStorageAdapter(
			this.detachedBlobStorage,
			this.mc.logger,
			pendingLocalState?.snapshotBlobs,
			pendingLocalState?.loadedGroupIdSnapshots,
			addProtocolSummaryIfMissing,
			enableSummarizeProtocolTree,
		);

		const offlineLoadEnabled =
			(this.isInteractiveClient &&
				this.mc.config.getBoolean("Fluid.Container.enableOfflineLoad")) ??
			options.enableOfflineLoad === true;
		this.serializedStateManager = new SerializedStateManager(
			pendingLocalState,
			this.subLogger,
			this.storageAdapter,
			offlineLoadEnabled,
			this,
			() => this._deltaManager.connectionManager.shouldJoinWrite(),
			() => this.supportGetSnapshotApi(),
			this.mc.config.getNumber("Fluid.Container.snapshotRefreshTimeoutMs"),
		);

		const isDomAvailable =
			typeof document === "object" &&
			document !== null &&
			typeof document.addEventListener === "function" &&
			document.addEventListener !== null;
		// keep track of last time page was visible for telemetry (on interactive clients only)
		if (isDomAvailable && interactive) {
			this.lastVisible = document.hidden ? performance.now() : undefined;
			this.visibilityEventHandler = (): void => {
				if (document.hidden) {
					this.lastVisible = performance.now();
				} else {
					// settimeout so this will hopefully fire after disconnect event if being hidden caused it
					setTimeout(() => {
						this.lastVisible = undefined;
					}, 0);
				}
			};
			document.addEventListener("visibilitychange", this.visibilityEventHandler);
		}
	}

	/**
	 * Retrieves the quorum associated with the document
	 */
	public getQuorum(): IQuorumClients {
		return this.protocolHandler.quorum;
	}

	public dispose(error?: ICriticalContainerError): void {
		this.verifyClosedAfter(() => this._deltaManager.dispose(error));
	}

	public close(error?: ICriticalContainerError): void {
		// 1. Ensure that close sequence is exactly the same no matter if it's initiated by host or by DeltaManager
		// 2. We need to ensure that we deliver disconnect event to runtime properly. See connectionStateChanged
		//    handler. We only deliver events if container fully loaded. Transitioning from "loading" ->
		//    "closing" will lose that info (can also solve by tracking extra state).
		this.verifyClosedAfter(() => this._deltaManager.close(error));
	}

	private verifyClosedAfterCalls = 0;
	private verifyClosedAfter(callback: () => void): void {
		this.verifyClosedAfterCalls++;
		try {
			callback();
		} finally {
			this.verifyClosedAfterCalls--;
		}

		// We only want to verify connectionState and lifecycleState after close/dispose has fully finished
		if (this.verifyClosedAfterCalls === 0) {
			assert(
				this.connectionState === ConnectionState.Disconnected,
				0x0cf /* "disconnect event was not raised!" */,
			);

			assert(
				this._lifecycleState === "closed" || this._lifecycleState === "disposed",
				0x314 /* Container properly closed */,
			);
		}
	}

	private closeCore(error?: ICriticalContainerError): void {
		assert(!this.closed, 0x315 /* re-entrancy */);

		try {
			// Ensure that we raise all key events even if one of these throws
			try {
				// Raise event first, to ensure we capture _lifecycleState before transition.
				// This gives us a chance to know what errors happened on open vs. on fully loaded container.
				// Log generic events instead of error events if container is in loading state, as most errors are not really FF errors
				// which can pollute telemetry for real bugs
				this.mc.logger.sendTelemetryEvent(
					{
						eventName: "ContainerClose",
						category:
							this._lifecycleState !== "loading" && error !== undefined ? "error" : "generic",
					},
					error,
				);

				this._lifecycleState = "closing";
				this._closedWithError = error;

				// Back-compat for Old driver
				if (this.service?.off !== undefined) {
					this.service?.off("metadataUpdate", this.metadataUpdateHandler);
				}

				this._protocolHandler?.close();

				this.connectionStateHandler.dispose();
			} catch (newError) {
				this.mc.logger.sendErrorEvent({ eventName: "ContainerCloseException" }, newError);
			}

			this.emit("closed", error);

			if (this.visibilityEventHandler !== undefined) {
				document.removeEventListener("visibilitychange", this.visibilityEventHandler);
			}
		} finally {
			this._lifecycleState = "closed";

			// There is no user for summarizer, so we need to ensure dispose is called
			if (this.client.details.type === summarizerClientType) {
				this.dispose(error);
			}
		}
	}

	private _disposed = false;
	private disposeCore(error?: ICriticalContainerError): void {
		assert(!this._disposed, 0x54c /* Container already disposed */);
		this._disposed = true;

		try {
			// Ensure that we raise all key events even if one of these throws
			try {
				// Raise event first, to ensure we capture _lifecycleState before transition.
				// This gives us a chance to know what errors happened on open vs. on fully loaded container.
				this.mc.logger.sendTelemetryEvent(
					{
						eventName: "ContainerDispose",
						// Use error category if there's an error, unless we already closed with an error (i.e. _closedWithError is set)
						category:
							error !== undefined && this._closedWithError === undefined ? "error" : "generic",
					},
					error,
				);

				// ! Progressing from "closed" to "disposing" is not allowed
				if (this._lifecycleState !== "closed") {
					this._lifecycleState = "disposing";
				}

				// Corner cases that are expressed imprecisely here:
				// When disposing with an error after the Container is already closed...
				// - if we closed with an error, _closedWithError doesn't expose the dispose error.
				// - if we closed without an error, _closedWithError doesn't distinguish whether this error came from close or dispose.
				this._closedWithError ??= error;

				this._protocolHandler?.close();

				this.connectionStateHandler.dispose();

				const maybeError = error === undefined ? undefined : new Error(error.message);
				this._runtime?.dispose(maybeError);

				this.storageAdapter.dispose();

				// Notify storage about critical errors. They may be due to disconnect between client & server knowledge
				// about file, like file being overwritten in storage, but client having stale local cache.
				// Driver need to ensure all caches are cleared on critical errors
				this.service?.dispose(error);
			} catch (error_) {
				this.mc.logger.sendErrorEvent({ eventName: "ContainerDisposeException" }, error_);
			}

			this.emit("disposed", error);

			this.removeAllListeners();
			if (this.visibilityEventHandler !== undefined) {
				document.removeEventListener("visibilitychange", this.visibilityEventHandler);
			}
		} finally {
			this._lifecycleState = "disposed";
			this._lifecycleEvents.emit("disposed");
		}
	}

	public async closeAndGetPendingLocalState(
		stopBlobAttachingSignal?: AbortSignal,
	): Promise<string> {
		// runtime matches pending ops to successful ones by clientId and client seq num, so we need to close the
		// container at the same time we get pending state, otherwise this container could reconnect and resubmit with
		// a new clientId and a future container using stale pending state without the new clientId would resubmit them
		const pendingState = await this.getPendingLocalStateCore({
			notifyImminentClosure: true,
			stopBlobAttachingSignal,
		});
		this.close();
		return pendingState;
	}

	/**
	 * Serialize current container state required to rehydrate to the same position without dataloss.
	 * Note: The container must already be attached. For detached containers use {@link serialize}
	 * @returns stringified {@link IPendingContainerState} for the container
	 */
	public async getPendingLocalState(): Promise<string> {
		return this.getPendingLocalStateCore({ notifyImminentClosure: false });
	}

	private async getPendingLocalStateCore(props: IGetPendingLocalStateProps): Promise<string> {
		if (this.closed || this._disposed) {
			throw new UsageError(
				"Pending state cannot be retried if the container is closed or disposed",
			);
		}
		assert(
			this.attachmentData.state === AttachState.Attached,
			0x0d1 /* "Container should be attached before close" */,
		);
		assert(
			this.resolvedUrl !== undefined && this.resolvedUrl.type === "fluid",
			0x0d2 /* "resolved url should be valid Fluid url" */,
		);
		const pendingState = await this.serializedStateManager.getPendingLocalState(
			props,
			this.clientId,
			this.runtime,
			this.resolvedUrl,
		);
		return pendingState;
	}

	public get attachState(): AttachState {
		return this.attachmentData.state;
	}

	/**
	 * Serialize current container state required to rehydrate to the same position without dataloss.
	 * Note: The container must be detached and not closed. For attached containers use
	 * {@link getPendingLocalState} or {@link closeAndGetPendingLocalState}
	 * @returns stringified {@link IPendingDetachedContainerState} for the container
	 */
	public serialize(): string {
		if (this.attachmentData.state === AttachState.Attached || this.closed) {
			throw new UsageError("Container must not be attached or closed.");
		}

		const attachingData =
			this.attachmentData.state === AttachState.Attaching ? this.attachmentData : undefined;

		const combinedSummary =
			attachingData?.summary ??
			combineAppAndProtocolSummary(
				this.runtime.createSummary(),
				this.captureProtocolSummary(),
			);

		const { baseSnapshot, snapshotBlobs } =
			getSnapshotTreeAndBlobsFromSerializedContainer(combinedSummary);
		const pendingRuntimeState =
			attachingData === undefined ? undefined : this.runtime.getPendingLocalState();
		assert(!isPromiseLike(pendingRuntimeState), 0x8e3 /* should not be a promise */);

		const detachedContainerState: IPendingDetachedContainerState = {
			attached: false,
			baseSnapshot,
			snapshotBlobs,
			pendingRuntimeState,
			hasAttachmentBlobs:
				this.detachedBlobStorage !== undefined && this.detachedBlobStorage.size > 0,
			attachmentBlobs: serializeMemoryDetachedBlobStorage(this.detachedBlobStorage),
		};
		return JSON.stringify(detachedContainerState);
	}

	public readonly attach = runSingle(
		async (
			request: IRequest,
			attachProps?: { deltaConnection?: "none" | "delayed" },
		): Promise<void> => {
			await PerformanceEvent.timedExecAsync(
				this.mc.logger,
				{ eventName: "Attach" },
				async () => {
					if (
						this._lifecycleState !== "loaded" ||
						this.attachmentData.state === AttachState.Attached
					) {
						// pre-0.58 error message: containerNotValidForAttach
						throw new UsageError(
							`The Container is not in a valid state for attach [${this._lifecycleState}] and [${this.attachState}]`,
						);
					}

					const normalizeErrorAndClose = (error: unknown): IFluidErrorBase => {
						const newError = normalizeError(error);
						this.close(newError);
						// add resolved URL on error object so that host has the ability to find this document and delete it
						newError.addTelemetryProperties({
							resolvedUrl: this.service?.resolvedUrl?.url,
						});
						return newError;
					};

					const setAttachmentData: AttachProcessProps["setAttachmentData"] = (
						attachmentData,
					) => {
						const previousState = this.attachmentData.state;
						this.attachmentData = attachmentData;
						const state = this.attachmentData.state;
						if (state !== previousState && state !== AttachState.Detached) {
							try {
								this.runtime.setAttachState(state);
								this.emit(state.toLocaleLowerCase());
							} catch (error) {
								throw normalizeErrorAndClose(error);
							}
						}
					};

					const createAttachmentSummary: AttachProcessProps["createAttachmentSummary"] = (
						redirectTable?: Map<string, string>,
					) => {
						try {
							assert(
								this._deltaManager.inbound.length === 0,
								0x0d6 /* "Inbound queue should be empty when attaching" */,
							);
							return combineAppAndProtocolSummary(
								this.runtime.createSummary(redirectTable),
								this.captureProtocolSummary(),
							);
						} catch (error) {
							throw normalizeErrorAndClose(error);
						}
					};

					const createOrGetStorageService: AttachProcessProps["createOrGetStorageService"] =
						async (summary) => {
							// Actually go and create the resolved document
							if (this.service === undefined) {
								const createNewResolvedUrl = await this.urlResolver.resolve(request);
								assert(
									this.client.details.type !== summarizerClientType &&
										createNewResolvedUrl !== undefined,
									0x2c4 /* "client should not be summarizer before container is created" */,
								);
								this.service = await runWithRetry(
									async () =>
										this.serviceFactory.createContainer(
											summary,
											createNewResolvedUrl,
											this.subLogger,
											false, // clientIsSummarizer
										),
									"containerAttach",
									this.mc.logger,
									{
										cancel: this._deltaManager.closeAbortController.signal,
									}, // progress
								);
							}
							this.storageAdapter.connectToService(this.service);
							return this.storageAdapter;
						};

					let attachP = runRetriableAttachProcess({
						initialAttachmentData: this.attachmentData,
						offlineLoadEnabled: this.serializedStateManager.offlineLoadEnabled,
						detachedBlobStorage: this.detachedBlobStorage,
						setAttachmentData,
						createAttachmentSummary,
						createOrGetStorageService,
					});

					// only enable the new behavior if the config is set
					if (this.mc.config.getBoolean("Fluid.Container.RetryOnAttachFailure") !== true) {
						attachP = attachP.catch((error) => {
							throw normalizeErrorAndClose(error);
						});
					}

					// If offline load is enabled, attachP will return the attach summary (in Snapshot format) so we can initialize SerializedStateManager
					const snapshotWithBlobs = await attachP;
					this.serializedStateManager.setInitialSnapshot(snapshotWithBlobs);
					if (!this.closed) {
						this.detachedBlobStorage?.dispose?.();
						this.handleDeltaConnectionArg(attachProps?.deltaConnection, {
							fetchOpsFromStorage: false,
							reason: { text: "createDetached" },
						});
					}
				},
				{ start: true, end: true, cancel: "generic" },
			);
		},
	);

	private setAutoReconnectInternal(
		mode: ReconnectMode,
		reason: IConnectionStateChangeReason,
	): void {
		const currentMode = this._deltaManager.connectionManager.reconnectMode;

		if (currentMode === mode) {
			return;
		}

		const now = performance.now();
		const duration = now - this.setAutoReconnectTime;
		this.setAutoReconnectTime = now;

		this.mc.logger.sendTelemetryEvent({
			eventName:
				mode === ReconnectMode.Enabled ? "AutoReconnectEnabled" : "AutoReconnectDisabled",
			connectionMode: this.connectionMode,
			connectionState: ConnectionState[this.connectionState],
			duration,
		});

		this._deltaManager.connectionManager.setAutoReconnect(mode, reason);
	}

	public connect(): void {
		if (this.closed) {
			throw new UsageError(`The Container is closed and cannot be connected`);
		} else if (this.attachState !== AttachState.Attached) {
			throw new UsageError(`The Container is not attached and cannot be connected`);
		} else if (!this.connected) {
			// Note: no need to fetch ops as we do it preemptively as part of DeltaManager.attachOpHandler().
			// If there is gap, we will learn about it once connected, but the gap should be small (if any),
			// assuming that connect() is called quickly after initial container boot.
			this.connectInternal({
				reason: { text: "DocumentConnect" },
				fetchOpsFromStorage: false,
			});
		}
	}

	private connectInternal(args: IConnectionArgs): void {
		assert(!this.closed, 0x2c5 /* "Attempting to connect() a closed Container" */);
		assert(
			this.attachState === AttachState.Attached,
			0x2c6 /* "Attempting to connect() a container that is not attached" */,
		);

		// Set Auto Reconnect Mode
		const mode = ReconnectMode.Enabled;
		this.setAutoReconnectInternal(mode, args.reason);

		// Resume processing ops and connect to delta stream
		this.resumeInternal(args);
	}

	public disconnect(): void {
		if (this.closed) {
			throw new UsageError(`The Container is closed and cannot be disconnected`);
		} else {
			this.disconnectInternal({ text: "DocumentDisconnect" });
		}
	}

	private disconnectInternal(reason: IConnectionStateChangeReason): void {
		assert(!this.closed, 0x2c7 /* "Attempting to disconnect() a closed Container" */);

		// Set Auto Reconnect Mode
		const mode = ReconnectMode.Disabled;
		this.setAutoReconnectInternal(mode, reason);
	}

	private resumeInternal(args: IConnectionArgs): void {
		assert(!this.closed, 0x0d9 /* "Attempting to connect() a closed DeltaManager" */);

		// Resume processing ops
		if (this.inboundQueuePausedFromInit) {
			// This assert guards against possibility of ops/signals showing up too soon, while
			// container is not ready yet to receive them. We can hit it only if some internal code call into here,
			// as public API like Container.connect() can be only called when user got back container object, i.e.
			// it is already fully loaded.
			assert(this.loaded, 0x96c /* connect() can be called only in fully loaded state */);

			this.inboundQueuePausedFromInit = false;
			this._deltaManager.inbound.resume();
			this._deltaManager.inboundSignal.resume();
		}

		// Ensure connection to web socket
		this.connectToDeltaStream(args);
	}

	public readonly getAbsoluteUrl = async (
		relativeUrl: string,
	): Promise<string | undefined> => {
		if (this.resolvedUrl === undefined) {
			return undefined;
		}

		return this.urlResolver.getAbsoluteUrl(
			this.resolvedUrl,
			relativeUrl,
			getPackageName(this._loadedCodeDetails),
		);
	};

	public async proposeCodeDetails(codeDetails: IFluidCodeDetails): Promise<boolean> {
		if (!isFluidCodeDetails(codeDetails)) {
			throw new Error("Provided codeDetails are not IFluidCodeDetails");
		}

		if (this.codeLoader.IFluidCodeDetailsComparer) {
			const comparison = await this.codeLoader.IFluidCodeDetailsComparer.compare(
				codeDetails,
				this.getCodeDetailsFromQuorum(),
			);
			if (comparison !== undefined && comparison <= 0) {
				throw new Error("Proposed code details should be greater than the current");
			}
		}

		return this.protocolHandler.quorum
			.propose("code", codeDetails)
			.then(() => true)
			.catch(() => false);
	}

	private async processCodeProposal(): Promise<void> {
		const codeDetails = this.getCodeDetailsFromQuorum();

		await Promise.all([
			this._deltaManager.inbound.pause(),
			this._deltaManager.inboundSignal.pause(),
		]);

		if ((await this.satisfies(codeDetails)) === true) {
			this._deltaManager.inbound.resume();
			this._deltaManager.inboundSignal.resume();
			return;
		}

		// pre-0.58 error message: existingContextDoesNotSatisfyIncomingProposal
		const error = new GenericError("Existing context does not satisfy incoming proposal");
		this.close(error);
	}

	/**
	 * Determines if the currently loaded module satisfies the incoming constraint code details
	 */
	private async satisfies(constraintCodeDetails: IFluidCodeDetails): Promise<boolean> {
		// If we have no module, it can't satisfy anything.
		if (this._loadedModule === undefined) {
			return false;
		}

		const comparers: IFluidCodeDetailsComparer[] = [];

		const maybeCompareCodeLoader = this.codeLoader;
		if (maybeCompareCodeLoader.IFluidCodeDetailsComparer !== undefined) {
			comparers.push(maybeCompareCodeLoader.IFluidCodeDetailsComparer);
		}

		const maybeCompareExport: Partial<IProvideFluidCodeDetailsComparer> | undefined =
			this._loadedModule?.module.fluidExport;
		if (maybeCompareExport?.IFluidCodeDetailsComparer !== undefined) {
			comparers.push(maybeCompareExport.IFluidCodeDetailsComparer);
		}

		// If there are no comparers, then it's impossible to know if the currently loaded package satisfies
		// the incoming constraint, so we return false. Assuming it does not satisfy is safer, to force a reload
		// rather than potentially running with incompatible code.
		if (comparers.length === 0) {
			return false;
		}

		for (const comparer of comparers) {
			const satisfies = await comparer.satisfies(
				this._loadedModule?.details,
				constraintCodeDetails,
			);
			if (satisfies === false) {
				return false;
			}
		}
		return true;
	}

	private connectToDeltaStream(args: IConnectionArgs): void {
		// All agents need "write" access, including summarizer.
		if (!this._canReconnect || !this.client.details.capabilities.interactive) {
			args.mode = "write";
		}

		this._deltaManager.connect(args);
	}

	private readonly metadataUpdateHandler = (metadata: Record<string, string>): void => {
		this._containerMetadata = { ...this._containerMetadata, ...metadata };
		this.emit("metadataUpdate", metadata);
	};

	private async createDocumentService(
		serviceProvider: () => Promise<IDocumentService>,
	): Promise<IDocumentService> {
		const service = await serviceProvider();
		// Back-compat for Old driver
		if (service.on !== undefined) {
			service.on("metadataUpdate", this.metadataUpdateHandler);
		}
		return service;
	}

	/**
	 * Load container.
	 *
	 * @param specifiedVersion - Version SHA to load snapshot. If not specified, will fetch the latest snapshot.
	 */
	private async load(
		specifiedVersion: string | undefined,
		loadMode: IContainerLoadMode,
		resolvedUrl: IResolvedUrl,
		pendingLocalState: IPendingContainerState | undefined,
	): Promise<{
		sequenceNumber: number;
		version: string | undefined;
		dmLastProcessedSeqNumber: number;
		dmLastKnownSeqNumber: number;
	}> {
		const timings: Record<string, number> = { phase1: performance.now() };
		this.service = await this.createDocumentService(async () =>
			this.serviceFactory.createDocumentService(
				resolvedUrl,
				this.subLogger,
				this.client.details.type === summarizerClientType,
			),
		);

		// Except in cases where it has stashed ops or requested by feature gate, the container will connect in "read" mode
		const mode =
			this.mc.config.getBoolean("Fluid.Container.ForceWriteConnection") === true ||
			(pendingLocalState?.savedOps.length ?? 0) > 0
				? "write"
				: "read";
		const connectionArgs: IConnectionArgs = {
			reason: { text: "DocumentOpen" },
			mode,
			fetchOpsFromStorage: false,
		};

		// Start websocket connection as soon as possible. Note that there is no op handler attached yet, but the
		// DeltaManager is resilient to this and will wait to start processing ops until after it is attached.
		if (loadMode.deltaConnection === undefined) {
			this.connectToDeltaStream(connectionArgs);
		}

		this.storageAdapter.connectToService(this.service);

		this.attachmentData = {
			state: AttachState.Attached,
		};

		timings.phase2 = performance.now();

		// Fetch specified snapshot.
		const { baseSnapshot, version } =
			await this.serializedStateManager.fetchSnapshot(specifiedVersion);
		const baseSnapshotTree: ISnapshotTree | undefined = getSnapshotTree(baseSnapshot);
		this._loadedFromVersion = version;
		const attributes: IDocumentAttributes = await getDocumentAttributes(
			this.storageAdapter,
			baseSnapshotTree,
		);

		// If we saved ops, we will replay them and don't need DeltaManager to fetch them
		const lastProcessedSequenceNumber =
			pendingLocalState?.savedOps[pendingLocalState.savedOps.length - 1]?.sequenceNumber ??
			attributes.sequenceNumber;
		let opsBeforeReturnP: Promise<void> | undefined;

		// Attach op handlers to finish initialization and be able to start processing ops
		// Kick off any ops fetching if required.
		switch (loadMode.opsBeforeReturn) {
			case undefined: {
				// Start prefetch, but not set opsBeforeReturnP - boot is not blocked by it!
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this.attachDeltaManagerOpHandler(
					attributes,
					loadMode.deltaConnection === "none" ? "none" : "all",
					lastProcessedSequenceNumber,
				);
				break;
			}
			case "cached":
			case "all": {
				opsBeforeReturnP = this.attachDeltaManagerOpHandler(
					attributes,
					loadMode.opsBeforeReturn,
					lastProcessedSequenceNumber,
				);
				break;
			}
			default: {
				unreachableCase(loadMode.opsBeforeReturn);
			}
		}

		// ...load in the existing quorum
		// Initialize the protocol handler
		await this.initializeProtocolStateFromSnapshot(
			attributes,
			this.storageAdapter,
			baseSnapshotTree,
		);

		// If we are loading from pending state, we start with old clientId.
		// We switch to latest connection clientId only after setLoaded().
		assert(this.clientId === undefined, 0x96d /* there should be no clientId yet */);
		if (pendingLocalState?.clientId !== undefined) {
			this.protocolHandler.audience.setCurrentClientId(pendingLocalState?.clientId);
		}

		timings.phase3 = performance.now();
		const codeDetails = this.getCodeDetailsFromQuorum();
		await this.instantiateRuntime(
			codeDetails,
			baseSnapshotTree,
			// give runtime a dummy value so it knows we're loading from a stash blob
			pendingLocalState ? (pendingLocalState?.pendingRuntimeState ?? {}) : undefined,
			isInstanceOfISnapshot(baseSnapshot) ? baseSnapshot : undefined,
		);

		// replay saved ops
		if (pendingLocalState) {
			for (const message of pendingLocalState.savedOps) {
				this.processRemoteMessage({
					...message,
					metadata: { ...(message.metadata as Record<string, unknown>), savedOp: true },
				});

				// allow runtime to apply stashed ops at this op's sequence number
				await this.runtime.notifyOpReplay?.(message);
			}
			pendingLocalState.savedOps = [];
			this.storageAdapter.clearPendingState();
		}

		// We might have hit some failure that did not manifest itself in exception in this flow,
		// do not start op processing in such case - static version of Container.load() will handle it correctly.
		if (!this.closed) {
			if (opsBeforeReturnP !== undefined) {
				this._deltaManager.inbound.resume();

				await PerformanceEvent.timedExecAsync(
					this.mc.logger,
					{ eventName: "WaitOps" },
					async () => opsBeforeReturnP,
				);
				await PerformanceEvent.timedExecAsync(
					this.mc.logger,
					{ eventName: "WaitOpProcessing" },
					async () => this._deltaManager.inbound.waitTillProcessingDone(),
				);

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this._deltaManager.inbound.pause();
			}

			// Internal context is fully loaded at this point
			// Move to loaded before calling this.handleDeltaConnectionArg() - latter allows ops & signals in, which
			// may result in container moving to "connected" state. Such transitions are allowed only in loaded state.
			this.setLoaded();

			this.handleDeltaConnectionArg(loadMode.deltaConnection);
		}

		// Safety net: static version of Container.load() should have learned about it through "closed" handler.
		// But if that did not happen for some reason, fail load for sure.
		// Otherwise we can get into situations where container is closed and does not try to connect to ordering
		// service, but caller does not know that (callers do expect container to be not closed on successful path
		// and listen only on "closed" event)
		if (this.closed) {
			throw new Error("Container was closed while load()");
		}

		timings.end = performance.now();
		this.subLogger.sendTelemetryEvent(
			{
				eventName: "LoadStagesTimings",
				details: JSON.stringify(timings),
			},
			undefined,
			LogLevel.verbose,
		);
		return {
			sequenceNumber: attributes.sequenceNumber,
			version: version?.id,
			dmLastProcessedSeqNumber: this._deltaManager.lastSequenceNumber,
			dmLastKnownSeqNumber: this._deltaManager.lastKnownSeqNumber,
		};
	}

	private async createDetached(codeDetails: IFluidCodeDetails): Promise<void> {
		const attributes: IDocumentAttributes = {
			sequenceNumber: detachedContainerRefSeqNumber,
			minimumSequenceNumber: 0,
		};

		await this.attachDeltaManagerOpHandler(attributes);

		// Need to just seed the source data in the code quorum. Quorum itself is empty
		const qValues = initQuorumValuesFromCodeDetails(codeDetails);
		this.initializeProtocolState(
			attributes,
			{
				members: [],
				proposals: [],
				values: qValues,
			}, // IQuorumSnapShot
		);

		await this.instantiateRuntime(codeDetails, undefined);

		this.setLoaded();
	}

	private async rehydrateDetachedFromSnapshot({
		baseSnapshot,
		snapshotBlobs,
		hasAttachmentBlobs,
		attachmentBlobs,
		pendingRuntimeState,
	}: IPendingDetachedContainerState): Promise<void> {
		if (hasAttachmentBlobs) {
			if (attachmentBlobs !== undefined) {
				tryInitializeMemoryDetachedBlobStorage(this.detachedBlobStorage, attachmentBlobs);
			}
			assert(
				this.detachedBlobStorage !== undefined && this.detachedBlobStorage.size > 0,
				0x250 /* "serialized container with attachment blobs must be rehydrated with detached blob storage" */,
			);
		}
		const snapshotTreeWithBlobContents: ISnapshotTreeWithBlobContents =
			combineSnapshotTreeAndSnapshotBlobs(baseSnapshot, snapshotBlobs);
		this.storageAdapter.loadSnapshotFromSnapshotBlobs(snapshotBlobs);
		const attributes = await getDocumentAttributes(
			this.storageAdapter,
			snapshotTreeWithBlobContents,
		);

		await this.attachDeltaManagerOpHandler(attributes);

		// Initialize the protocol handler
		const baseTree = getProtocolSnapshotTree(snapshotTreeWithBlobContents);
		const qValues = await readAndParse<[string, ICommittedProposal][]>(
			this.storageAdapter,
			baseTree.blobs.quorumValues,
		);
		this.initializeProtocolState(
			attributes,
			{
				members: [],
				proposals: [],
				values: qValues,
			}, // IQuorumSnapShot
		);
		const codeDetails = this.getCodeDetailsFromQuorum();

		await this.instantiateRuntime(
			codeDetails,
			snapshotTreeWithBlobContents,
			pendingRuntimeState,
		);

		this.setLoaded();
	}

	private async initializeProtocolStateFromSnapshot(
		attributes: IDocumentAttributes,
		storage: IDocumentStorageService,
		snapshot: ISnapshotTree | undefined,
	): Promise<void> {
		const quorumSnapshot: IQuorumSnapshot = {
			members: [],
			proposals: [],
			values: [],
		};

		if (snapshot !== undefined) {
			const baseTree = getProtocolSnapshotTree(snapshot);
			[quorumSnapshot.members, quorumSnapshot.proposals, quorumSnapshot.values] =
				await Promise.all([
					readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers),
					readAndParse<[number, ISequencedProposal, string[]][]>(
						storage,
						baseTree.blobs.quorumProposals,
					),
					readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues),
				]);
		}

		this.initializeProtocolState(attributes, quorumSnapshot);
	}

	private initializeProtocolState(
		attributes: IDocumentAttributes,
		quorumSnapshot: IQuorumSnapshot,
	): void {
		const protocol = this.protocolHandlerBuilder(attributes, quorumSnapshot, (key, value) =>
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			this.submitMessage(MessageType.Propose, JSON.stringify({ key, value })),
		);

		const protocolLogger = createChildLogger({
			logger: this.subLogger,
			namespace: "ProtocolHandler",
		});

		protocol.quorum.on("error", (error: ITelemetryErrorEventExt) => {
			protocolLogger.sendErrorEvent(error);
		});

		protocol.quorum.on("addProposal", (proposal: ISequencedProposal) => {
			if (proposal.key === "code" || proposal.key === "code2") {
				this.emit("codeDetailsProposed", proposal.value, proposal);
			}
		});

		protocol.quorum.on("approveProposal", (sequenceNumber, key, value) => {
			if (key === "code" || key === "code2") {
				if (!isFluidCodeDetails(value)) {
					this.mc.logger.sendErrorEvent({
						eventName: "CodeProposalNotIFluidCodeDetails",
					});
				}
				this.processCodeProposal().catch((error) => {
					const normalizedError = normalizeError(error);
					this.close(normalizedError);
					throw error;
				});
			}
		});
		// we need to make sure this member get set in a synchronous context,
		// or other things can happen after the object that will be set is created, but not yet set
		// this was breaking this._initialClients handling
		//
		this._protocolHandler = protocol;
	}

	private captureProtocolSummary(): ISummaryTree {
		const quorumSnapshot = this.protocolHandler.snapshot();
		const summary: ISummaryTree = {
			tree: {
				attributes: {
					content: JSON.stringify(this.protocolHandler.attributes),
					type: SummaryType.Blob,
				},
				quorumMembers: {
					content: JSON.stringify(quorumSnapshot.members),
					type: SummaryType.Blob,
				},
				quorumProposals: {
					content: JSON.stringify(quorumSnapshot.proposals),
					type: SummaryType.Blob,
				},
				quorumValues: {
					content: JSON.stringify(quorumSnapshot.values),
					type: SummaryType.Blob,
				},
			},
			type: SummaryType.Tree,
		};

		return summary;
	}

	private getCodeDetailsFromQuorum(): IFluidCodeDetails {
		const quorum = this.protocolHandler.quorum;

		const pkg = getCodeProposal(quorum);

		return pkg as IFluidCodeDetails;
	}

	private static setupClient(
		containerId: string,
		loaderOptionsClient?: IClient,
		clientDetailsOverride?: IClientDetails,
	): IClient {
		const client: IClient =
			loaderOptionsClient === undefined
				? {
						details: {
							capabilities: { interactive: true },
						},
						mode: "read", // default reconnection mode on lost connection / connection error
						permission: [],
						scopes: [],
						user: { id: "" },
					}
				: structuredClone(loaderOptionsClient);

		if (clientDetailsOverride !== undefined) {
			client.details = {
				...client.details,
				...clientDetailsOverride,
				capabilities: {
					...client.details.capabilities,
					...clientDetailsOverride?.capabilities,
				},
			};
		}
		client.details.environment = [
			client.details.environment,
			` loaderVersion:${pkgVersion}`,
			` containerId:${containerId}`,
		].join(";");

		return client;
	}

	/**
	 * Returns true if connection is active, i.e. it's "write" connection and
	 * container runtime was notified about this connection (i.e. we are up-to-date and could send ops).
	 * This happens after client received its own joinOp and thus is in the quorum.
	 * If it's not true, runtime is not in position to send ops.
	 */
	private activeConnection(): boolean {
		return (
			this.connectionState === ConnectionState.Connected && this.connectionMode === "write"
		);
	}

	private createDeltaManager(): DeltaManager<ConnectionManager> {
		const serviceProvider = (): IDocumentService | undefined => this.service;
		const deltaManager = new DeltaManager<ConnectionManager>(
			serviceProvider,
			createChildLogger({ logger: this.subLogger, namespace: "DeltaManager" }),
			() => this.activeConnection(),
			(props: IConnectionManagerFactoryArgs) =>
				new ConnectionManager(
					serviceProvider,
					() => this.isDirty,
					this.client,
					this._canReconnect,
					createChildLogger({ logger: this.subLogger, namespace: "ConnectionManager" }),
					props,
				),
		);

		// Disable inbound queues as Container is not ready to accept any ops until we are fully loaded!
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		deltaManager.inbound.pause();
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		deltaManager.inboundSignal.pause();

		deltaManager.on("connect", (details: IConnectionDetailsInternal, _opsBehind?: number) => {
			assert(this.connectionMode === details.mode, 0x4b7 /* mismatch */);

			// Delay raising events until setLoaded()
			// Here are some of the reasons why this design is chosen:
			// 1. Various processes track speed of connection. But we are not processing ops or signal while container is loading,
			//    and thus we can't move forward across connection modes. This results in telemetry errors (like NoJoinOp) that
			//    have nothing to do with connection flow itself
			// 2. This also makes it hard to reason about recovery (like reconnection) in case we might have lost JoinSignal. Reconnecting
			//    in loading phase is useless (get back to same state), but at the same time not doing it may result in broken connection
			//    without recovery (after we loaded).
			// 3. We expose non-consistent view. ContainerRuntime may start loading in non-connected state, but end in connected, with
			//    no events telling about it (until we loaded). Most of the code relies on a fact that state changes when events fire.
			// This will not delay any processes (as observed by the user). I.e. once container moves to loaded phase,
			// we immediately would transition across all phases, if we have proper signals / ops ready.
			if (this.loaded) {
				this.connectionStateHandler.receivedConnectEvent(details);
			}
		});

		deltaManager.on("establishingConnection", (reason: IConnectionStateChangeReason) => {
			this.connectionStateHandler.establishingConnection(reason);
		});

		deltaManager.on("cancelEstablishingConnection", (reason: IConnectionStateChangeReason) => {
			this.connectionStateHandler.cancelEstablishingConnection(reason);
		});

		deltaManager.on("disconnect", (text, error) => {
			this.noopHeuristic?.notifyDisconnect();
			const reason = { text, error };
			// Symmetry with "connect" events
			if (this.loaded) {
				this.connectionStateHandler.receivedDisconnectEvent(reason);
			} else if (!this.closed) {
				// Raise cancellation to get state machine back to initial state
				this.connectionStateHandler.cancelEstablishingConnection(reason);
			}
		});

		deltaManager.on("throttled", (warning: IThrottlingWarning) => {
			const warn = warning as ContainerWarning;
			// Some "warning" events come from outside the container and are logged
			// elsewhere (e.g. summarizing container). We shouldn't log these here.
			if (warn.logged !== true) {
				this.mc.logger.sendTelemetryEvent({ eventName: "ContainerWarning" }, warn);
			}
			this.emit("warning", warn);
		});

		deltaManager.on("readonly", (readonly) => {
			if (this.loaded) {
				this.setContextConnectedState(
					this.connectionState === ConnectionState.Connected,
					readonly,
				);
			}
			this.emit("readonly", readonly);
		});

		deltaManager.on("closed", (error?: ICriticalContainerError) => {
			this.closeCore(error);
		});

		deltaManager.on("disposed", (error?: ICriticalContainerError) => {
			this.disposeCore(error);
		});

		return deltaManager;
	}

	private async attachDeltaManagerOpHandler(
		attributes: IDocumentAttributes,
		prefetchType?: "cached" | "all" | "none",
		lastProcessedSequenceNumber?: number,
	): Promise<void> {
		return this._deltaManager.attachOpHandler(
			attributes.minimumSequenceNumber /* minimumSequenceNumber */,
			attributes.sequenceNumber /* snapshotSequenceNumber */,
			{
				process: (message) => this.processRemoteMessage(message),
				processSignal: (message) => {
					this.processSignal(message);
				},
			} /* handler to process incoming delta messages */,
			prefetchType,
			lastProcessedSequenceNumber,
		);
	}

	private logConnectionStateChangeTelemetry(
		value: ConnectionState,
		oldState: ConnectionState,
		reason?: IConnectionStateChangeReason,
	): void {
		// Log actual event
		const time = performance.now();
		this.connectionTransitionTimes[value] = time;
		const duration = time - this.connectionTransitionTimes[oldState];

		let durationFromDisconnected: number | undefined;
		let autoReconnect: ReconnectMode | undefined;
		let checkpointSequenceNumber: number | undefined;
		let opsBehind: number | undefined;
		if (value === ConnectionState.Disconnected) {
			autoReconnect = this._deltaManager.connectionManager.reconnectMode;
		} else {
			if (value === ConnectionState.Connected) {
				durationFromDisconnected =
					time - this.connectionTransitionTimes[ConnectionState.Disconnected];
				durationFromDisconnected = formatTick(durationFromDisconnected);
			} else if (value === ConnectionState.CatchingUp) {
				// This info is of most interesting while Catching Up.
				checkpointSequenceNumber = this.deltaManager.lastKnownSeqNumber;
				// Need to check that we have already loaded and fetched the snapshot.
				if (this.deltaManager.hasCheckpointSequenceNumber && this.loaded) {
					opsBehind = checkpointSequenceNumber - this.deltaManager.lastSequenceNumber;
				}
			}
		}

		this.mc.logger.sendPerformanceEvent(
			{
				eventName: `ConnectionStateChange_${ConnectionState[value]}`,
				from: ConnectionState[oldState],
				duration,
				durationFromDisconnected,
				reason: reason?.text,
				connectionCount: this.connectionCount,
				pendingClientId: this.connectionStateHandler.pendingClientId,
				clientId: this.connectionStateHandler.clientId,
				autoReconnect,
				opsBehind,
				online: OnlineStatus[isOnline()],
				lastVisible:
					this.lastVisible === undefined ? undefined : performance.now() - this.lastVisible,
				checkpointSequenceNumber,
				quorumSize: this._protocolHandler?.quorum.getMembers().size,
				audienceSize: this._protocolHandler?.audience.getMembers().size,
				isDirty: this.isDirty,
				...this._deltaManager.connectionProps,
			},
			reason?.error,
		);

		if (value === ConnectionState.Connected) {
			this.connectionCount++;
		}
	}

	private propagateConnectionState(disconnectedReason?: IConnectionStateChangeReason): void {
		const connected = this.connectionState === ConnectionState.Connected;

		if (connected) {
			const clientId = this.connectionStateHandler.clientId;
			assert(clientId !== undefined, 0x96e /* there has to be clientId */);
			this.protocolHandler.audience.setCurrentClientId(clientId);
		}

		// We communicate only transitions to Connected & Disconnected states, skipping all other states.
		// This can be changed in the future, for example we likely should add "CatchingUp" event on Container.
		if (
			this.connectionState !== ConnectionState.Connected &&
			this.connectionState !== ConnectionState.Disconnected
		) {
			return;
		}

		// Both protocol and context should not be undefined if we got so far.

		this.setContextConnectedState(connected, this.readOnlyInfo.readonly ?? false);
		this.protocolHandler.setConnectionState(connected, this.clientId);
		raiseConnectedEvent(
			this.mc.logger,
			this,
			connected,
			this.clientId,
			disconnectedReason?.text,
		);
	}

	// back-compat: ADO #1385: Remove in the future, summary op should come through submitSummaryMessage()
	private submitContainerMessage(
		type: MessageType,
		contents: unknown,
		batch?: boolean,
		metadata?: unknown,
	): number {
		switch (type) {
			case MessageType.Operation: {
				return this.submitMessage(type, JSON.stringify(contents), batch, metadata);
			}
			case MessageType.Summarize: {
				return this.submitSummaryMessage(contents as ISummaryContent);
			}
			default: {
				const newError = new GenericError(
					"invalidContainerSubmitOpType",
					undefined /* error */,
					{ messageType: type },
				);
				this.close(newError);
				return -1;
			}
		}
	}

	/**
	 * Gets the `clientSequenceNumber` of last message in a batch.
	 */
	private submitBatch(batch: IBatchMessage[], referenceSequenceNumber?: number): number {
		let clientSequenceNumber = -1;
		for (const message of batch) {
			clientSequenceNumber = this.submitMessage(
				MessageType.Operation,
				message.contents,
				true, // batch
				message.metadata,
				message.compression,
				referenceSequenceNumber,
			);
		}
		this._deltaManager.flush();
		return clientSequenceNumber;
	}

	private submitSummaryMessage(
		summary: ISummaryContent,
		referenceSequenceNumber?: number,
	): number {
		// github #6451: this is only needed for staging so the server
		// know when the protocol tree is included
		// this can be removed once all clients send
		// protocol tree by default
		if (summary.details === undefined) {
			summary.details = {};
		}
		summary.details.includesProtocolTree = this.storageAdapter.summarizeProtocolTree;
		return this.submitMessage(
			MessageType.Summarize,
			JSON.stringify(summary),
			false /* batch */,
			undefined /* metadata */,
			undefined /* compression */,
			referenceSequenceNumber,
		);
	}

	private submitMessage(
		type: MessageType,
		contents?: string,
		batch?: boolean,
		metadata?: unknown,
		compression?: string,
		referenceSequenceNumber?: number,
	): number {
		if (this.connectionState !== ConnectionState.Connected) {
			this.mc.logger.sendErrorEvent({ eventName: "SubmitMessageWithNoConnection", type });
			return -1;
		}

		this.noopHeuristic?.notifyMessageSent();
		return this._deltaManager.submit(
			type,
			contents,
			batch,
			metadata,
			compression,
			referenceSequenceNumber,
		);
	}

	/**
	 * Processes incoming delta messages
	 * @param message - delta message received from the server
	 */
	private processRemoteMessage(message: ISequencedDocumentMessage): void {
		const local = this.clientId === message.clientId;

		// Allow the protocol handler to process the message
		const result = this.protocolHandler.processMessage(message, local);

		// Forward messages to the loaded runtime for processing
		this.runtime.process(message, local);
		this.serializedStateManager.addProcessedOp(message);
		// Inactive (not in quorum or not writers) clients don't take part in the minimum sequence number calculation.
		if (this.activeConnection()) {
			if (this.noopHeuristic === undefined) {
				const serviceConfiguration = this.deltaManager.serviceConfiguration;
				// Note that config from first connection will be used for this container's lifetime.
				// That means that if relay service changes settings, such changes will impact only newly booted
				// clients.
				// All existing will continue to use settings they got earlier.
				assert(
					serviceConfiguration !== undefined,
					0x2e4 /* "there should be service config for active connection" */,
				);
				this.noopHeuristic = new NoopHeuristic(
					serviceConfiguration.noopTimeFrequency,
					serviceConfiguration.noopCountFrequency,
				);
				this.noopHeuristic.on("wantsNoop", () => {
					// On disconnect we notify the heuristic which should prevent it from wanting a noop.
					// Hitting this assert would imply we lost activeConnection between notifying the heuristic of a processed message and
					// running the microtask that the heuristic queued in response.
					assert(
						this.activeConnection(),
						0x241 /* "Trying to send noop without active connection" */,
					);
					this.submitMessage(MessageType.NoOp);
				});
			}
			this.noopHeuristic.notifyMessageProcessed(message);
			// The contract with the protocolHandler is that returning "immediateNoOp" is equivalent to "please immediately accept the proposal I just processed".
			if (result.immediateNoOp === true) {
				this.submitMessage(MessageType.Accept);
			}
		}

		this.emit("op", message);
	}

	// unknown should be removed once `@alpha` tag is removed from IContainerContext
	private submitSignal(content: unknown | ISignalEnvelope, targetClientId?: string): void {
		this._deltaManager.submitSignal(JSON.stringify(content), targetClientId);
	}

	private processSignal(message: ISignalMessage): void {
		// No clientId indicates a system signal message.
		if (protocolHandlerShouldProcessSignal(message)) {
			this.protocolHandler.processSignal(message);
		} else {
			const local = this.clientId === message.clientId;
			this.runtime.processSignal(message, local);
		}
	}

	private async instantiateRuntime(
		codeDetails: IFluidCodeDetails,
		snapshotTree: ISnapshotTree | undefined,
		pendingLocalState?: unknown,
		snapshot?: ISnapshot,
	): Promise<void> {
		assert(this._runtime?.disposed !== false, 0x0dd /* "Existing runtime not disposed" */);

		// The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
		// are set. Global requests will still go directly to the loader
		const maybeLoader: FluidObject<ILoader> = this.scope;
		const loader = new RelativeLoader(this, maybeLoader.ILoader);

		const loadCodeResult = await PerformanceEvent.timedExecAsync(
			this.subLogger,
			{ eventName: "CodeLoad" },
			async () => this.codeLoader.load(codeDetails),
		);

		this._loadedModule = {
			module: loadCodeResult.module,
			// An older interface ICodeLoader could return an IFluidModule which didn't have details.
			// If we're using one of those older ICodeLoaders, then we fix up the module with the specified details here.
			// TODO: Determine if this is still a realistic scenario or if this fixup could be removed.
			details: loadCodeResult.details ?? codeDetails,
		};

		const fluidExport: FluidObject<IProvideRuntimeFactory> | undefined =
			this._loadedModule.module.fluidExport;
		const runtimeFactory = fluidExport?.IRuntimeFactory;
		if (runtimeFactory === undefined) {
			throw new Error(packageNotFactoryError);
		}

		const existing = snapshotTree !== undefined;

		const context = new ContainerContext(
			this.options,
			this.scope,
			snapshotTree,
			this._loadedFromVersion,
			this._deltaManager,
			this.storageAdapter,
			this.protocolHandler.quorum,
			this.protocolHandler.audience,
			loader,
			(type, contents, batch, metadata) =>
				this.submitContainerMessage(type, contents, batch, metadata),
			(summaryOp: ISummaryContent, referenceSequenceNumber?: number) =>
				this.submitSummaryMessage(summaryOp, referenceSequenceNumber),
			(batch: IBatchMessage[], referenceSequenceNumber?: number) =>
				this.submitBatch(batch, referenceSequenceNumber),
			(content, targetClientId) => this.submitSignal(content, targetClientId),
			(error?: ICriticalContainerError) => this.dispose(error),
			(error?: ICriticalContainerError) => this.close(error),
			this.updateDirtyContainerState,
			this.getAbsoluteUrl,
			() => this.resolvedUrl?.id,
			() => this.clientId,
			() => this.attachState,
			() => this.connected,
			this._deltaManager.clientDetails,
			existing,
			this.subLogger,
			pendingLocalState,
			snapshot,
		);

		const runtime = await PerformanceEvent.timedExecAsync(
			this.subLogger,
			{ eventName: "InstantiateRuntime" },
			async () => runtimeFactory.instantiateRuntime(context, existing),
		);

		const maybeRuntimeCompatDetails = runtime as FluidObject<ILayerCompatDetails>;
		validateRuntimeCompatibility(maybeRuntimeCompatDetails.ILayerCompatDetails, (error) =>
			this.dispose(error),
		);

		this._runtime = runtime;

		this._lifecycleEvents.emit("runtimeInstantiated");

		this._loadedCodeDetails = codeDetails;
	}

	private readonly updateDirtyContainerState = (dirty: boolean): void => {
		if (this._dirtyContainer === dirty) {
			return;
		}
		this._dirtyContainer = dirty;
		this.emit(dirty ? dirtyContainerEvent : savedContainerEvent);
	};

	/**
	 * Set the connected state of the ContainerContext
	 * This controls the "connected" state of the ContainerRuntime as well
	 * @param connected - Is the container currently connected?
	 * @param readonly - Is the container in readonly mode?
	 */
	private setContextConnectedState(connected: boolean, readonly: boolean): void {
		if (this._runtime?.disposed === false && this.loaded) {
			/**
			 * We want to lie to the ContainerRuntime when we are in readonly mode to prevent issues with pending
			 * ops getting through to the DeltaManager.
			 * The ContainerRuntime's "connected" state simply means it is ok to send ops
			 * See https://dev.azure.com/fluidframework/internal/_workitems/edit/1246
			 */
			this.runtime.setConnectionState(connected && !readonly, this.clientId);
		}
	}

	private handleDeltaConnectionArg(
		deltaConnectionArg?: "none" | "delayed",
		connectionArgs?: IConnectionArgs,
	): void {
		// This ensures that we allow transitions to "connected" state only after container has been fully loaded
		// and we propagate such events to container runtime. All events prior to being loaded are ignored.
		// This means if we get here in non-loaded state, we might not deliver proper events to container runtime,
		// and runtime implementation may miss such events.
		assert(
			this.loaded,
			0x96f /* has to be called after container transitions to loaded state */,
		);

		switch (deltaConnectionArg) {
			case undefined: {
				if (connectionArgs) {
					// connect to delta stream now since we did not before
					this.connectToDeltaStream(connectionArgs);
				}
			}
			// intentional fallthrough
			case "delayed": {
				assert(
					this.inboundQueuePausedFromInit,
					0x346 /* inboundQueuePausedFromInit should be true */,
				);
				this.inboundQueuePausedFromInit = false;
				this._deltaManager.inbound.resume();
				this._deltaManager.inboundSignal.resume();
				break;
			}
			case "none": {
				break;
			}
			default: {
				unreachableCase(deltaConnectionArg);
			}
		}
	}
}

/**
 * IContainer interface that includes experimental features still under development.
 * @internal
 */
export interface IContainerExperimental extends IContainer {
	/**
	 * Get pending state from container. WARNING: misuse of this API can result in duplicate op
	 * submission and potential document corruption. The blob returned MUST be deleted if and when this
	 * container emits a "connected" event.
	 * @returns serialized blob that can be passed to Loader.resolve()
	 */
	getPendingLocalState?(): Promise<string>;

	/**
	 * Closes the container and returns serialized local state intended to be
	 * given to a newly loaded container.
	 */
	closeAndGetPendingLocalState?(stopBlobAttachingSignal?: AbortSignal): Promise<string>;
}
