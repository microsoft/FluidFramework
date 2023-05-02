/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/container-utils";

import { ContainerDevtoolsProps, ContainerDevtools } from "./ContainerDevtools";
import { IContainerDevtools } from "./IContainerDevtools";
import {
	ContainerList,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	handleIncomingWindowMessage,
	InboundHandlers,
	ISourcedDevtoolsMessage,
	MessageLoggingOptions,
	postMessagesToWindow,
} from "./messaging";
import { IFluidDevtools } from "./IFluidDevtools";
import { ContainerMetadata } from "./ContainerMetadata";
import { DevtoolsFeature, DevtoolsFeatureFlags } from "./Features";
import { DevtoolsLogger } from "./DevtoolsLogger";
import { VisualizeSharedObject } from "./data-visualization";

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
 * Error text thrown when {@link FluidDevtools} operations are used after it has been disposed.
 *
 * @privateRemarks Exported for test purposes only.
 */
export const useAfterDisposeErrorText =
	"The devtools instance has been disposed. Further operations are invalid.";

/**
 * Error text thrown when a user attempts to register a {@link IContainerDevtools} instance for an ID that is already
 * registered with the {@link IFluidDevtools}.
 *
 * @privateRemarks Exported for test purposes only.
 */
export function getContainerAlreadyRegisteredErrorText(containerId: string): string {
	return (
		`A ContainerDevtools instance has already been registered for container ID "${containerId}".` +
		"Existing instance must be closed before a replacement may be registered."
	);
}

/**
 * Properties for configuring a {@link IFluidDevtools}.
 *
 * @public
 */
export interface FluidDevtoolsProps {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 *
	 * @remarks
	 *
	 * Note: {@link IFluidDevtools} does not register this logger with the Fluid runtime; that must be done separately.
	 *
	 * This is provided to the Devtools instance strictly to enable communicating supported / desired functionality with
	 * external listeners.
	 */
	logger?: DevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IFluidDevtools.registerContainerDevtools}.
	 */
	initialContainers?: ContainerDevtoolsProps[];

	/**
	 * (optional) Configurations for generating visual representations of
	 * {@link @fluidframework/shared-object-base#ISharedObject}s associated with individual Containers.
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
 * {@link IFluidDevtools} implementation.
 *
 * @remarks
 *
 * This class listens for incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for:**
 *
 * - {@link GetDevtoolsFeatures.Message}: When received, {@link DevtoolsFeatures.Message} will be posted in response.
 *
 * - {@link GetContainerList.Message}: When received, {@link ContainerList.Message} will be posted in response.
 *
 * TODO: Document others as they are added.
 *
 * **Messages it posts:**
 *
 * - {@link DevtoolsFeatures.Message}: Posted only when requested via {@link GetDevtoolsFeatures.Message}.
 *
 * - {@link ContainerList.Message}: Posted whenever the list of registered Containers changes, or when requested
 * (via {@link GetContainerList.Message}).
 *
 * TODO: Document others as they are added.
 */
export class FluidDevtools implements IFluidDevtools {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 */
	public readonly logger: DevtoolsLogger | undefined;

	/**
	 * Stores Container-level devtools instances registered with this object.
	 * Maps from Container IDs to the corresponding devtools instance.
	 */
	private readonly containers: Map<string, ContainerDevtools>;

	/**
	 * Global data visualizers to apply to all {@link IContainerDevtools} instances registered with this object.
	 *
	 * @remarks If the user specifies data visualizers alongside a specific Container, those will take precedence over these.
	 */
	private readonly dataVisualizers?: Record<string, VisualizeSharedObject>;

	/**
	 * Private {@link FluidDevtools.disposed} tracking.
	 */
	private _disposed: boolean;

	// #region Event handlers

