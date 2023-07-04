/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import EventEmitter from "events";
import { IRuntimeSignaler, ISignaler, SignalListener } from "@fluid-experimental/data-objects";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IErrorEvent } from "@fluidframework/common-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

export class InternalSignaler extends TypedEventEmitter<IErrorEvent> implements ISignaler {
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

	public submitSignal(signalName: string, payload?: any) {
		const signalerSignalName = this.getSignalerSignalName(signalName);
		if (this.signaler.connected) {
			this.signaler.submitSignal(signalerSignalName, payload);
		}
	}
}
