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
		this.focus = statesWorkspace.props.focus;

		this.presence.events.on("attendeeDisconnected", (client: ISessionClient) => {
			this.focusMap.delete(client);
		});

		this.focus.events.on("updated", ({ client, value }) => {
			this.focusMap.set(client, value);
			this.emit("focusChanged");
		});

		// Alert all connected clients that there has been a change to a client's focus state
		window.addEventListener("focus", () => {
			this.focus.local = {
				hasFocus: true,
			};
		});
		window.addEventListener("blur", () => {
			this.focus.local = {
				hasFocus: false,
			};
		});
	}

	/**
	 * A map of connection IDs to focus status.
	 */
	public getFocusPresences(): Map<string, boolean> {
		const statuses: Map<string, boolean> = new Map<string, boolean>();

		for (const { client, value } of this.focus.clientValues()) {
			const { hasFocus } = value;

			for (const [_, member] of this.audience.getMembers()) {
				const foundConnection = member.connections.some(
					(connection) => connection.id === client.getConnectionId(),
				);
				if (foundConnection) {
					statuses.set(client.getConnectionId(), hasFocus);
					break;
				} else {
					statuses.delete(client.getConnectionId());
				}
			}
		}

		return statuses;
	}
}
