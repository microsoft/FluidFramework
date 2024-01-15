/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils";

import { type ContainerDevtoolsProps, ContainerDevtools } from "./ContainerDevtools";
import { type IContainerDevtools } from "./IContainerDevtools";
import {
	ContainerList,
	DevtoolsDisposed,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	handleIncomingWindowMessage,
	type InboundHandlers,
	type ISourcedDevtoolsMessage,
	type MessageLoggingOptions,
	postMessagesToWindow,
} from "./messaging";
import { type IFluidDevtools } from "./IFluidDevtools";
import { type DevtoolsFeatureFlags } from "./Features";
import { type IDevtoolsLogger } from "./DevtoolsLogger";
import { type ContainerKey } from "./CommonInterfaces";
import { pkgVersion as devtoolsVersion } from "./packageVersion";

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
 * Error text thrown when {@link FluidDevtools.getOrThrow} is called before the Devtools have been initialized.
 *
 * @privateRemarks Exported for test purposes only.
 */
export const accessBeforeInitializeErrorText = "Devtools have not yet been initialized.";

/**
 * Error text thrown when a user attempts to register a {@link IContainerDevtools} instance for an ID that is already
 * registered with the {@link IFluidDevtools}.
 *
 * @privateRemarks Exported for test purposes only.
 */
export function getContainerAlreadyRegisteredErrorText(containerKey: ContainerKey): string {
	return (
		`A ContainerDevtools instance has already been registered for specified key: "${containerKey}".` +
		"Existing instance must be closed before a replacement may be registered."
	);
}

/**
 * Properties for configuring the Devtools.
 * @internal
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
	logger?: IDevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IFluidDevtools.registerContainerDevtools}.
	 */
	initialContainers?: ContainerDevtoolsProps[];

	// TODO: Add ability for customers to specify custom data visualizer overrides
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
 *
 * @sealed
 */
export class FluidDevtools implements IFluidDevtools {
	/**
	 * (optional) Telemetry logger associated with the Fluid runtime.
	 */
	public readonly logger: IDevtoolsLogger | undefined;

	/**
	 * Stores Container-level devtools instances registered with this object.
	 * Maps from a {@link ContainerKey} to the corresponding {@link ContainerDevtools} instance.
	 */
	private readonly containers: Map<ContainerKey, ContainerDevtools>;

	/**
	 * Private {@link FluidDevtools.disposed} tracking.
	 */
	private _disposed: boolean;

	// #region Event handlers

