/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */


import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { IErrorEvent } from "@fluidframework/core-interfaces";
import { CircularBuffer } from "./utils";


// TODO:
// add way to mark with current sequence number for ordering signals relative to ops
// throttling and batching

export type SignalListener = (clientId: string, local: boolean, payload: Jsonable) => void;

/**
 * ISignaler defines an interface for working with signals that is similar to the more common
 * eventing patterns of EventEmitter.  In addition to sending and responding to signals, it
 * provides explicit methods around signal requests to other connected clients.
 */
export interface ISignaler {
	/**
	 * Adds a listener for the specified signal.  It behaves in the same way as EventEmitter's `on`
	 * method regarding multiple registrations, callback order, etc.
	 * @param signalName - The name of the signal
	 * @param listener - The callback signal handler to add
	 * @returns This ISignaler
	 */
	onSignal(signalName: string, listener: SignalListener): ISignaler;
	/**
	 * Remove a listener for the specified signal.  It behaves in the same way as EventEmitter's
	 * `off` method regarding multiple registrations, removal order, etc.
	 * @param signalName - The name of the signal
	 * @param listener - The callback signal handler to remove
	 * @returns This ISignaler
	 */
	offSignal(signalName: string, listener: SignalListener): ISignaler;
	/**
	 * Send a signal with payload to its connected listeners.
	 * @param signalName - The name of the signal
	 * @param payload - The data to send with the signal
	 */
	submitSignal(signalName: string, payload?: Jsonable);
}

/**
 * Duck type of something that provides the expected signalling functionality:
 * A way to verify we can signal, a way to send a signal, and a way to listen for incoming signals
 */
export interface IRuntimeSignaler {
	connected: boolean;
	on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	off(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	submitSignal(type: string, content: any): void;
}

/**
 * Note: currently experimental and under development
 *
 * Helper class to assist common scenarios around working with signals.  InternalSignaler wraps a runtime
 * object with signaling functionality (e.g. ContainerRuntime or FluidDataStoreRuntime) and can
 * then be used in place of the original signaler.  It uses a separate internal EventEmitter to
 * manage callbacks, and thus will reflect that behavior with regards to callback registration and
 * deregistration.
 */
class InternalSignaler extends TypedEventEmitter<IErrorEvent> implements ISignaler {
	private readonly emitter = new EventEmitter();

	private readonly signalerId: string | undefined;

	private readonly signalStatQueue: CircularBuffer<SignalStatistics>;

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
			const currentStats = this.signalStatQueue.getLast();
			if (currentStats) {
				currentStats.toClient.count++;
				currentStats.toClient.size += JSON.stringify(message.content).length;
				currentStats.toClient.packetCount++;
				currentStats.toClient.packetSize += JSON.stringify(message.content).length;
			}
			const clientId = message.clientId;
			// Only call listeners when the runtime is connected and if the signal has an
			// identifiable sender clientId.  The listener is responsible for deciding how
			// it wants to handle local/remote signals
			if (this.signaler.connected && clientId !== null) {
				this.emitter.emit(message.type, clientId, local, message.content);
			}
		});

		this.signalStatQueue = new CircularBuffer<SignalStatistics>(10);

		setInterval(() => this.signalStatQueue.add(new SignalStatistics()), 1000);
	}

	private getSignalerSignalName(signalName: string): string {
		return this.signalerId ? `${signalName}${this.signalerId}` : signalName;
	}

	// ISignaler methods

	public onSignal(signalName: string, listener: SignalListener): ISignaler {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		this.emitter.on(signalerSignalName, listener);
		return this;
	}

	public offSignal(signalName: string, listener: SignalListener): ISignaler {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		this.emitter.off(signalerSignalName, listener);
		return this;
	}

	public submitSignal(signalName: string, payload?: Jsonable) {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		if (this.signaler.connected) {
			this.signaler.submitSignal(signalerSignalName, payload);

			const currentStats = this.signalStatQueue.getLast();
			if (currentStats) {
				currentStats.fromClient.count++;
				currentStats.fromClient.size += JSON.stringify(payload).length;
				currentStats.fromClient.packetCount++;
				currentStats.fromClient.packetSize += JSON.stringify(payload).length;
			}
		}
	}

	public stats(): SignalStatistics[] | undefined{
		const currentStats = this.signalStatQueue.getLastN(this.signalStatQueue.getBufferLength());
		if (currentStats) {
			return currentStats;
		}
		return undefined;
	}
}



class SignalStatistics {
	/**
	 * Length of time (milliseconds) these statistics cover
	 */
	public timespan: number;

	/**
	 * Statistics for signals sent by client
	 */
	public fromClient: ISignalTransmissionData;

	/**
	 * Statistics for signals sent to client
	 */
	public toClient: ISignalTransmissionData;

	constructor() {
		this.timespan = 0;
		this.fromClient = {
			count: 0,
			size: 0,
			packetCount: 0,
			packetSize: 0,
		};
		this.toClient = {
			count: 0,
			size: 0,
			packetCount: 0,
			packetSize: 0,
		};

		setInterval(() => this.timespan < 1000 ? this.timespan += 1 : null, 1);
	}
}


/**
* Data for signals transmitted between clients
*/
export interface ISignalTransmissionData {
	/**
	 * Count of signals
	 */
	count: number;

	/**
	 * Approximation of cumulative signal payloads in bytes
	 */
	size: number;

	/**
	 * Count of packets used for signals 
	 */
	packetCount: number;

	/**
	 * Approximation of cumulative signal payloads in bytes
	 */
	packetSize: number;

}

/**
 * DataObject implementation of ISignaler for fluid-static plug-and-play.  Allows fluid-static
 * users to get an ISignaler without a custom DO.
 */
export class Signaler
	extends DataObject<{ Events: IErrorEvent }>
	implements EventEmitter, ISignaler
{
	private _signaler: InternalSignaler | undefined;

	private get signaler(): InternalSignaler {
		assert(this._signaler !== undefined, 0x24b /* "internal signaler should be defined" */);
		return this._signaler;
	}

	public static readonly Name = "@fluid-example/signaler";

	public static readonly factory = new DataObjectFactory(Signaler.Name, Signaler, [], {});

	protected async hasInitialized() {
		this._signaler = new InternalSignaler(this.runtime);
		this.signaler.on("error", (error) => {
			this.emit("error", error);
		});
	}

	// ISignaler methods  Note these are all passthroughs

	public onSignal(signalName: string, listener: SignalListener): ISignaler {
		this.signaler.onSignal(signalName, listener);
		return this;
	}

	public offSignal(signalName: string, listener: SignalListener): ISignaler {
		this.signaler.offSignal(signalName, listener);
		return this;
	}

	public submitSignal(signalName: string, payload?: Jsonable) {
		this.signaler.submitSignal(signalName, payload);
	}

	public stats(): SignalStatistics[] | undefined {
		return this.signaler.stats();
	}
}
