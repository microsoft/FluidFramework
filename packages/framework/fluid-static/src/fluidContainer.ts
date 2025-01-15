/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	AttachState,
	type ConnectionState,
	type ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	DisconnectReason,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import type { IEvent, IEventProvider, IFluidLoadable } from "@fluidframework/core-interfaces";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import type { ContainerAttachProps, ContainerSchema, IRootDataObject } from "./types.js";

/**
 * Extract the type of 'initialObjects' from the given {@link ContainerSchema} type.
 * @public
 */
export type InitialObjects<T extends ContainerSchema> = {
	// Construct a LoadableObjectRecord type by enumerating the keys of
	// 'ContainerSchema.initialObjects' and inferring the value type of each key.
	//
	// The '? TChannel : never' is required because infer can only be used in
	// a conditional 'extends' expression.
	[K in keyof T["initialObjects"]]: T["initialObjects"][K] extends SharedObjectKind<
		infer TChannel
	>
		? TChannel
		: never;
};

/**
 * Events emitted from {@link IFluidContainer}.
 *
 * @remarks Note: external implementations of this interface are not supported.
 * @sealed
 * @public
 */
export interface IFluidContainerEvents extends IEvent {
	/**
	 * Emitted when the {@link IFluidContainer} completes connecting to the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IFluidContainer.connectionState}
	 *
	 * - {@link IFluidContainer.connect}
	 */
	(event: "connected", listener: () => void): void;

	/**
	 * Emitted when the {@link IFluidContainer} becomes disconnected from the Fluid service.
	 *
	 * @remarks Reflects connection state changes against the (delta) service acknowledging ops/edits.
	 *
	 * @see
	 *
	 * - {@link IFluidContainer.connectionState}
	 *
	 * - {@link IFluidContainer.disconnect}
	 */
	(event: "disconnected", listener: () => void): void;

	/**
	 * Emitted when all local changes/edits have been acknowledged by the service.
	 *
	 * @remarks "dirty" event will be emitted when the next local change has been made.
	 *
	 * @see {@link IFluidContainer.isDirty}
	 */
	(event: "saved", listener: () => void): void;

	/**
	 * Emitted when the first local change has been made, following a "saved" event.
	 *
	 * @remarks "saved" event will be emitted once all local changes have been acknowledged by the service.
	 *
	 * @see {@link IFluidContainer.isDirty}
	 */
	(event: "dirty", listener: () => void): void;

	/**
	 * Emitted when the {@link IFluidContainer} is closed, which permanently disables it.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `error`: If the container was closed due to error (as opposed to an explicit call to
	 * {@link IFluidContainer.dispose}), this will contain details about the error that caused it.
	 */
	(event: "disposed", listener: (error?: ICriticalContainerError) => void);
}

/**
 * Provides an entrypoint into the client side of collaborative Fluid data.
 * Provides access to the data as well as status on the collaboration session.
 *
 * @typeparam TContainerSchema - Used to determine the type of 'initialObjects'.
 *
 * @remarks Note: external implementations of this interface are not supported.
 *
 * @sealed
 * @public
 */