	/**
	 * Handlers for inbound messages specific to FluidDevTools.
	 */
	private readonly inboundMessageHandlers: InboundHandlers = {
		[GetDevtoolsFeatures.MessageType]: async () => {
			this.postSupportedFeatures();
			return true;
		},
		[GetContainerList.MessageType]: async () => {
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
	 * Event handler for the window (globalThis) `beforeUnload` event.
	 * Disposes of the Devtools instance (which also clears the global singleton).
	 */
	private readonly windowBeforeUnloadHandler = (): void => {
		this.dispose();
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
				devtoolsVersion,
			}),
		);
	};

	/**
	 * Posts a {@link ContainerList.Message} to the window (globalThis).
	 */
	private readonly postContainerList = (): void => {
		const containers: ContainerKey[] = this.getAllContainerDevtools().map(
			(containerDevtools) => containerDevtools.containerKey,
		);

		postMessagesToWindow(
			devtoolsMessageLoggingOptions,
			ContainerList.createMessage({
				containers,
			}),
		);
	};

	// #endregion

	/**
	 * Singleton instance.
	 */
	private static I: FluidDevtools | undefined;

	private constructor(props?: FluidDevtoolsProps) {
		// Populate initial Container-level devtools
		this.containers = new Map<string, ContainerDevtools>();
		if (props?.initialContainers !== undefined) {
			for (const containerConfig of props.initialContainers) {
				this.containers.set(
					containerConfig.containerKey,
					new ContainerDevtools(containerConfig),
				);
			}
		}

		this.logger = props?.logger;

		// Register listener for inbound messages from the Window (globalThis)
		globalThis.addEventListener?.("message", this.windowMessageHandler);

		// Register the devtools instance to be disposed on Window unload
		globalThis.addEventListener?.("beforeunload", this.windowBeforeUnloadHandler);

		// Post message for supported features
		this.postSupportedFeatures();

		this._disposed = false;
	}

	/**
	 * Creates and returns the FluidDevtools singleton.
	 *
	 * @remarks
	 *
	 * If the singleton has already been initialized, a warning will be logged and the existing instance will
	 * be returned.
	 */
	public static initialize(props?: FluidDevtoolsProps): FluidDevtools {
		if (FluidDevtools.I === undefined) {
			FluidDevtools.I = new FluidDevtools(props);
		} else {
			console.warn(
				"Devtools have already been initialized. " +
					"Existing Devtools instance must be disposed before new ones may be initialized. " +
					"Returning existing Devtools instance.",
			);
		}

		return FluidDevtools.I;
	}

	/**
	 * Gets the Devtools singleton if it has been initialized, otherwise throws.
	 */
	public static getOrThrow(): FluidDevtools {
		if (FluidDevtools.I === undefined) {
			throw new UsageError(accessBeforeInitializeErrorText);
		}
		return FluidDevtools.I;
	}

	/**
	 * Gets the Devtools singleton if it has been initialized, otherwise returns `undefined`.
	 */
	public static tryGet(): FluidDevtools | undefined {
		return FluidDevtools.I;
	}

	/**
	 * {@inheritDoc IFluidDevtools.registerContainerDevtools}
	 */
	public registerContainerDevtools(props: ContainerDevtoolsProps): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const { containerKey } = props;

		if (this.containers.has(containerKey)) {
			throw new UsageError(getContainerAlreadyRegisteredErrorText(containerKey));
		}

		const containerDevtools = new ContainerDevtools({
			...props,
		});
		this.containers.set(containerKey, containerDevtools);

		// Post message for container list change
		this.postContainerList();
	}

	/**
	 * {@inheritDoc IFluidDevtools.closeContainerDevtools}
	 */
	public closeContainerDevtools(containerKey: ContainerKey): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const containerDevtools = this.containers.get(containerKey);
		if (containerDevtools === undefined) {
			console.warn(`No ContainerDevtools associated with key "${containerKey}" was found.`);
		} else {
			containerDevtools.dispose();
			this.containers.delete(containerKey);

			// Post message for container list change
			this.postContainerList();
		}
	}

	/**
	 * Gets the registered Container Devtools associated with the provided {@link ContainerKey}, if one exists.
	 * Otherwise returns `undefined`.
	 */
	public getContainerDevtools(containerKey: ContainerKey): IContainerDevtools | undefined {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		return this.containers.get(containerKey);
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
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.dispose}
	 */
	public dispose(): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		// Send close devtool message
		postMessagesToWindow(devtoolsMessageLoggingOptions, DevtoolsDisposed.createMessage());

		// Dispose of container-level devtools
		for (const [, containerDevtools] of this.containers) {
			containerDevtools.dispose();
		}
		this.containers.clear();

		// Notify listeners that the list of Containers changed.
		this.postContainerList();

		// Clear the singleton so a new one may be initialized.
		FluidDevtools.I = undefined;

		// Clean up event listeners
		globalThis.removeEventListener?.("message", this.windowMessageHandler);
		globalThis.removeEventListener?.("beforeunload", this.windowBeforeUnloadHandler);

		this._disposed = true;
	}

	/**
	 * Gets the set of features supported by this instance.
	 */
	private getSupportedFeatures(): DevtoolsFeatureFlags {
		return {
			telemetry: this.logger !== undefined,
			// Most work completed, but not ready to completely enable.
			opLatencyTelemetry: true,
		};
	}
}

/**
 * Initializes the Devtools singleton and returns a handle to it.
 *
 * @remarks
 *
 * The instance is tracked as a static singleton.
 *
 * It is automatically disposed on webpage unload, but it can be closed earlier by calling `dispose`
 * on the returned handle.
 * @internal
 */
export function initializeDevtools(props?: FluidDevtoolsProps): IFluidDevtools {
	return FluidDevtools.initialize(props);
}
