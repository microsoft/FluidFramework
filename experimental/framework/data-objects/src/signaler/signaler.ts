/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter, TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	DataObject,
	DataObjectFactory,
	createDataObjectKind,
} from "@fluidframework/aqueduct/internal";
import { IErrorEvent, type IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { Jsonable } from "@fluidframework/datastore-definitions/internal";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntry,
} from "@fluidframework/runtime-definitions/internal";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

// TODO:
// add way to mark with current sequence number for ordering signals relative to ops
// throttling and batching

/**
 * Signature for listening to a signal event
 * @alpha
 */
export type SignalListener<T> = (
	clientId: string,
	local: boolean,
	payload: Jsonable<T>,
) => void;

/**
 * ISignaler defines an interface for working with signals that is similar to the more common
 * eventing patterns of EventEmitter.  In addition to sending and responding to signals, it
 * provides explicit methods around signal requests to other connected clients.
 * @alpha
 */
export interface ISignaler extends IEventProvider<IErrorEvent> {
	/**
	 * Adds a listener for the specified signal.  It behaves in the same way as EventEmitter's `on`
	 * method regarding multiple registrations, callback order, etc.
	 * @param signalName - The name of the signal
	 * @param listener - The callback signal handler to add
	 * @returns This ISignaler
	 */
	onSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler;
	/**
	 * Remove a listener for the specified signal.  It behaves in the same way as EventEmitter's
	 * `off` method regarding multiple registrations, removal order, etc.
	 * @param signalName - The name of the signal
	 * @param listener - The callback signal handler to remove
	 * @returns This ISignaler
	 */
	offSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler;
	/**
	 * Send a signal with payload to its connected listeners.
	 * @param signalName - The name of the signal
	 * @param payload - The data to send with the signal
	 */
	submitSignal<T>(signalName: string, payload?: Jsonable<T>);
}

/**
 * Duck type of something that provides the expected signalling functionality:
 * A way to verify we can signal, a way to send a signal, and a way to listen for incoming signals
 * @internal
 * @privateRemarks
 * There is no use external to package and export can be removed once breaking changes are permitted.
 */
export interface IRuntimeSignaler {
	connected: boolean;
	on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	submitSignal(type: string, content: Jsonable<unknown>): void;
}

/**
 * Note: currently experimental and under development
 *
 * Helper class to assist common scenarios around working with signals.  InternalSignaler wraps a runtime
 * object with signaling functionality (e.g. IContainerRuntime or FluidDataStoreRuntime) and can
 * then be used in place of the original signaler.  It uses a separate internal EventEmitter to
 * manage callbacks, and thus will reflect that behavior with regards to callback registration and
 * deregistration.
 */
class InternalSignaler extends TypedEventEmitter<IErrorEvent> implements ISignaler {
	private readonly emitter = new EventEmitter();

	private readonly signalerId: string | undefined;

	constructor(
		/**
		 * Object to wrap that can submit and listen to signals
		 */
		private readonly signaler: IRuntimeSignaler,
		/**
		 * Optional id to assign to this manager that will be attached to
		 * signal names.  Useful to avoid collisions if there are multiple
		 * signal users at the Container level
		 */
		signalerId?: string,
	) {
		super();
		this.emitter.on("error", (error) => {
			this.emit("error", error);
		});
		this.signalerId = signalerId ? `#${signalerId}` : undefined;
		this.signaler.on("signal", (message: IInboundSignalMessage, local: boolean) => {
			const clientId = message.clientId;
			// Only call listeners when the runtime is connected and if the signal has an
			// identifiable sender clientId.  The listener is responsible for deciding how
			// it wants to handle local/remote signals
			if (this.signaler.connected && clientId !== null) {
				this.emitter.emit(message.type, clientId, local, message.content);
			}
		});
	}

	private getSignalerSignalName(signalName: string): string {
		return this.signalerId ? `${signalName}${this.signalerId}` : signalName;
	}

	// ISignaler methods

	public onSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		this.emitter.on(signalerSignalName, listener);
		return this;
	}

	public offSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		this.emitter.off(signalerSignalName, listener);
		return this;
	}

	public submitSignal<T>(signalName: string, payload?: Jsonable<T>) {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		if (this.signaler.connected) {
			this.signaler.submitSignal(signalerSignalName, payload);
		}
	}
}

/**
 * DataObject implementation of ISignaler for fluid-static plug-and-play.
 * Allows fluid-static users to get an ISignaler without a custom DataObject.
 */
class SignalerClass
	extends DataObject<{ Events: IErrorEvent }>
	implements EventEmitter, ISignaler
{
	private _signaler: InternalSignaler | undefined;
	private get signaler(): InternalSignaler {
		assert(this._signaler !== undefined, 0x24b /* "internal signaler should be defined" */);
		return this._signaler;
	}

	public static readonly Name = "@fluid-example/signaler";

	public static readonly factory = new DataObjectFactory(
		SignalerClass.Name,
		SignalerClass,
		[],
		{},
	);

	protected async hasInitialized() {
		this._signaler = new InternalSignaler(this.runtime);
		this.signaler.on("error", (error) => {
			this.emit("error", error);
		});
	}

	// ISignaler methods  Note these are all passthroughs

	public onSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler {
		this.signaler.onSignal(signalName, listener);
		return this;
	}

	public offSignal<T>(signalName: string, listener: SignalListener<T>): ISignaler {
		this.signaler.offSignal(signalName, listener);
		return this;
	}

	public submitSignal<T>(signalName: string, payload?: Jsonable<T>) {
		this.signaler.submitSignal(signalName, payload);
	}
}

/**
 * Implementation of ISignaler for declarative API.
 * @privateRemarks
 * `factory` part of the type is included here to satisfy the usage in `@fluid-example/presence-tracker`, which is accessing encapsulated API surfaces from this.
 * If this eventually gets promoted to `@public` and/or part of `fluid-framework`, an alternate LegacySignaler (`@legacy`) should be created to continue exposing `factory`.
 * @alpha
 */
export const Signaler: {
	readonly factory: IFluidDataStoreFactory & {
		readonly registryEntry: NamedFluidDataStoreRegistryEntry;
	};
} & SharedObjectKind<ISignaler> = createDataObjectKind(SignalerClass);
