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

export interface IMouseSignalPayload {
	userId?: string;
	pos: IMousePosition;
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
		this.cursor = statesWorkspace.cursor;

		this.presence.events.on("attendeeDisconnected", (client: ISessionClient) => {
			this.posMap.delete(client);
			this.emit("pointerChanged");
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

	public getMousePresences(): Map<string, IMousePosition> {
		const statuses: Map<string, IMousePosition> = new Map<string, IMousePosition>();
		this.audience.getMembers().forEach((member) => {
			member.connections.forEach((connection) => {
				const attendee = this.presence.getAttendee(connection.id);
				const position = this.posMap.get(attendee);
				if (position !== undefined) {
					statuses.set(member.name, position);
				}
			});
		});
		return statuses;
	}
}
