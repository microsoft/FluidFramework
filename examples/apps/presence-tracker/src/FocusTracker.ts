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

/**
 * IFocusState is the data that individual session clients share via presence.
 */
export interface IFocusState {
	readonly hasFocus: boolean;
}

/**
 * Definitions of the events that the FocusTracker raises.
 */
export interface IFocusTrackerEvents extends IEvent {
	/**
	 * The focusChanged event is emitted any time the FocusTracker detects a change in focus in any client, local or
	 * remote.
	 */
	(event: "focusChanged", listener: (focusState: IFocusState) => void): void;
}

/**
 * The FocusTracker class tracks the focus state of all connected sessions using the Fluid Framework presence features.
 * Focus state is tracked automatically by the class instance. As the focus state of connected sessions change, the
 * FocusTracker emits a "focusChanged" event
 */
export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
	/**
	 * A value manager that tracks the latest focus state of connected session clients.
	 */
	private readonly focus: LatestValueManager<IFocusState>;

	constructor(
		private readonly presence: IPresence,

		/**
		 * A states workspace that the FocusTracker will use to share focus states with other session clients.
		 */
		// eslint-disable-next-line @typescript-eslint/ban-types -- empty object is the correct typing
		readonly statesWorkspace: PresenceStates<{}>,
	) {
		super();

		// Create a Latest value manager to track the focus state. The value is initialized with current focus state of the
		// window.
		statesWorkspace.add(
			"focus",
			Latest<IFocusState>({ hasFocus: window.document.hasFocus() }),
		);

		// Save a reference to the value manager for easy access within the FocusTracker.
		this.focus = statesWorkspace.props.focus;

		// When the focus value manager is updated, the FocusTracker should emit the focusChanged event.
		this.focus.events.on("updated", ({ client, value }) => {
			this.emit("focusChanged", this.focus.local);
		});

		// Listen to the local focus and blur events. On each event, update the local focus state in the value manager, then
		// emit the focusChanged event with the local data.
		window.addEventListener("focus", () => {
			this.focus.local = {
				hasFocus: true,
			};

			const cover = document.querySelector<HTMLDivElement>("#cover");
			if (cover !== null) {
				cover.setAttribute("style", "opacity: 0; z-index: auto");
			}

			this.emit("focusChanged", this.focus.local);
		});
		window.addEventListener("blur", () => {
			this.focus.local = {
				hasFocus: false,
			};

			const cover = document.querySelector<HTMLDivElement>("#cover");
			if (cover !== null) {
				cover.setAttribute("style", "opacity: 0.7; z-index: 100");
			}

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
