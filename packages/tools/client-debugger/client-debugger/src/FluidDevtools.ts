/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";

import { ContainerDevtoolsProps, ContainerDevtools } from "./ContainerDevtools";
import { IContainerDevtools } from "./IContainerDevtools";
import {
	ContainerListMessage,
	handleIncomingWindowMessage,
	ISourcedDebuggerMessage,
	InboundHandlers,
	MessageLoggingOptions,
	postMessagesToWindow,
} from "./messaging";
import { FluidDevtoolsEvents, IFluidDevtools } from "./IFluidDevtools";
import { ContainerMetadata } from "./ContainerMetadata";

// TODOs:
// - Devtools disposal
// - Clear devtools on `window.beforeunload`, to ensure we do not hold onto stale resources.

/**
 * Message logging options used by the root devtools.
 */
const devtoolsMessageLoggingOptions: MessageLoggingOptions = {
	context: "Fluid Devtools",
};

/**
 * Properties for configuring a {@link FluidDevtools}.
 *
 * @public
 */
export interface FluidDevtoolsProps {
	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IFluidDevtools.registerContainer}.
	 */
	initialContainers?: ContainerDevtoolsProps[];
}

/**
 * {@link IFluidDevtools} implementation.
 *
 * @remarks
 *
 * This class listens for incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for:**
 *
 * - {@link GetContainerListMessage}: When received, {@link ContainerListMessage} will be posted in response.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link ContainerListMessage}: Posted whenever the list of registered
 * containers changes, or when requested (via {@link GetContainerListMessage}).
 *
 * TODO: Document others as they are added.
 *
 * @internal
 */
export class FluidDevtools
	extends TypedEventEmitter<FluidDevtoolsEvents>
	implements IFluidDevtools
{
	/**
	 * Stores Container-level devtools instances registered with this object.
	 * Maps from Container IDs to the corresponding devtools instance.
	 */
	private readonly containers: Map<string, ContainerDevtools>;

	/**
	 * Private {@link FluidDevtools.disposed} tracking.
	 */
	private _disposed: boolean;

	// #region Event handlers

	/**
	 * Handlers for inbound messages specific to FluidDevTools.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		["GET_CONTAINER_LIST"]: () => {
			this.postContainerList();
			return true;
		},
	};

	/**
	 * Event handler for messages coming from the window (globalThis).
	 */
	private readonly windowMessageHandler = (
		event: MessageEvent<Partial<ISourcedDebuggerMessage>>,
	): void => {
		handleIncomingWindowMessage(
			event,
			this.inboundMessageHandlers,
			devtoolsMessageLoggingOptions,
		);
	};

	/**
	 * Posts a {@link ContainerListMessage} to the window (globalThis).
	 */
	private readonly postContainerList = (): void => {
		const containers: ContainerMetadata[] = this.getAllContainerDevtools().map(
			(containerDevtools) => ({
				id: containerDevtools.containerId,
				nickname: containerDevtools.containerNickname,
			}),
		);

		postMessagesToWindow<ContainerListMessage>(devtoolsMessageLoggingOptions, {
			type: "CONTAINER_LIST",
			data: {
				containers,
			},
		});
	};

	// #endregion

	public constructor(props?: FluidDevtoolsProps) {
		super();

		// Populate initial Container-level devtools
		this.containers = new Map<string, ContainerDevtools>();
		if (props?.initialContainers !== undefined) {
			for (const containerConfig of props.initialContainers) {
				this.containers.set(
					containerConfig.containerId,
					new ContainerDevtools(containerConfig),
				);
			}
		}

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);

		// Initiate message posting of container list updates.
		this.on("containerRegistered", this.postContainerList);
		this.on("containerDevtoolsClosed", this.postContainerList);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IFluidDevtools.registerContainer}
	 */
	public registerContainer(props: ContainerDevtoolsProps): void {
		if (this.disposed) {
			throw new UsageError(
				"The Devtools has been disposed. Cannot register a new Container.",
			);
		}

		const { containerId } = props;
		const existingDebugger = this.containers.get(containerId);
		if (existingDebugger !== undefined) {
			console.warn(
				`Active debugger registry already contains an entry for container ID "${containerId}". Override existing entry.`,
			);
			existingDebugger.dispose();
		}

		const containerDevtools = new ContainerDevtools(props);
		this.containers.set(containerId, containerDevtools);
		this.emit("containerRegistered", containerId, containerDevtools);
	}

	/**
	 * {@inheritDoc IFluidDevtools.closeContainerDevtools}
	 */
	public closeContainerDevtools(containerId: string): void {
		if (this.disposed) {
			throw new UsageError(
				"The Devtools has been disposed. All Container Devtools instances have already been closed.",
			);
		}

		const containerDevtools = this.containers.get(containerId);
		if (containerDevtools === undefined) {
			console.warn(
				`No ContainerDevtools associated with container ID "${containerId}" was found.`,
			);
		} else {
			containerDevtools.dispose();
			this.containers.delete(containerId);
			this.emit("containerDevtoolsClosed", containerId);
		}
	}

	/**
	 * {@inheritDoc IFluidDevtools.getContainerDevtools}
	 */
	public getContainerDevtools(containerId: string): IContainerDevtools | undefined {
		if (this.disposed) {
			throw new UsageError("The Devtools has been disposed.");
		}

		return this.containers.get(containerId);
	}

	/**
	 * {@inheritDoc IFluidDevtools.getAllContainerDevtools}
	 */
	public getAllContainerDevtools(): readonly IContainerDevtools[] {
		if (this.disposed) {
			throw new UsageError("The Devtools has been disposed.");
		}

		return [...this.containers.values()];
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.dispose}
	 */
	public dispose(): void {
		if (this.disposed) {
			throw new UsageError("The Devtools have already been disposed.");
		}

		// Dispose of container-level devtools
		for (const [containerId, containerDevtools] of this.containers) {
			containerDevtools.dispose();
			this.emit("containerDevtoolsClosed", containerId);
		}
		this.containers.clear();
		this.postContainerList(); // Notify listeners that the list of Containers changed.

		// Notify listeners that the devtools have been disposed.
		this.emit("devtoolsDisposed");

		this._disposed = true;
	}
}

/**
 * Initializes a {@link IFluidDevtools}.
 *
 * @remarks The consumer takes ownership of this object, and is responsible for disposing of it when appropriate.
 *
 * @privateRemarks This is exposed as a static function to avoid exporting {@link FluidDevtools} publicly.
 *
 * @public
 */
export function initializeFluidDevtools(props?: FluidDevtoolsProps): IFluidDevtools {
	return new FluidDevtools(props);
}
