/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IAudience, IContainer } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IClient } from "@fluidframework/protocol-definitions";

import { FluidObjectId } from "./CommonInterfaces";
import { ContainerStateChangeKind } from "./Container";
import { ContainerStateMetadata } from "./ContainerMetadata";
import {
	DataVisualizerGraph,
	defaultVisualizers,
	FluidObjectNode,
	RootHandleNode,
	VisualizeSharedObject,
} from "./data-visualization";
import { IContainerDevtools, ContainerDevtoolsEvents } from "./IContainerDevtools";
import { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs";
import {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerDevtoolsFeatures,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerDevtoolsFeatures,
	GetContainerState,
	GetDataVisualization,
	GetRootDataVisualizations,
	handleIncomingWindowMessage,
	IDevtoolsMessage,
	InboundHandlers,
	ISourcedDevtoolsMessage,
	MessageLoggingOptions,
	postMessagesToWindow,
	RootDataVisualizations,
} from "./messaging";
import { AudienceClientMetadata } from "./AudienceMetadata";
import { ContainerDevtoolsFeature, ContainerDevtoolsFeatureFlags } from "./Features";

/**
 * Properties for configuring a {@link IContainerDevtools}.
 *
 * @public
 */
export interface ContainerDevtoolsProps {
	/**
	 * The Container with which the {@link ContainerDevtools} instance will be associated.
	 */
	container: IContainer;

	/**
	 * The ID of the {@link ContainerDevtoolsProps.container | Container}.
	 */
	containerId: string;

	/**
	 * (optional) Distributed Data Structures (DDSs) associated with the
	 * {@link ContainerDevtoolsProps.container | Container}.
	 *
	 * @remarks
	 *
	 * Providing this data will enable associated tooling to visualize the Fluid data reachable from the provided
	 * objects.
	 *
	 * Fluid DevTools will not mutate this data.
	 *
	 * @privateRemarks TODO: rename this to make it more clear that this data does not *belong* to the Container.
	 */
	containerData?: Record<string, IFluidLoadable>;

	// TODO: Accept custom data visualizers.

	/**
	 * (optional) Nickname for the {@link ContainerDevtoolsProps.container | Container} / debugger instance.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between instances using
	 * semantically meaningful information.
	 *
	 * If not provided, the {@link ContainerDevtoolsProps.containerId} will be used for the purpose of distinguishing
	 * instances.
	 */
	containerNickname?: string;

	/**
	 * (optional) Configurations for generating visual representations of
	 * {@link @fluidframework/shared-object-base#ISharedObject}s under {@link ContainerDevtoolsProps.containerData}.
	 *
	 * @remarks
	 *
	 * If not specified, then only `SharedObject` types natively known by the system will be visualized, and using
	 * default visualization implementations.
	 *
	 * If a visualizer configuration is specified for a shared object type that has a default visualizer, the custom one will be used.
	 */
	dataVisualizers?: Record<string, VisualizeSharedObject>;
}

/**
 * {@link IContainerDevtools} implementation.
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for (if the {@link HasContainerId.containerId} matches):**
 *
 * - {@link GetContainerDevtoolsFeatures.Message}: When received, {@link ContainerDevtoolsFeatures.Message} will be
 * posted in response.
 *
 * - {@link GetContainerState.Message}: When received, {@link ContainerStateChange.Message} will be posted in response.
 *
 * - {@link ConnectContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.connect}
 * will be called on the {@link ContainerDevtools.container} (if it is disconnected).
 *
 * - {@link DisconnectContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.disconnect}
 * will be called on the {@link ContainerDevtools.container} (if it is connected).
 *
 * - {@link CloseContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.close}
 * will be called on the {@link ContainerDevtools.container}.
 *
 * - {@link GetAudienceSummary.Message}: When received, {@link AudienceSummary.Message} will be posted in response.
 *
 * - {@link GetRootDataVisualizations.Message}: When received, {@link RootDataVisualizations.Message} will be posted
 * in response.
 *
 * - {@link GetDataVisualization.Message}: When received, {@link DataVisualization.Message} will be posted in response.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link ContainerDevtoolsFeatures.Message}: Posted only when requested via {@link GetContainerDevtoolsFeatures.Message}.
 *
 * - {@link AudienceSummary.Message}: Posted any time the Container's Audience state changes, or when requested
 * (via {@link GetAudienceSummary.Message}).
 *
 * - {@link ContainerStateChange.Message}: Posted any time relevant Container state changes,
 * or when requested (via {@link GetContainerState.Message}).
 *
 * - {@link RootDataVisualizations.Message}: Posted when requested via {@link GetRootDataVisualizations.Message}.
 *
 * - {@link DataVisualization.Message}: Posted when requested via {@link GetDataVisualization.Message}, or when
 * a change has occurred on the associated DDS, reachable from the visualization graph.
 *
 * TODO: Document others as they are added.
 *
 * @sealed
 * @internal
 */
export class ContainerDevtools
	extends TypedEventEmitter<ContainerDevtoolsEvents>
	implements IContainerDevtools
{
	/**
	 * {@inheritDoc IContainerDevtools.containerId}
	 */
	public readonly containerId: string;

	/**
	 * {@inheritDoc IContainerDevtools.container}
	 */
	public readonly container: IContainer;

	/**
	 * {@inheritDoc IContainerDevtools.audience}
	 */
	public get audience(): IAudience {
		return this.container.audience;
	}

	/**
	 * {@inheritDoc IContainerDevtools.containerData}
	 */
	public readonly containerData?: Record<string, IFluidLoadable>;

	/**
	 * {@inheritDoc IContainerDevtools.containerNickname}
	 */
	public readonly containerNickname?: string;

	// #region Accumulated log state

	/**
	 * Accumulated data for {@link IContainerDevtools.getContainerConnectionLog}.
	 */
	private readonly _connectionStateLog: ConnectionStateChangeLogEntry[];

	/**
	 * Accumulated data for {@link IContainerDevtools.getAudienceHistory}.
	 */
	private readonly _audienceChangeLog: AudienceChangeLogEntry[];

	// #endregion

	/**
	 * Manages state visualization for {@link ContainerDevtools.containerData}, if any was provided.
	 *
	 * @remarks Will only be `undefined` if `containerData` was not provided, or if the debugger has been disposed.
	 */
	private dataVisualizer: DataVisualizerGraph | undefined;

	// #region Container-related event handlers

	private readonly containerAttachedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Attached,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
	};

	private readonly containerConnectedHandler = (clientId: string): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Connected,
			timestamp: Date.now(),
			clientId,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	private readonly containerDisconnectedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Disconnected,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	private readonly containerClosedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Closed,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	private readonly containerDisposedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Disposed,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	// #endregion

	// #region Audience-related event handlers

	private readonly audienceMemberAddedHandler = (clientId: string, client: IClient): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "added",
			timestamp: Date.now(),
		});
		this.postAudienceStateChange();
	};

	private readonly audienceMemberRemovedHandler = (clientId: string, client: IClient): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "removed",
			timestamp: Date.now(),
		});
		this.postAudienceStateChange();
	};

	// #endregion

	// #region Data-related event handlers

	private readonly dataUpdateHandler = (visualization: FluidObjectNode): void => {
		this.postDataVisualization(visualization.fluidObjectId, visualization);
	};

	// #endregion

	// #region Window event handlers

	/**
	 * Handlers for inbound messages related to the debugger.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		[GetContainerDevtoolsFeatures.MessageType]: (untypedMessage) => {
			const message = untypedMessage as GetContainerDevtoolsFeatures.Message;
			if (message.data.containerId === this.containerId) {
				this.postSupportedFeatures();
				return true;
			}
			return false;
		},
		[GetContainerState.MessageType]: (untypedMessage) => {
			const message = untypedMessage as GetContainerState.Message;
			if (message.data.containerId === this.containerId) {
				this.postContainerStateChange();
				return true;
			}
			return false;
		},
		[ConnectContainer.MessageType]: (untypedMessage) => {
			const message = untypedMessage as ConnectContainer.Message;
			if (message.data.containerId === this.containerId) {
				this.container.connect();
				return true;
			}
			return false;
		},
		[DisconnectContainer.MessageType]: (untypedMessage) => {
			const message = untypedMessage as DisconnectContainer.Message;
			if (message.data.containerId === this.containerId) {
				this.container.disconnect(/* TODO: Specify debugger reason here once it is supported */);
				return true;
			}
			return false;
		},
		[CloseContainer.MessageType]: (untypedMessage) => {
			const message = untypedMessage as CloseContainer.Message;
			if (message.data.containerId === this.containerId) {
				this.container.close(/* TODO: Specify debugger reason here once it is supported */);
				return true;
			}
			return false;
		},
		[GetAudienceSummary.MessageType]: (untypedMessage) => {
			const message = untypedMessage as GetAudienceSummary.Message;
			if (message.data.containerId === this.containerId) {
				this.postAudienceStateChange();
				return true;
			}
			return false;
		},
		[GetRootDataVisualizations.MessageType]: (untypedMessage) => {
			const message = untypedMessage as GetRootDataVisualizations.Message;
			if (message.data.containerId === this.containerId) {
				this.getRootDataVisualizations().then((visualizations) => {
					this.postRootDataVisualizations(visualizations);
				}, console.error);
				return true;
			}
			return false;
		},
		[GetDataVisualization.MessageType]: (untypedMessage) => {
			const message = untypedMessage as GetDataVisualization.Message;
			if (message.data.containerId === this.containerId) {
				this.getDataVisualization(message.data.fluidObjectId).then((visualization) => {
					this.postDataVisualization(message.data.fluidObjectId, visualization);
				}, console.error);
				return true;
			}
			return false;
		},
	};

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	private readonly windowMessageHandler = (
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void => {
		handleIncomingWindowMessage(event, this.inboundMessageHandlers, this.messageLoggingOptions);
	};

	/**
	 * Posts {@link ContainerDevtoolsFeatures.Message} to the window (globalThis) with the set of features supported
	 * by this instance.
	 */
	private readonly postSupportedFeatures = (): void => {
		const supportedFeatures = this.getSupportedFeatures();
		postMessagesToWindow(
			this.messageLoggingOptions,
			ContainerDevtoolsFeatures.createMessage({
				containerId: this.containerId,
				features: supportedFeatures,
			}),
		);
	};

	/**
	 * Posts a {@link ISourcedDevtoolsMessage} to the window (globalThis).
	 */
	private readonly postContainerStateChange = (): void => {
		postMessagesToWindow<IDevtoolsMessage>(
			this.messageLoggingOptions,
			ContainerStateChange.createMessage({
				containerId: this.containerId,
				containerState: this.getContainerState(),
			}),
			ContainerStateHistory.createMessage({
				containerId: this.containerId,
				history: [...this._connectionStateLog],
			}),
		);
	};

	/**
	 * Posts a {@link AudienceSummary.Message} to the window (globalThis).
	 */
	private readonly postAudienceStateChange = (): void => {
		const allAudienceMembers = this.container.audience.getMembers();

		const audienceClientMetadata: AudienceClientMetadata[] = [
			...allAudienceMembers.entries(),
		].map(([clientId, client]): AudienceClientMetadata => {
			return { clientId, client };
		});

		postMessagesToWindow(
			this.messageLoggingOptions,
			AudienceSummary.createMessage({
				containerId: this.containerId,
				clientId: this.container.clientId,
				audienceState: audienceClientMetadata,
				audienceHistory: this.getAudienceHistory(),
			}),
		);
	};

	private readonly postRootDataVisualizations = (
		visualizations: Record<string, RootHandleNode> | undefined,
	): void => {
		postMessagesToWindow(
			this.messageLoggingOptions,
			RootDataVisualizations.createMessage({
				containerId: this.containerId,
				visualizations,
			}),
		);
	};

	private readonly postDataVisualization = (
		fluidObjectId: FluidObjectId,
		visualization: FluidObjectNode | undefined,
	): void => {
		postMessagesToWindow(
			this.messageLoggingOptions,
			DataVisualization.createMessage({
				containerId: this.containerId,
				fluidObjectId,
				visualization,
			}),
		);
	};

	// #endregion

	private readonly debuggerDisposedHandler = (): boolean => this.emit("disposed");

	/**
	 * Message logging options used by the debugger.
	 */
	private get messageLoggingOptions(): MessageLoggingOptions {
		return { context: `Container Devtools (${this.containerId})` };
	}

	/**
	 * Whether or not the instance has been disposed yet.
	 *
	 * @remarks Not related to Container disposal.
	 *
	 * @see {@link IContainerDevtools.dispose}
	 */
	private _disposed: boolean;

	public constructor(props: ContainerDevtoolsProps) {
		super();

		this.containerId = props.containerId;
		this.containerData = props.containerData;
		this.container = props.container;
		this.containerNickname = props.containerNickname;

		// TODO: would it be useful to log the states (and timestamps) at time of debugger initialize?
		this._connectionStateLog = [];
		this._audienceChangeLog = [];

		this.dataVisualizer =
			props.containerData === undefined
				? undefined
				: new DataVisualizerGraph(props.containerData, {
						...defaultVisualizers,
						...props.dataVisualizers, // User-specified visualizers take precedence over system defaults
				  });
		this.dataVisualizer?.on("update", this.dataUpdateHandler);

		// Bind Container events required for change-logging
		this.container.on("attached", this.containerAttachedHandler);
		this.container.on("connected", this.containerConnectedHandler);
		this.container.on("disconnected", this.containerDisconnectedHandler);
		this.container.on("disposed", this.containerDisposedHandler);
		this.container.on("closed", this.containerClosedHandler);

		// Bind Audience events required for change-logging
		this.audience.on("addMember", this.audienceMemberAddedHandler);
		this.audience.on("removeMember", this.audienceMemberRemovedHandler);

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IContainerDevtools.getContainerConnectionLog}
	 */
	public getContainerConnectionLog(): readonly ConnectionStateChangeLogEntry[] {
		// Clone array contents so consumers don't see local changes
		return this._connectionStateLog.map((value) => value);
	}

	/**
	 * {@inheritDoc IContainerDevtools.getAudienceHistory}
	 */
	public getAudienceHistory(): readonly AudienceChangeLogEntry[] {
		// Clone array contents so consumers don't see local changes
		return this._audienceChangeLog.map((value) => value);
	}

	/**
	 * {@inheritDoc IContainerDevtools.dispose}
	 */
	public dispose(): void {
		// Unbind Container events
		this.container.off("attached", this.containerAttachedHandler);
		this.container.off("connected", this.containerConnectedHandler);
		this.container.off("disconnected", this.containerDisconnectedHandler);
		this.container.off("disposed", this.containerDisposedHandler);
		this.container.off("closed", this.containerClosedHandler);

		// Unbind Audience events
		this.audience.off("addMember", this.audienceMemberAddedHandler);
		this.audience.off("removeMember", this.audienceMemberRemovedHandler);

		// Unbind window event listener
		globalThis.removeEventListener?.("message", this.windowMessageHandler);

		// Dispose of data visualization graph
		this.dataVisualizer?.off("update", this.dataUpdateHandler);
		this.dataVisualizer?.dispose();
		this.dataVisualizer = undefined;

		this.debuggerDisposedHandler(); // Notify consumers that the debugger has been disposed.

		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Gets the set of features supported by this instance.
	 */
	private getSupportedFeatures(): ContainerDevtoolsFeatureFlags {
		return {
			[ContainerDevtoolsFeature.ContainerData]: this.containerData !== undefined,
		};
	}

	/**
	 * Generates {@link ContainerStateMetadata} describing the current state of the associated Container.
	 */
	private getContainerState(): ContainerStateMetadata {
		const clientId = this.container.clientId;
		return {
			id: this.containerId,
			nickname: this.containerNickname,
			attachState: this.container.attachState,
			connectionState: this.container.connectionState,
			closed: this.container.closed,
			clientId: this.container.clientId,
			audienceId:
				clientId === undefined ? undefined : this.audience.getMember(clientId)?.user.id,
		};
	}

	private async getRootDataVisualizations(): Promise<Record<string, RootHandleNode> | undefined> {
		return this.dataVisualizer?.renderRootHandles() ?? undefined;
	}

	private async getDataVisualization(
		fluidObjectId: FluidObjectId,
	): Promise<FluidObjectNode | undefined> {
		return this.dataVisualizer?.render(fluidObjectId) ?? undefined;
	}
}