export interface IFluidContainer<TContainerSchema extends ContainerSchema = ContainerSchema>
	extends IEventProvider<IFluidContainerEvents> {
	/**
	 * Provides the current connected state of the container
	 */
	readonly connectionState: ConnectionState;

	/**
	 * A container is considered **dirty** if it has local changes that have not yet been acknowledged by the service.
	 *
	 * @remarks
	 *
	 * You should always check the `isDirty` flag before closing the container or navigating away from the page.
	 * Closing the container while `isDirty === true` may result in the loss of operations that have not yet been
	 * acknowledged by the service.
	 *
	 * A container is considered dirty in the following cases:
	 *
	 * 1. The container has been created in the detached state, and either it has not been attached yet or it is
	 * in the process of being attached (container is in `attaching` state). If container is closed prior to being
	 * attached, host may never know if the file was created or not.
	 *
	 * 2. The container was attached, but it has local changes that have not yet been saved to service endpoint.
	 * This occurs as part of normal op flow where pending operation (changes) are awaiting acknowledgement from the
	 * service. In some cases this can be due to lack of network connection. If the network connection is down,
	 * it needs to be restored for the pending changes to be acknowledged.
	 */
	readonly isDirty: boolean;

	/**
	 * Whether or not the container is disposed, which permanently disables it.
	 */
	readonly disposed: boolean;

	/**
	 * The collection of data objects and Distributed Data Stores (DDSes) that were specified by the schema.
	 *
	 * @remarks These data objects and DDSes exist for the lifetime of the container.
	 */
	readonly initialObjects: InitialObjects<TContainerSchema>;

	/**
	 * The current attachment state of the container.
	 *
	 * @remarks
	 *
	 * Once a container has been attached, it remains attached.
	 * When loading an existing container, it will already be attached.
	 */
	readonly attachState: AttachState;

	/**
	 * A newly created container starts detached from the collaborative service.
	 * Calling `attach()` uploads the new container to the service and connects to the collaborative service.
	 *
	 * @remarks
	 *
	 * This should only be called when the container is in the
	 * {@link @fluidframework/container-definitions#AttachState.Detached} state.
	 *
	 * This can be determined by observing {@link IFluidContainer.attachState}.
	 *
	 * @returns A promise which resolves when the attach is complete, with the string identifier of the container.
	 */
	attach(props?: ContainerAttachProps): Promise<string>;

	/**
	 * Attempts to connect the container to the delta stream and process operations.
	 *
	 * @throws Will throw an error if connection is unsuccessful.
	 *
	 * @remarks
	 *
	 * This should only be called when the container is in the
	 * {@link @fluidframework/container-definitions#(ConnectionState:namespace).Disconnected} state.
	 *
	 * This can be determined by observing {@link IFluidContainer.connectionState}.
	 */
	connect(): void;

	/**
	 * Disconnects the container from the delta stream and stops processing operations.
	 *
	 * @remarks
	 *
	 * This should only be called when the container is in the
	 * {@link @fluidframework/container-definitions#(ConnectionState:namespace).Connected} state.
	 *
	 * This can be determined by observing {@link IFluidContainer.connectionState}.
	 */
	disconnect(): void;

	/**
	 * Create a new data object or Distributed Data Store (DDS) of the specified type.
	 *
	 * @param objectClass - The class of the `DataObject` or `SharedObject` to create.
	 *
	 * @typeParam T - The class of the `DataObject` or `SharedObject`.
	 *
	 * @remarks
	 *
	 * In order to share the data object or DDS with other collaborators and retrieve it later,
	 * store its handle in a collection like a SharedDirectory from your initialObjects.
	 * It's typically a good idea to set any initial state on the object before doing so,
	 * as it is both more efficient and helpful to maintain domain model invariants
	 * (e.g. this approach easily allows state to only be set once).
	 *
	 * @example
	 *
	 * ```typescript
	 * const existingDirectory = container.initialObjects.myDirectory;
	 * const map = await container.create(SharedMap);
	 * map.set("initialState", "someValue");
	 * existingDirectory.set("myMap", map.handle);
	 * ```
	 */
	create<T extends IFluidLoadable>(objectClass: SharedObjectKind<T>): Promise<T>;

	/**
	 * Dispose of the container instance, permanently disabling it.
	 */
	dispose(): void;
}

/**
 * Internal interface for {@link IFluidContainer}.
 *
 * @internal
 */
export interface IFluidContainerInternal {
	/**
	 * The underlying {@link @fluidframework/container-definitions#IContainer}.
	 *
	 * @remarks Used to power debug tooling and experimental features.
	 */
	readonly container: IContainer;
}

/**
 * Creates an {@link IFluidContainer} from the provided `container` and `rootDataObject`.
 *
 * @internal
 */
export function createFluidContainer<
	TContainerSchema extends ContainerSchema = ContainerSchema,
