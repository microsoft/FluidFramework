/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Latest,
	type IPresence,
	type ISessionClient,
	type LatestValueManager,
	type PresenceStates,
} from "@fluid-experimental/presence";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAzureAudience } from "@fluidframework/azure-client";
import { IEvent } from "@fluidframework/core-interfaces";

export interface IFocusTrackerEvents extends IEvent {
	(event: "focusChanged", listener: () => void): void;
}

export interface IFocusState {
	hasFocus: boolean;
}

export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
	private readonly focus: LatestValueManager<IFocusState>;

	/**
	 * Local map of focus status for clients
	 *
	 * @example
	 *
	 * ```typescript
	 * Map<ISessionClient, IFocusState>
	 * ```
	 */
	private readonly focusMap = new Map<ISessionClient, IFocusState>();

	constructor(
		public readonly presence: IPresence,
		// eslint-disable-next-line @typescript-eslint/ban-types
		statesWorkspace: PresenceStates<{}>,
		public readonly audience: IAzureAudience,
	) {
		super();

		statesWorkspace.add("focus", Latest({ hasFocus: true }));
		this.focus = statesWorkspace.focus;

		this.presence.events.on("attendeeDisconnected", (client: ISessionClient) => {
			this.focusMap.delete(client);
		});

		this.focus.events.on("updated", ({ client, value }) => {
			this.focusMap.set(client, value);
			this.emit("mousePositionChanged");
		});

		window.addEventListener("focus", (e) => {
			// Alert all connected clients that there has been a change to a client's mouse position
			this.focus.local = {
				hasFocus: true,
			};
		});
	}

	public getFocusPresences(): Map<string, boolean> {
		const statuses: Map<string, boolean> = new Map<string, boolean>();
		this.audience.getMembers().forEach((member) => {
			member.connections.forEach((connection) => {
				const attendee = this.presence.getAttendee(connection.id);
				const focus = this.focusMap.get(attendee);
				if (focus?.hasFocus !== undefined) {
					statuses.set(member.name, focus.hasFocus);
				}
			});
		});
		return statuses;
	}
}
