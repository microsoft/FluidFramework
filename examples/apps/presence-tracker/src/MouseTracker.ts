/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAzureAudience } from "@fluidframework/azure-client";
import type { IEvent } from "@fluidframework/core-interfaces";
import type {
	IPresence,
	ISessionClient,
	LatestValueManager,
	PresenceStates,
} from "@fluidframework/presence/alpha";
import { Latest, SessionClientStatus } from "@fluidframework/presence/alpha";

export interface IMouseTrackerEvents extends IEvent {
	(event: "mousePositionChanged", listener: () => void): void;
}

export interface IMousePosition {
	x: number;
	y: number;
}

export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
	private readonly cursor: LatestValueManager<IMousePosition>;

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
		});

		this.presence.events.on("attendeeDisconnected", () => {
			this.emit("mousePositionChanged");
		});

		this.cursor.events.on("updated", () => {
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
	public getMousePresences(): Map<ISessionClient, IMousePosition> {
		const statuses: Map<ISessionClient, IMousePosition> = new Map();

		for (const { client, value } of this.cursor.clientValues()) {
			if (client.getConnectionStatus() === SessionClientStatus.Connected) {
				statuses.set(client, value);
			}
		}
		return statuses;
	}
}
