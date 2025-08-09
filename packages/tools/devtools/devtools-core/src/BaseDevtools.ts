/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";

import type { AudienceClientMetadata } from "./AudienceMetadata.js";
import type { ContainerKey, FluidObjectId, HasContainerKey } from "./CommonInterfaces.js";
import { ContainerStateChangeKind } from "./Container.js";
import type { ContainerStateMetadata } from "./ContainerMetadata.js";
import type { DecomposedContainer } from "./DecomposedContainer.js";
import type { ContainerDevtoolsFeatureFlags } from "./Features.js";
import type { IContainerDevtools } from "./IContainerDevtools.js";
import type { AudienceChangeLogEntry, ConnectionStateChangeLogEntry } from "./Logs.js";
import {
	DataVisualizerGraph,
	type FluidObjectNode,
	type RootHandleNode,
	VisualNodeKind,
	defaultVisualizers,
} from "./data-visualization/index.js";
import {
	AudienceSummary,
	ContainerDevtoolsFeatures,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
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
 * Abstract base class for devtools implementations.
 * @remarks Contains shared functionality between {@link ContainerDevtools} and {@link ContainerRuntimeDevtools}.
 */
export abstract class BaseDevtools<TContainer extends DecomposedContainer>
	implements IContainerDevtools, HasContainerKey
{
	/**
	 * {@inheritDoc HasContainerKey.containerKey}
	 */
	public readonly containerKey: ContainerKey;

	/**
	 * Data contents of the Container.
	 *
	 * @remarks
	 *
	 * This map is assumed to be immutable. The devtools will not make any modifications to its contents.
	 */
	public readonly containerData?: Record<string, IFluidLoadable>;

	// #region Accumulated log state

	/**
	 * Accumulated data for {@link IContainerDevtools.getContainerConnectionLog}.
	 */
	protected readonly _connectionStateLog: ConnectionStateChangeLogEntry[];

	/**
	 * Accumulated data for {@link IContainerDevtools.getAudienceHistory}.
	 */
	protected readonly _audienceChangeLog: AudienceChangeLogEntry[];

	// #endregion

	/**
	 * Manages state visualization for containerData, if any was provided.
	 *
	 * @remarks Will only be `undefined` if `containerData` was not provided, or if the devtools has been disposed.
	 */
	protected dataVisualizer: DataVisualizerGraph | undefined;

	/**
	 * Whether or not the instance has been disposed yet.
	 *
	 * @remarks Not related to Container disposal.
	 *
	 * @see {@link IContainerDevtools.dispose}
	 */
	protected _disposed: boolean;

	/**
	 * Specific message handlers provided by the subclass.
	 */
	private readonly specificInboundMessageHandlers: InboundHandlers;

	// #region Abstract methods that must be implemented by subclasses

	/**
	 * Gets the container associated with this devtools instance.
	 */
	protected abstract get container(): TContainer;

	/**
	 * Gets the audience associated with this devtools instance.
	 */
	protected get audience(): IAudience {
		return this.container.audience;
	}

	/**
	 * Gets the set of features supported by this instance.
	 */
	protected abstract getSupportedFeatures(): ContainerDevtoolsFeatureFlags;

	/**
	 * Generates state metadata describing the current state of the associated Container or Container Runtime.
	 */
	protected getContainerState(): ContainerStateMetadata {
		return {
			containerKey: this.containerKey,
			attachState: this.container.attachState,
			connectionState: this.container.connectionState,
			closed: this.container.closed,
			clientId: this.container.clientId,
			userId:
				this.container.clientId === undefined
					? undefined
					: this.audience.getMember(this.container.clientId)?.user.id,
		};
	}

	// #endregion

	// #region Common event handlers

	protected readonly containerAttachedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Attached,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
	};

	protected readonly containerConnectedHandler = (clientId: string): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Connected,
			timestamp: Date.now(),
			clientId,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	protected readonly containerDisconnectedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Disconnected,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	protected readonly containerClosedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Closed,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	protected readonly containerDisposedHandler = (): void => {
		this._connectionStateLog.push({
			newState: ContainerStateChangeKind.Disposed,
			timestamp: Date.now(),
			clientId: undefined,
		});
		this.postContainerStateChange();
		this.postAudienceStateChange();
	};

	// #endregion

	// #region Audience event handlers

	protected readonly audienceMemberAddedHandler = (
		clientId: string,
		client: IClient,
	): void => {
		this._audienceChangeLog.push({
			changeKind: "joined",
			clientId,
			client,
			timestamp: Date.now(),
		});
		this.postAudienceStateChange();
	};

	protected readonly audienceMemberRemovedHandler = (
		clientId: string,
		client: IClient,
	): void => {
		this._audienceChangeLog.push({
			changeKind: "left",
			clientId,
			client,
			timestamp: Date.now(),
		});
		this.postAudienceStateChange();
	};

	// #endregion

	// #region Data visualization handlers

	protected readonly dataUpdateHandler = (visualization: FluidObjectNode): void => {
		// This is called when actual data changes occur - should trigger blinking
		this.postDataVisualization(
			visualization.fluidObjectId,
			visualization,
			DataVisualization.UpdateReason.DataChanged,
		);
	};

	// #endregion

	// #region Common message handlers

	/**
	 * Gets the complete set of inbound message handlers, including both common and specific handlers.
	 */
	protected get inboundMessageHandlers(): InboundHandlers {
		return {
			// Common handlers
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
					// This is a user-requested visualization - should NOT trigger blinking
					this.postDataVisualization(
						message.data.fluidObjectId,
						visualization,
						DataVisualization.UpdateReason.UserRequested,
					);
					return true;
				}
				return false;
			},
			// Include specific handlers from subclass
			...this.specificInboundMessageHandlers,
		};
	}

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	protected readonly windowMessageHandler = (
		event: MessageEvent<Partial<ISourcedDevtoolsMessage>>,
	): void => {
		handleIncomingWindowMessage(
			event,
			this.inboundMessageHandlers,
			this.messageLoggingOptions,
		);
	};

	// #endregion

	// #region Common posting methods

	/**
	 * Posts {@link ContainerDevtoolsFeatures.Message} to the window (globalThis) with the set of features supported
	 * by this instance.
	 */
	protected readonly postSupportedFeatures = (): void => {
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
	protected readonly postContainerStateChange = (): void => {
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
	protected readonly postAudienceStateChange = (): void => {
		const allAudienceMembers = this.audience.getMembers();

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

	protected readonly postRootDataVisualizations = (
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

	protected readonly postDataVisualization = (
		fluidObjectId: FluidObjectId,
		visualization: FluidObjectNode | undefined,
		reason: DataVisualization.UpdateReason = DataVisualization.UpdateReason.UserRequested,
	): void => {
		postMessagesToWindow(
			this.messageLoggingOptions,
			DataVisualization.createMessage({
				containerKey: this.containerKey,
				fluidObjectId,
				visualization,
				reason,
			}),
		);
	};
	// #endregion

	/**
	 * Message logging options used by the devtools.
	 */
	protected get messageLoggingOptions(): MessageLoggingOptions {
		return { context: `Container Devtools (${this.containerKey})` };
	}

	protected constructor(
		containerKey: ContainerKey,
		specificInboundMessageHandlers: InboundHandlers,
		containerData?: Record<string, IFluidLoadable>,
	) {
		this.containerKey = containerKey;
		this.containerData = containerData;
		this.specificInboundMessageHandlers = specificInboundMessageHandlers;

		// Initialize log state
		this._connectionStateLog = [];
		this._audienceChangeLog = [];

		// Initialize data visualizer
		this.dataVisualizer =
			containerData === undefined
				? undefined
				: new DataVisualizerGraph(containerData, defaultVisualizers);

		this.dataVisualizer?.on("update", this.dataUpdateHandler);

		// Initialize data visualization monitoring immediately to ensure event listeners are active
		if (this.dataVisualizer !== undefined) {
			this.initializeDataVisualizationMonitoring().catch((error) => {
				console.error("Failed to initialize data visualization monitoring:", error);
			});
		}

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);

		this._disposed = false;
	}

	/**
	 * Binds container events for change logging.
	 */
	protected bindContainerEvents(): void {
		this.container.on("attached", this.containerAttachedHandler);
		this.container.on("connected", this.containerConnectedHandler);
		this.container.on("disconnected", this.containerDisconnectedHandler);
		this.container.on("disposed", this.containerDisposedHandler);
		this.container.on("closed", this.containerClosedHandler);
	}

	/**
	 * Unbinds container events.
	 */
	protected unbindContainerEvents(): void {
		this.container.off("attached", this.containerAttachedHandler);
		this.container.off("connected", this.containerConnectedHandler);
		this.container.off("disconnected", this.containerDisconnectedHandler);
		this.container.off("disposed", this.containerDisposedHandler);
		this.container.off("closed", this.containerClosedHandler);
	}

	/**
	 * Binds audience events for change logging.
	 */
	protected bindAudienceEvents(): void {
		this.audience.on("addMember", this.audienceMemberAddedHandler);
		this.audience.on("removeMember", this.audienceMemberRemovedHandler);
	}

	/**
	 * Unbinds audience events.
	 */
	protected unbindAudienceEvents(): void {
		this.audience.off("addMember", this.audienceMemberAddedHandler);
		this.audience.off("removeMember", this.audienceMemberRemovedHandler);
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
		// Unbind container and audience events
		this.unbindContainerEvents();
		this.unbindAudienceEvents();

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
	 * Initialize data visualization monitoring immediately to ensure event listeners are set up
	 * and console logs appear even when devtools UI is not open.
	 */
	private async initializeDataVisualizationMonitoring(): Promise<void> {
		try {
			// Trigger initial rendering to set up event listeners on all shared objects
			const rootVisualizations = await this.getRootDataVisualizations();

			// Also render each root object fully to ensure nested objects get their listeners set up
			if (rootVisualizations) {
				for (const [_, handleNode] of Object.entries(rootVisualizations)) {
					if (handleNode.nodeKind === VisualNodeKind.FluidHandleNode) {
						await this.getDataVisualization(handleNode.fluidObjectId);
					}
				}
			}
		} catch (error) {
			console.error(
				"BaseDevtools: Failed to initialize data visualization monitoring:",
				error,
			);
		}
	}

	protected async getRootDataVisualizations(): Promise<
		Record<string, RootHandleNode> | undefined
	> {
		return this.dataVisualizer?.renderRootHandles() ?? undefined;
	}

	protected async getDataVisualization(
		fluidObjectId: FluidObjectId,
	): Promise<FluidObjectNode | undefined> {
		return this.dataVisualizer?.render(fluidObjectId) ?? undefined;
	}
}
