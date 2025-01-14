/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import type {
	IPresence,
	ISessionClient,
	LatestValueManager,
	PresenceStates,
} from "@fluidframework/presence/alpha";
import { Latest, SessionClientStatus } from "@fluidframework/presence/alpha";
import type { ITinyliciousAudience } from "@fluidframework/tinylicious-client";

export interface IFocusTrackerEvents extends IEvent {
	(event: "focusChanged", listener: (focusState: IFocusState) => void): void;
}

export interface IFocusState {
	hasFocus: boolean;
}

export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
	private readonly focus: LatestValueManager<IFocusState>;

	constructor(
		private readonly presence: IPresence,
		// eslint-disable-next-line @typescript-eslint/ban-types
		statesWorkspace: PresenceStates<{}>,
		public readonly audience: ITinyliciousAudience,
	) {
		super();

		statesWorkspace.add("focus", Latest({ hasFocus: true }));
		this.focus = statesWorkspace.props.focus;

		this.focus.events.on("updated", ({ client, value }) => {
			this.emit("focusChanged", this.focus.local);
		});

		// Alert all connected clients that there has been a change to this client's focus state
		window.addEventListener("focus", () => {
			this.focus.local = {
				hasFocus: true,
			};
			this.emit("focusChanged", this.focus.local);
		});
		window.addEventListener("blur", () => {
			this.focus.local = {
				hasFocus: false,
			};
			this.emit("focusChanged", this.focus.local);
		});
	}

	/**
	 * A map of session clients to focus status.
	 */
	public getFocusPresences(): Map<ISessionClient, boolean> {
		const statuses: Map<ISessionClient, boolean> = new Map();

		// Include the local client in the map because this is used to render a
		// dashboard of all connected clients.
		const currentClient = this.presence.getMyself();
		statuses.set(currentClient, this.focus.local.hasFocus);

		for (const { client, value } of this.focus.clientValues()) {
			if (client.getConnectionStatus() === SessionClientStatus.Connected) {
				const { hasFocus } = value;
				statuses.set(client, hasFocus);
			}
		}

		return statuses;
	}
}
