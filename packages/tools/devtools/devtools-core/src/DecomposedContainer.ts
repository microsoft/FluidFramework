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
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IEventProvider } from "@fluidframework/core-interfaces";

/**
 * Container state modification methods that must be implemented together.
 */
export interface ContainerStateModifications {
	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connect}
	 */
	connect(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.disconnect}
	 */
	disconnect(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.close}
	 */
	close(error?: ICriticalContainerError): void;
}

/**
 * Base interface for container properties that are always required.
 */
export interface DecomposedContainerBase extends IEventProvider<IContainerEvents> {
	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.audience}
	 */
	readonly audience: IAudience;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.clientId}
	 */
	readonly clientId?: string | undefined;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.attachState}
	 */
	readonly attachState: AttachState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connectionState}
	 */
	readonly connectionState: ConnectionState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.closed}
	 */
	readonly closed: boolean;
}

/**
 * A lightweight abstraction of a container that provides
 * only the essential properties and methods needed for Fluid DevTools functionality.
 *
 * Note: State modification methods (connect, disconnect, close) must be implemented together or not at all to ensure type safety.
 */
export type DecomposedContainer = DecomposedContainerBase &
	(ContainerStateModifications | { _: never });

/**
 * Implementation of {@link DecomposedContainer} that wraps an {@link @fluidframework/container-runtime-definitions/internal#IContainerRuntime}.
 * This class provides a bridge between {@link @fluidframework/container-runtime-definitions/internal#IContainerRuntime} and the devtools system by exposing runtime properties and events.
 */
export class DecomposedContainerForContainerRuntime
	extends TypedEventEmitter<IContainerEvents>
	implements DecomposedContainerBase
{
	private _disposed = false; // Track actual disposed state
	public readonly _: never = undefined as never;

	public constructor(runtime: IContainerRuntime) {
		super();
		this.runtime = runtime;
		/*
		 * Note: IContainerRuntime doesn't emit "closed" events like IContainer does
		 * Only bind to events that IContainerRuntime actually supports
		 */
		runtime.on("attached", this.attachedHandler);
		runtime.on("connected", this.connectedHandler);
		runtime.on("disconnected", this.disconnectedHandler);
		runtime.on("dispose", this.disposedHandler);
	}

	private readonly attachedHandler = (): boolean => this.emit("attached");
	private readonly connectedHandler = (clientId: string): boolean =>
		this.emit("connected", clientId);
	private readonly disconnectedHandler = (): boolean => this.emit("disconnected");
	private readonly disposedHandler = (): boolean => {
		this._disposed = true;
		return this.emit("disposed");
	};

	private readonly runtime: IContainerRuntime;

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
		return this.runtime.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
	}

	public get closed(): boolean {
		return this._disposed;
	}
}