>(props: {
	container: IContainer;
	rootDataObject: IRootDataObject;
}): IFluidContainer<TContainerSchema> {
	return new FluidContainer<TContainerSchema>(props.container, props.rootDataObject);
}

/**
 * Check that the provided `container` is an internal {@link IFluidContainerInternal}.
 *
 * @internal
 */
export function isInternalFluidContainer<TContainerSchema extends ContainerSchema>(
	container: IFluidContainer<TContainerSchema> | IFluidContainerInternal,
): container is IFluidContainerInternal {
	// IFluidContainer is sealed; so we never expect an `IFluidContainer` not to be
	// `IFluidContainerInternal` implemented by `FluidContainer`. To be caution,
	// we use `instanceof` to confirm.
	return container instanceof FluidContainer;
}

/**
 * {@link IFluidContainer} implementation.
 *
 * @typeparam TContainerSchema - Used to determine the type of 'initialObjects'.
 * @remarks
 *
 * Note: this implementation is not complete. Consumers who rely on {@link IFluidContainer.attach}
 * will need to utilize or provide a service-specific implementation of this type that implements that method.
 */
class FluidContainer<TContainerSchema extends ContainerSchema = ContainerSchema>
	extends TypedEventEmitter<IFluidContainerEvents>
	implements IFluidContainer<TContainerSchema>, IFluidContainerInternal
{
	private readonly connectedHandler = (): boolean => this.emit("connected");
	private readonly disconnectedHandler = (): boolean => this.emit("disconnected");
	private readonly disposedHandler = (error?: ICriticalContainerError): boolean =>
		this.emit("disposed", error);
	private readonly savedHandler = (): boolean => this.emit("saved");
	private readonly dirtyHandler = (): boolean => this.emit("dirty");

	public constructor(
		public readonly container: IContainer,
		private readonly rootDataObject: IRootDataObject,
	) {
		super();
		container.on("connected", this.connectedHandler);
		container.on("closed", this.disposedHandler);
		container.on("disconnected", this.disconnectedHandler);
		container.on("saved", this.savedHandler);
		container.on("dirty", this.dirtyHandler);
	}

	public get isDirty(): boolean {
		return this.container.isDirty;
	}

	public get attachState(): AttachState {
		return this.container.attachState;
	}

	public get disposed(): boolean {
		return this.container.closed;
	}

	public get connectionState(): ConnectionState {
		return this.container.connectionState;
	}

	public get initialObjects(): InitialObjects<TContainerSchema> {
		return this.rootDataObject.initialObjects as InitialObjects<TContainerSchema>;
	}

	/**
	 * Incomplete base implementation of {@link IFluidContainer.attach}.
	 *
	 * @remarks
	 *
	 * Note: this implementation will unconditionally throw.
	 * Consumers who rely on this will need to utilize or provide a service specific implementation of this base type
	 * that provides an implementation of this method.
	 *
	 * The reason is because externally we are presenting a separation between the service and the `FluidContainer`,
	 * but internally this separation is not there.
	 */
	public async attach(props?: ContainerAttachProps): Promise<string> {
		if (this.container.attachState !== AttachState.Detached) {
			throw new Error("Cannot attach container. Container is not in detached state.");
		}
		throw new Error("Cannot attach container. Attach method not provided.");
	}

	public async connect(): Promise<void> {
		this.container.connect?.();
	}

	public async disconnect(): Promise<void> {
		this.container.disconnect?.();
	}

	public async create<T extends IFluidLoadable>(objectClass: SharedObjectKind<T>): Promise<T> {
		return this.rootDataObject.create(objectClass);
	}

	public dispose(): void {
		this.container.close(DisconnectReason.Expected);
		this.container.off("connected", this.connectedHandler);
		this.container.off("closed", this.disposedHandler);
		this.container.off("disconnected", this.disconnectedHandler);
		this.container.off("saved", this.savedHandler);
		this.container.off("dirty", this.dirtyHandler);
	}
}
