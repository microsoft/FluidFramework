/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAudience } from "@fluidframework/container-definitions";
import type {
	AttachState,
	IContainerEvents,
	ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";

/**
 * A lightweight abstraction of {@link @fluidframework/container-definitions/internal#IContainer} that provides
 * only the essential properties and methods needed for Fluid DevTools functionality.
 *
 * @alpha
 */
export interface DecomposedIContainer extends IEventProvider<IContainerEvents> {
	/**
	 * The audience associated with this container.
	 */
	readonly audience: IAudience;

	/**
	 * The unique identifier for the current client in this container session.
	 * @remarks Optional since it is also optional in {@link @fluidframework/container-definitions#IContainer}
	 */
	readonly clientId?: string | undefined;

	/**
	 * The current attachment state of the container.
	 */
	readonly attachState: AttachState;

	/**
	 * The current connection state of the container.
	 */
	readonly connectionState: ConnectionState;

	/**
	 * Whether the container has been closed.
	 */
	readonly closed: boolean;

	/**
	 * Attempts to connect the container to the service.
	 * @remarks Optional since it does not exist in {@link @fluidframework/datastore-definitions/internal#IFluidDataStoreRuntimeEvents}
	 */
	connect?(): void;

	/**
	 * Disconnects the container from the service.
	 * @remarks Optional since it does not exist in {@link @fluidframework/datastore-definitions/internal#IFluidDataStoreRuntimeEvents}
	 */
	disconnect?(): void;

	/**
	 * Closes the container, optionally with an error.
	 * @remarks Optional since it does not exist in {@link @fluidframework/datastore-definitions/internal#IFluidDataStoreRuntimeEvents}
	 */
	close?(error?: ICriticalContainerError): void;
}

/**
 * Implementation of {@link DecomposedIContainer} that wraps an {@link IFluidDataStoreRuntime}.
 * This class provides a bridge between {@link IFluidDataStoreRuntime} and the devtools system by exposing runtime properties and events as {@link IContainer} interfaces.
 *
 * @alpha
 */
export class DecomposedContainer
	extends TypedEventEmitter<IContainerEvents>
	implements DecomposedIContainer
{
	public constructor(runtime: IFluidDataStoreRuntime) {
		super();
		this.runtime = runtime;
		// TODO: Figure out how to handle "closed" state.
		runtime.on("attached", this.attachedHandler);
		runtime.on("connected", this.connectedHandler);
		runtime.on("disconnected", this.disconnectedHandler);
		runtime.on("dispose", this.disposedHandler);
	}

	private readonly attachedHandler = (): boolean => this.emit("attached");
	private readonly connectedHandler = (clientId: string): boolean =>
		this.emit("connected", clientId);
	private readonly disconnectedHandler = (): boolean => this.emit("disconnected");
	private readonly disposedHandler = (error?: ICriticalContainerError): boolean =>
		this.emit("disposed", error);

	private readonly runtime: IFluidDataStoreRuntime;

	public get audience(): IAudience {
		return this.runtime.getAudience();
	}

	public get clientId(): string | undefined {
		return this.runtime.clientId;
	}

	public get attachState(): AttachState {
		return this.runtime.attachState;
	}

	public get connectionState(): ConnectionState {
		// TODO: Figure out if this is an accurate representation of the connection state.
		return this.runtime.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
	}

	public get closed(): boolean {
		return !this.runtime.connected;
	}
}
