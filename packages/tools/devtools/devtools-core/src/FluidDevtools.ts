/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ContainerKey } from "./CommonInterfaces.js";
import { ContainerDevtools, type ContainerDevtoolsProps } from "./ContainerDevtools.js";
import { DataObjectDevtools, type DataObjectProps } from "./DataObjectDevtools.js";
import { DecomposedContainerForDataStore } from "./DecomposedContainer.js";
import type { IDevtoolsLogger } from "./DevtoolsLogger.js";
import type { DevtoolsFeatureFlags } from "./Features.js";
import type { IContainerDevtools } from "./IContainerDevtools.js";
import type { IFluidDevtools } from "./IFluidDevtools.js";
import {
	ContainerList,
	DevtoolsDisposed,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	RemoveContainer,
	SetUnsampledTelemetry,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	type MessageLoggingOptions,
	handleIncomingWindowMessage,
	postMessagesToWindow,
} from "./messaging/index.js";
import { pkgVersion as devtoolsVersion } from "./packageVersion.js";

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
 * Key for sessionStorage that's used to toggle unsampled telemetry.
 */
const unsampledTelemetryKey = "Fluid.Telemetry.DisableSampling";

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
 * @alpha
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
 * -{@link SetUnsampledTelemetry.Message}: When received, the unsampled telemetry flag will be toggled.
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
	 * Stores DataObject-level devtools instances registered with this object.
	 * Maps from a {@link ContainerKey} to the corresponding {@link DataObjectDevtools} instance.
	 */
	private readonly dataObjects: Map<ContainerKey, DataObjectDevtools>;

	// Track data object instances to assign sequential numbers
	private readonly dataObjectInstanceCounts = new Map<string, number>();

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
		[SetUnsampledTelemetry.MessageType]: async (message) => {
			const newValue = (message as SetUnsampledTelemetry.Message).data.unsampledTelemetry;
			globalThis.sessionStorage?.setItem(unsampledTelemetryKey, String(newValue));
			this.postSupportedFeatures();
			window.location.reload();
			return true;
		},
		[RemoveContainer.MessageType]: async (untypedMessage) => {
			const message = untypedMessage as RemoveContainer.Message;
			const containerKey = message.data.containerKey;

			// Check if it's a container or data object and remove accordingly
			if (this.containers.has(containerKey)) {
				this.removeContainer(containerKey);
			} else if (this.dataObjects.has(containerKey)) {
				this.removeDataObject(containerKey);
			} else {
				console.warn(
					`No container or data object found with key "${containerKey}" to remove.`,
				);
			}
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
		const unsampledTelemetry =
			globalThis.sessionStorage?.getItem(unsampledTelemetryKey) === "true";
		postMessagesToWindow(
			devtoolsMessageLoggingOptions,
			DevtoolsFeatures.createMessage({
				features: supportedFeatures,
				devtoolsVersion,
				unsampledTelemetry,
			}),
		);
	};

	/**
	 * Posts a {@link ContainerList.Message} to the window (globalThis).
	 */
	private readonly postContainerList = (): void => {
		const containers: ContainerKey[] = this.getAllContainers().map(
			(container) => container.containerKey,
		);
		const dataObjects: ContainerKey[] = this.getAllDataObjects().map(
			(dataObject) => dataObject.containerKey,
		);

		postMessagesToWindow(
			devtoolsMessageLoggingOptions,
			ContainerList.createMessage({
				containers,
				dataObjects,
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
		this.containers = new Map<ContainerKey, ContainerDevtools>();
		this.dataObjects = new Map<ContainerKey, DataObjectDevtools>();
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

		const containerDevtools = new ContainerDevtools(props);
		this.containers.set(containerKey, containerDevtools);

		// Post message for container list change
		this.postContainerList();
	}

	public async registerContainerRuntimeDevtools(props: {
		runtime: IContainerRuntime;
		label: string;
	}): Promise<void> {
		const { runtime, label } = props;

		const containerRuntimeKey = this.generateReadableKey(runtime, label);
		const extractedContainerRuntimeData =
			await FluidDevtools.extractContainerDataFromRuntime(runtime);

		const decomposedContainer = new DecomposedContainerForDataStore(
			runtime as unknown as IFluidDataStoreRuntime,
		);

		// Check if the data object is already registered.
		if (this.containers.has(containerRuntimeKey)) {
			throw new UsageError(getContainerAlreadyRegisteredErrorText(containerRuntimeKey));
		}

		const dataObjectDevtools = new DataObjectDevtools({
			containerKey: containerRuntimeKey,
			container: decomposedContainer,
			containerData: extractedContainerRuntimeData,
		});
		this.dataObjects.set(containerRuntimeKey, dataObjectDevtools);

		this.postContainerList();
	}

	/**
	 * Registers a data object with the devtools.
	 *
	 */
	public registerDataObject(props: DataObjectProps): void {
		const { dataObject, label } = props;

		// Generate a readable key with sequential numbering
		const dataObjectKey = this.generateReadableKey(dataObject, label);

		const decomposedContainer = new DecomposedContainerForDataStore(
			(dataObject as unknown as { runtime: IFluidDataStoreRuntime }).runtime,
		);

		// Check if the data object is already registered.
		if (this.containers.has(dataObjectKey)) {
			throw new UsageError(getContainerAlreadyRegisteredErrorText(dataObjectKey));
		}

		const dataObjectDevtools = new DataObjectDevtools({
			containerKey: dataObjectKey,
			container: decomposedContainer,
			containerData: { appData: dataObject },
		});
		this.dataObjects.set(dataObjectKey, dataObjectDevtools);

		this.postContainerList();
	}

	/**
	 * Helper method to extract container data from IContainerRuntime for visualization.
	 * This method attempts to access the entry point data store from the runtime.
	 *
	 * @param containerRuntime - The container runtime to extract data from
	 * @returns A record of data store names to IFluidLoadable objects, or undefined if no data can be extracted
	 */
	public static async extractContainerDataFromRuntime(
		containerRuntime: IContainerRuntime,
	): Promise<Record<string, IFluidLoadable> | undefined> {
		try {
			// Get the entry point from the container runtime
			// Cast to access getEntryPoint method which exists on the concrete implementation
			const runtimeWithEntryPoint = containerRuntime as IContainerRuntime & {
				getEntryPoint(): Promise<IFluidLoadable>;
			};

			if (
				typeof runtimeWithEntryPoint.scope === "object" &&
				typeof runtimeWithEntryPoint.getEntryPoint === "function"
			) {
				const entryPoint = await runtimeWithEntryPoint.getEntryPoint();
				if (entryPoint !== undefined) {
					console.log("entryPoint", entryPoint);
					return {
						entryPoint,
					};
				}
			}
		} catch (error) {
			console.warn("Could not extract container data from runtime:", error);
		}

		return undefined;
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
	 * Gets all container devtools instances (not data objects).
	 */
	public getAllContainers(): readonly ContainerDevtools[] {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		return [...this.containers.values()];
	}

	/**
	 * Gets all data object devtools instances (not containers).
	 */
	public getAllDataObjects(): readonly DataObjectDevtools[] {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		return [...this.dataObjects.values()];
	}

	/**
	 * Checks if a container was registered as a data object.
	 * @param containerKey - The container key to check.
	 * @returns `true` if the container was registered via `registerDataObject`, `false` otherwise.
	 */
	public isDataObject(containerKey: ContainerKey): boolean {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		return this.dataObjects.has(containerKey);
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
		this.dataObjects.clear();

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
		const hasDataObjects = this.hasDataObjects();

		return {
			telemetry: this.logger !== undefined,
			// Most work completed, but not ready to completely enable.
			opLatencyTelemetry: true,
			// Enable dataObjects feature if there are data objects registered allowing both containers and data objects to coexist.
			dataObjects: hasDataObjects,
		};
	}

	/**
	 * Checks if any {@link ContainerDevtools} instances were registered using {@link IFluidDevtools.registerDataObject}.
	 * @returns `true` if data objects are registered, `false` otherwise.
	 */
	private hasDataObjects(): boolean {
		return this.dataObjects.size > 0;
	}

	/**
	 * Removes a container devtools instance from the devtools instance.
	 * @param containerKey - The key of the container to remove.
	 */
	private removeContainer(containerKey: ContainerKey): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const containerDevtools = this.containers.get(containerKey);
		if (containerDevtools === undefined) {
			console.warn(`No ContainerDevtools associated with key "${containerKey}" was found.`);
			return;
		}

		containerDevtools.dispose();
		this.containers.delete(containerKey);

		// Post message for container list change
		this.postContainerList();
	}

	/**
	 * Removes a data object devtools instance from the devtools instance.
	 * @param containerKey - The key of the data object to remove.
	 */
	private removeDataObject(containerKey: ContainerKey): void {
		if (this.disposed) {
			throw new UsageError(useAfterDisposeErrorText);
		}

		const dataObjectDevtools = this.dataObjects.get(containerKey);
		if (dataObjectDevtools === undefined) {
			console.warn(`No DataObjectDevtools associated with key "${containerKey}" was found.`);
			return;
		}

		dataObjectDevtools.dispose();
		this.dataObjects.delete(containerKey);

		// Post message for container list change
		this.postContainerList();
	}

	/**
	 * Generates a readable key for a data object using package path and sequential numbering.
	 */
	private generateReadableKey(dataObject: object, label?: string): string {
		// Use label if provided, otherwise use package path
		const baseKey =
			label ??
			(
				dataObject as unknown as { context?: IFluidDataStoreContext }
			).context?.packagePath?.join("/") ??
			"Container-Runtime";

		// Get the next number for this base key
		const nextNumber = (this.dataObjectInstanceCounts.get(baseKey) ?? 0) + 1;
		this.dataObjectInstanceCounts.set(baseKey, nextNumber);

		return `${baseKey}-${nextNumber}`;
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
 * @alpha
 */
export function initializeDevtools(props?: FluidDevtoolsProps): IFluidDevtools {
	return FluidDevtools.initialize(props);
}

/**
 * Gets the Devtools singleton if it has been {@link initializeDevtools | initialized}, otherwise returns `undefined`.
 * @alpha
 */
export function tryGetFluidDevtools(): IFluidDevtools | undefined {
	return FluidDevtools.tryGet();
}
