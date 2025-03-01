/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";

import type { AudienceClientMetadata } from "./AudienceMetadata.js";
import type { ContainerKey, FluidObjectId, HasContainerKey } from "./CommonInterfaces.js";
import { ContainerStateChangeKind } from "./Container.js";
import type { ContainerStateMetadata } from "./ContainerMetadata.js";
import type { ContainerDevtoolsFeatureFlags } from "./Features.js";
import type { IContainerDevtools } from "./IContainerDevtools.js";
import type { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs.js";
import {
	DataVisualizerGraph,
	type FluidObjectNode,
	type RootHandleNode,
	defaultVisualizers,
} from "./data-visualization/index.js";
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
	type IDevtoolsMessage,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	type MessageLoggingOptions,
	RootDataVisualizations,
	handleIncomingWindowMessage,
	postMessagesToWindow,
} from "./messaging/index.js";

/**
 * Properties for registering a {@link @fluidframework/container-definitions#IContainer} with the Devtools.
 * @alpha
 */
export interface ContainerDevtoolsProps extends HasContainerKey {
	/**
	 * The Container to register with the Devtools.
	 */
	container: IContainer;

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

	// TODO: Add ability for customers to specify custom visualizer overrides
}

/**
 * {@link IContainerDevtools} implementation.
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for (if the {@link HasContainerKey.containerKey} matches):**
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
 * @sealed
 */
export class ContainerDevtools implements IContainerDevtools, HasContainerKey {
	/**
	 * {@inheritDoc HasContainerKey.containerKey}
	 */
	public readonly containerKey: ContainerKey;

	/**
	 * The registered Container.
	 */
	public readonly container: IContainer;

	/**
	 * The {@link ContainerDevtools.container}'s audience.
	 */
	public get audience(): IAudience {
		return this.container.audience;
	}

	/**
	 * Data contents of the Container.
	 *
	 * @remarks
	 *
	 * This map is assumed to be immutable. The devtools will not make any modifications to its contents.
	 */
	public containerData?: Record<string, IFluidLoadable>;

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
	 * @remarks Will only be `undefined` if `containerData` was not provided, or if the devtools has been disposed.
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
			changeKind: "joined",
			timestamp: Date.now(),
		});
		this.postAudienceStateChange();
	};

	private readonly audienceMemberRemovedHandler = (
		clientId: string,
		client: IClient,
	): void => {
		this._audienceChangeLog.push({
			clientId,
			client,
			changeKind: "left",
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
	 * Handlers for inbound messages related to the devtools.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		[GetContainerDevtoolsFeatures.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as GetContainerDevtoolsFeatures.Message;
			if (message.data.containerKey === this.containerKey) {
				this.postSupportedFeatures();
				return true;
			}
			return false;
		},
		[GetContainerState.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as GetContainerState.Message;
			if (message.data.containerKey === this.containerKey) {
				this.postContainerStateChange();
				return true;
			}
			return false;
		},
		[ConnectContainer.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as ConnectContainer.Message;
			if (message.data.containerKey === this.containerKey) {
				this.container.connect();
				return true;
			}
			return false;
		},
		[DisconnectContainer.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as DisconnectContainer.Message;
			if (message.data.containerKey === this.containerKey) {
				this.container.disconnect(
					/* TODO: Specify devtools reason here once it is supported */
				);
				return true;
			}
			return false;
		},
		[CloseContainer.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as CloseContainer.Message;
			if (message.data.containerKey === this.containerKey) {
				this.container.close(/* TODO: Specify devtools reason here once it is supported */);
				return true;
			}
			return false;
		},
		[GetAudienceSummary.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as GetAudienceSummary.Message;
			if (message.data.containerKey === this.containerKey) {
				this.postAudienceStateChange();
				return true;
			}
			return false;
		},
		[GetRootDataVisualizations.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as GetRootDataVisualizations.Message;
			if (message.data.containerKey === this.containerKey) {
				const visualizations = await this.getRootDataVisualizations();
				this.postRootDataVisualizations(visualizations);
				return true;
			}
			return false;
		},
		[GetDataVisualization.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as GetDataVisualization.Message;
			if (message.data.containerKey === this.containerKey) {
				const visualization = await this.getDataVisualization(message.data.fluidObjectId);
				this.postDataVisualization(message.data.fluidObjectId, visualization);
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
		handleIncomingWindowMessage(
			event,
			this.inboundMessageHandlers,
			this.messageLoggingOptions,
		);
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
				containerKey: this.containerKey,
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
				containerKey: this.containerKey,
				containerState: this.getContainerState(),
			}),
			ContainerStateHistory.createMessage({
				containerKey: this.containerKey,
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
				containerKey: this.containerKey,
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
				containerKey: this.containerKey,
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
				containerKey: this.containerKey,
				fluidObjectId,
				visualization,
			}),
		);
	};

	// #endregion

	/**
	 * Message logging options used by the devtools.
	 */
	private get messageLoggingOptions(): MessageLoggingOptions {
		return { context: `Container Devtools (${this.containerKey})` };
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
		this.containerKey = props.containerKey;
		this.containerData = props.containerData;
		this.container = props.container;

		// TODO: would it be useful to log the states (and timestamps) at time of devtools initialize?
		this._connectionStateLog = [];
		this._audienceChangeLog = [];

		this.dataVisualizer =
			props.containerData === undefined
				? undefined
				: new DataVisualizerGraph(props.containerData, defaultVisualizers);

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

		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Gets the set of features supported by this instance.
	 */
	private getSupportedFeatures(): ContainerDevtoolsFeatureFlags {
		return {
			// If no container data was provided to the devtools, we cannot support data visualization.
			containerDataVisualization: this.containerData !== undefined,
		};
	}

	/**
	 * Generates {@link ContainerStateMetadata} describing the current state of the associated Container.
	 */
	private getContainerState(): ContainerStateMetadata {
		const clientId = this.container.clientId;
		return {
			containerKey: this.containerKey,
			attachState: this.container.attachState,
			connectionState: this.container.connectionState,
			closed: this.container.closed,
			clientId: this.container.clientId,
			userId: clientId === undefined ? undefined : this.audience.getMember(clientId)?.user.id,
		};
	}

	private async getRootDataVisualizations(): Promise<
		Record<string, RootHandleNode> | undefined
	> {
		return this.dataVisualizer?.renderRootHandles() ?? undefined;
	}

	private async getDataVisualization(
		fluidObjectId: FluidObjectId,
	): Promise<FluidObjectNode | undefined> {
		return this.dataVisualizer?.render(fluidObjectId) ?? undefined;
	}
}
