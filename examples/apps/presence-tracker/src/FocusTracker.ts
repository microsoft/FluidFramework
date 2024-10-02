/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignaler } from "@fluid-experimental/data-objects";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAzureAudience } from "@fluidframework/azure-client";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IEvent } from "@fluidframework/core-interfaces";
import { IMember } from "fluid-framework";

export interface IFocusTrackerEvents extends IEvent {
	(event: "focusChanged", listener: () => void): void;
}

export interface IFocusSignalPayload {
	userId: string;
	focus: boolean;
}

export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
	private static readonly focusSignalType = "changedFocus";
	private static readonly focusRequestType = "focusRequest";

	/**
	 * Local map of focus status for clients
	 *
	 * @example
	 *
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

	constructor(
		container: IContainer,
		public readonly audience: IAzureAudience,
		private readonly signaler: ISignaler,
	) {
		super();

		this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
			const focusClientIdMap = this.focusMap.get(member.id);
			if (focusClientIdMap !== undefined) {
				focusClientIdMap.delete(clientId);
				if (focusClientIdMap.size === 0) {
					this.focusMap.delete(member.id);
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
		container.on("connected", () => {
			this.signaler.submitSignal(FocusTracker.focusRequestType);
		});
		this.signaler.submitSignal(FocusTracker.focusRequestType);
	}

	/**
	 * Alert all connected clients that there has been a change to a client's focus
	 */
	private sendFocusSignal(hasFocus: boolean) {
		this.signaler.submitSignal(FocusTracker.focusSignalType, {
			userId: this.audience.getMyself()?.id,
			focus: hasFocus,
		});
	}

	public getFocusPresences(): Map<string, boolean> {
		const statuses: Map<string, boolean> = new Map<string, boolean>();
		this.audience.getMembers().forEach((member, userId) => {
			member.connections.forEach((connection) => {
				const focus = this.getFocusPresenceForUser(userId, connection.id);
				if (focus !== undefined) {
					statuses.set(member.name, focus);
				}
			});
		});
		return statuses;
	}

	/**
	 * Returns focus status of specified client
	 */
	public getFocusPresenceForUser(userId: string, clientId: string): boolean | undefined {
		return this.focusMap.get(userId)?.get(clientId);
	}
}
