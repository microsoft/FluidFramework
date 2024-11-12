/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IPresence,
	type ISessionClient,
	Latest,
	type LatestValueManager,
	type PresenceStates,
} from "@fluid-experimental/presence";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAzureAudience } from "@fluidframework/azure-client";
import type { IEvent } from "@fluidframework/core-interfaces";

export interface IMouseTrackerEvents extends IEvent {
	(event: "mousePositionChanged", listener: () => void): void;
}

export interface IMousePosition {
	x: number;
	y: number;
}

export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
	private readonly cursor: LatestValueManager<IMousePosition>;

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
	) {
		super();

		statesWorkspace.add("cursor", Latest({ x: 0, y: 0 }));
		this.cursor = statesWorkspace.props.cursor;

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
	public getMousePresences(): Map<string, IMousePosition> {
		const statuses: Map<string, IMousePosition> = new Map();

		for (const { client, value: position } of this.cursor.clientValues()) {
			const clientConnectionId = client.getConnectionId();

			for (const [_, member] of this.audience.getMembers()) {
				// TODO: Without this comparison of audience connection to presence client, the list of client seems to grow
				// every refresh.
				const foundConnection = member.connections.some(
					(connection) => connection.id === clientConnectionId,
				);
				if (foundConnection) {
					statuses.set(clientConnectionId, position);
					break;
				}
			}
		}
		return statuses;
	}
}
