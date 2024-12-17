/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAzureAudience } from "@fluidframework/azure-client";
import type { IEvent } from "@fluidframework/core-interfaces";
import {
	type ClientConnectionId,
	type IPresence,
	type ISessionClient,
	Latest,
	type LatestValueManager,
	type PresenceStates,
	SessionClientStatus,
} from "@fluidframework/presence/alpha";

export interface IMouseTrackerEvents extends IEvent {
	(event: "mousePositionChanged", listener: () => void): void;
}

export interface IMousePosition {
	x: number;
	y: number;
}

export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
	public readonly cursor: LatestValueManager<IMousePosition>;

	/**
	 * Local map of mouse position status for clients
	 *
	 * ```
	 * Map<ISessionClient, IMousePosition>
	 * ```
	 */
	private readonly posMap = new Map<ISessionClient, IMousePosition>();

	constructor(
		public readonly presence: IPresence,
		// eslint-disable-next-line @typescript-eslint/ban-types
		statesWorkspace: PresenceStates<{}>,
		public readonly audience: IAzureAudience,
		latencyInput: HTMLInputElement,
	) {
		super();

		statesWorkspace.add("cursor", Latest({ x: 0, y: 0 }));
		this.cursor = statesWorkspace.props.cursor;

		latencyInput.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			this.cursor.controls.allowableUpdateLatencyMs = parseInt(target.value, 10);
			console.log(`latency: ${this.cursor.controls.allowableUpdateLatencyMs}`);
		});

		this.presence.events.on("attendeeDisconnected", (client: ISessionClient) => {
			this.posMap.delete(client);
			this.emit("mousePositionChanged");
		});

		this.cursor.events.on("updated", ({ client, value }) => {
			this.posMap.set(client, value);
			this.emit("mousePositionChanged");
		});

		window.addEventListener("mousemove", (e) => {
			// Alert all connected clients that there has been a change to a client's mouse position
			this.cursor.local = {
				x: e.clientX,
				y: e.clientY,
			};
		});
	}

	/**
	 * A map of connection IDs to mouse positions.
	 */
	public getMousePresences(): Map<ClientConnectionId, IMousePosition> {
		const statuses: Map<ClientConnectionId, IMousePosition> = new Map();

		for (const { client, value } of this.cursor.clientValues()) {
			if (client.getConnectionStatus() === SessionClientStatus.Connected) {
				statuses.set(client.getConnectionId(), value);
			}
		}
		return statuses;
	}
}
