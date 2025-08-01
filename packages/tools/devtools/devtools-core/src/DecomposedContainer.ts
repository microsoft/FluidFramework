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
 * A lightweight abstraction of a container that provides
 * only the essential properties and methods needed for Fluid DevTools functionality.
 *
 * @alpha
 */
export interface DecomposedContainer extends IEventProvider<IContainerEvents> {
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

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connect}
	 */
	connect?(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.disconnect}
	 */
	disconnect?(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.close}
	 */
	close?(error?: ICriticalContainerError): void;
}

/**
 * Implementation of {@link DecomposedContainer} that wraps an {@link @fluidframework/container-runtime-definitions/internal#IContainerRuntime}.
 * This class provides a bridge between {@link @fluidframework/container-runtime-definitions/internal#IContainerRuntime} and the devtools system by exposing runtime properties and events.
 */
export class DecomposedContainerForContainerRuntime
	extends TypedEventEmitter<IContainerEvents>
	implements DecomposedContainer
{
	private _disposed = false; // Track actual disposed state

	public constructor(runtime: IContainerRuntime) {
		super();
		this.runtime = runtime;
		runtime.on("attached", this.attachedHandler);
		runtime.on("connected", this.connectedHandler);
		runtime.on("disconnected", this.disconnectedHandler);
		runtime.on("disposed", this.disposedHandler);
	}

	private readonly attachedHandler = (): boolean => this.emit("attached");
	private readonly connectedHandler = (clientId: string): boolean =>
		this.emit("connected", clientId);
	private readonly disconnectedHandler = (): boolean => this.emit("disconnected");
	private readonly disposedHandler = (error?: ICriticalContainerError): boolean => {
		this._disposed = true; // Mark as disposed when dispose event occurs
		return this.emit("disposed", error);
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
		return this._disposed; // Only return true if actually disposed, not just disconnected
	}

	// Container runtime doesn't have direct connect/disconnect/close methods
	// These would need to be implemented through the container if needed
	public connect?(): void {
		// Container runtime doesn't have direct connect method
		// This would need to be implemented through the container
	}

	public disconnect?(): void {
		// Container runtime doesn't have direct disconnect method
		// This would need to be implemented through the container
	}

	public close?(error?: ICriticalContainerError): void {
		// Container runtime doesn't have direct close method
		// This would need to be implemented through the container
	}
}
