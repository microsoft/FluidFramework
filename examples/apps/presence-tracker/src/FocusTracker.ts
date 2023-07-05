/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISignaler, SignalListener } from "@fluid-experimental/data-objects";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { InternalSignaler } from "./InternalSignaler";

export interface IFocusTracker extends EventEmitter, ISignaler {
	getFocusPresences(): Map<string, boolean>;
	getFocusPresenceForUser(userId: string, clientId: string): boolean | undefined;
	on(event: "focusChanged", listener: () => void);
	getName(): unknown | undefined;
}

export interface IFocusSignalPayload {
	userId: string;
	focus: boolean;
}

/**
 * ITinyliciousUser describes the default format for users created through the Tinylicious server.
 * However, the specific details for a user may differ depending on the server.
 */
export interface ITinyliciousUser {
	id: string;
	name: string;
}

export class FocusTracker extends DataObject implements IFocusTracker {
	private static readonly focusSignalType = "changedFocus";
	private static readonly focusRequestType = "focusRequest";

	/**
	 * Local map of focus status for clients
	 *
	 * @example
	 * ```typescript
	 * Map<userId, Map<clientid, hasFocus>>
	 * ```
	 */
	private readonly focusMap = new Map<string, Map<string, boolean>>();

	private readonly onFocusSignalFn = (clientId: string, payload: IFocusSignalPayload) => {
		const userId: string = payload.userId;
		const hasFocus: boolean = payload.focus;

		let clientIdMap = this.focusMap.get(userId);
		if (clientIdMap === undefined) {
			clientIdMap = new Map<string, boolean>();
			this.focusMap.set(userId, clientIdMap);
		}
		clientIdMap.set(clientId, hasFocus);
		this.emit("focusChanged");
	};

	private _signaler: InternalSignaler | undefined;
	private get signaler(): InternalSignaler {
		assert(this._signaler !== undefined, "internal signaler should be defined");
		return this._signaler;
	}

	public static get Name() {
		return "focusTracker";
	}

	protected async hasInitialized() {
		this._signaler = new InternalSignaler(this.runtime);

		const audience = this.runtime.getAudience();
		audience.on("removeMember", (clientId: string, member: any) => {
			console.log("focus remove member", member);
			const focusClientIdMap = this.focusMap.get(member.userId);
			if (focusClientIdMap !== undefined) {
				focusClientIdMap.delete(clientId);
				if (focusClientIdMap.size === 0) {
					this.focusMap.delete(member.userId);
				}
			}
			this.emit("focusChanged");
		});

		this.signaler.on("error", (error) => {
			this.emit("error", error);
		});
		this.signaler.onSignal(
			FocusTracker.focusSignalType,
			(clientId: string, local: boolean, payload: IFocusSignalPayload) => {
				this.onFocusSignalFn(clientId, payload);
			},
		);

		this.signaler.onSignal(FocusTracker.focusRequestType, () => {
			this.sendFocusSignal(document.hasFocus());
		});
		window.addEventListener("focus", () => {
			this.sendFocusSignal(true);
		});
		window.addEventListener("blur", () => {
			this.sendFocusSignal(false);
		});
		this.runtime.on("connected", () => {
			this.signaler.submitSignal(FocusTracker.focusRequestType);
		});
		this.signaler.submitSignal(FocusTracker.focusRequestType);
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

	public submitSignal(signalName: string, payload?: any) {
		this.signaler.submitSignal(signalName, payload);
	}

	public getName(): unknown | undefined {
		const audience = this.runtime.getAudience();
		assert(this.runtime.clientId !== undefined, "Missing client id on disconnect");
		const userString = JSON.stringify(audience.getMember(this.runtime.clientId)?.user);
		const user = JSON.parse(userString) as ITinyliciousUser;
		return user.name;
	}

	/**
	 * Alert all connected clients that there has been a change to a client's focus
	 */
	private sendFocusSignal(hasFocus: boolean) {
		this.signaler.submitSignal(FocusTracker.focusSignalType, {
			userId: this.runtime.clientId,
			focus: hasFocus,
		});
	}

	public getFocusPresences(): Map<string, boolean> {
		const statuses: Map<string, boolean> = new Map<string, boolean>();
		const audience = this.runtime.getAudience();
		assert(this.runtime.clientId !== undefined, "Missing client id on disconnect");

		for (const [key, values] of audience.getMembers()) {
			const user = JSON.stringify(values.user);
			const userString = JSON.parse(user) as ITinyliciousUser;
			const focus = this.getFocusPresenceForUser(this.runtime.clientId, key);
			if (focus !== undefined) {
				statuses.set(userString.name, focus);
			}
		}
		return statuses;
	}

	/**
	 * Returns focus status of specified client
	 */
	public getFocusPresenceForUser(userId: string, clientId: string): boolean | undefined {
		return this.focusMap.get(userId)?.get(clientId);
	}
}

export const FocusTrackerInstantiationFactory = new DataObjectFactory(
	"focusTracker",
	FocusTracker,
	[],
	{},
);