	/**
	 * Handlers for inbound messages specific to FluidDevTools.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		[GetDevtoolsFeatures.MessageType]: () => {
			this.postSupportedFeatures();
			return true;
		},
		[GetContainerList.MessageType]: () => {
			this.postContainerList();
			return true;
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
			devtoolsMessageLoggingOptions,
		);
	};

	/**
	 * Posts {@link DevtoolsFeatures.Message} to the window (globalThis) with the set of features supported by
	 * this instance.
	 */
	private readonly postSupportedFeatures = (): void => {
		const supportedFeatures = this.getSupportedFeatures();
		postMessagesToWindow(
			devtoolsMessageLoggingOptions,
			DevtoolsFeatures.createMessage({
				features: supportedFeatures,
			}),
		);
	};

	/**
	 * Posts a {@link ContainerList.Message} to the window (globalThis).
	 */
	private readonly postContainerList = (): void => {
		const containers: ContainerMetadata[] = this.getAllContainerDevtools().map(
			(containerDevtools) => ({
				id: containerDevtools.containerId,
				nickname: containerDevtools.containerNickname,
			}),
		);

		postMessagesToWindow(
			devtoolsMessageLoggingOptions,
			ContainerList.createMessage({
				containers,
			}),
		);
	};

	// #endregion

	public constructor(props?: FluidDevtoolsProps) {
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

		this.logger = props?.logger;
		this.dataVisualizers = props?.dataVisualizers;

		// Register listener for inbound messages from the window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IFluidDevtools.registerContainerDevtools}
	 */
	public registerContainerDevtools(props: ContainerDevtoolsProps): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const { containerId, dataVisualizers: containerVisualizers } = props;

		if (this.containers.has(containerId)) {
			throw new UsageError(getContainerAlreadyRegisteredErrorText(containerId));
		}

		const dataVisualizers = mergeDataVisualizers(this.dataVisualizers, containerVisualizers);

		const containerDevtools = new ContainerDevtools({
			...props,
			dataVisualizers,
		});
		this.containers.set(containerId, containerDevtools);

		// Post message for container list change
		this.postContainerList();
	}

	/**
	 * {@inheritDoc IFluidDevtools.closeContainerDevtools}
	 */
	public closeContainerDevtools(containerId: string): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const containerDevtools = this.containers.get(containerId);
		if (containerDevtools === undefined) {
			console.warn(
				`No ContainerDevtools associated with container ID "${containerId}" was found.`,
			);
		} else {
			containerDevtools.dispose();
			this.containers.delete(containerId);

			// Post message for container list change
			this.postContainerList();
		}
	}

	/**
	 * Gets the registed Container Devtools associated with the provided Container ID, if one exists.
	 * Otherwise returns `undefined`.
	 */
	public getContainerDevtools(containerId: string): IContainerDevtools | undefined {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		return this.containers.get(containerId);
	}

	/**
	 * Gets all Container-level devtools instances.
	 */
	public getAllContainerDevtools(): readonly IContainerDevtools[] {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
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
			throw new UsageError(useAfterDisposeErrorText);
		}

		// Dispose of container-level devtools
		for (const [, containerDevtools] of this.containers) {
			containerDevtools.dispose();
		}
		this.containers.clear();

		// Notify listeners that the list of Containers changed.
		this.postContainerList();

		this._disposed = true;
	}

	/**
	 * Gets the set of features supported by this instance.
	 */
	private getSupportedFeatures(): DevtoolsFeatureFlags {
		return {
			[DevtoolsFeature.Telemetry]: this.logger !== undefined,
		};
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

/**
 * Merges an optional set of global visualizers with an optional set of Container-local visualizers, such that
 * Container-level visualizers take precedence when present.
 */
function mergeDataVisualizers(
	globalVisualizers?: Record<string, VisualizeSharedObject>,
	containerVisualizers?: Record<string, VisualizeSharedObject>,
): Record<string, VisualizeSharedObject> | undefined {
	if (globalVisualizers === undefined) {
		return containerVisualizers;
	}
	if (containerVisualizers === undefined) {
		return globalVisualizers;
	}
	return {
		...globalVisualizers,
		...containerVisualizers,
	};
}
