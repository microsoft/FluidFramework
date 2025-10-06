/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEvent } from "@fluidframework/core-interfaces";
import type {
	Presence,
	Attendee,
	LatestRaw,
	StatesWorkspace,
} from "@fluidframework/presence/beta";
import { AttendeeStatus, StateFactory } from "@fluidframework/presence/beta";

/**
 * IMousePosition is the data that individual session clients share via presence.
 */
export interface IMousePosition {
	readonly x: number;
	readonly y: number;
}

/**
 * Definitions of the events that the MouseTracker raises.
 */
export interface IMouseTrackerEvents extends IEvent {
	/**
	 * The mousePositionChanged event is emitted any time the MouseTracker detects a change in the mouse position of any
	 * client, local or remote.
	 */
	(event: "mousePositionChanged", listener: () => void): void;
}

/**
 * The MouseTracker class tracks the mouse position of all connected sessions using the Fluid Framework presence
 * features. Mouse position is tracked automatically by the class instance. As the mouse position of connected sessions
 * changes, the MouseTracker emits a "mousePositionChanged" event
 */
export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
	/**
	 * State that tracks the latest mouse position  of connected session clients.
	 */
	private readonly cursor: LatestRaw<IMousePosition>;

	constructor(
		private readonly presence: Presence,

		/**
		 * A states workspace that the MouseTracker will use to share mouse positions with other session clients.
		 */
		// eslint-disable-next-line @typescript-eslint/ban-types -- empty object is the correct typing
		readonly statesWorkspace: StatesWorkspace<{}>,
	) {
		super();

		// Create a Latest state object to track the mouse position.
		statesWorkspace.add(
			"cursor",
			StateFactory.latest<IMousePosition>({ local: { x: 0, y: 0 } }),
		);

		// Save a reference to the cursor state for easy access within the MouseTracker.
		this.cursor = statesWorkspace.states.cursor;

		// When the cursor state is updated, the MouseTracker should emit the mousePositionChanged event.
		this.cursor.events.on("remoteUpdated", () => {
			this.emit("mousePositionChanged");
		});

		// When an attendee disconnects, emit the mousePositionChanged event so client can update their rendered view
		// accordingly.
		this.presence.attendees.events.on("attendeeDisconnected", () => {
			this.emit("mousePositionChanged");
		});

		// Listen to the local mousemove event and update the local position in the cursor state.
		window.addEventListener("mousemove", (e) => {
			// Alert all connected clients that there has been a change to this client's mouse position
			this.cursor.local = {
				x: e.clientX,
				y: e.clientY,
			};
			this.emit("mousePositionChanged");
		});
	}

	/**
	 * A map of session clients to mouse positions.
	 */
	public getMousePresences(): Map<Attendee, IMousePosition> {
		const statuses: Map<Attendee, IMousePosition> = new Map();

		for (const { attendee, value } of this.cursor.getRemotes()) {
			if (attendee.getConnectionStatus() === AttendeeStatus.Connected) {
				statuses.set(attendee, value);
			}
		}
		return statuses;
	}

	/**
	 * Set the allowable latency for mouse cursor updates.
	 *
	 * @param latency - the maximum allowable latency for updates. Set to undefined to revert to the default value.
	 */
	public setAllowableLatency(latency: number | undefined): void {
		this.cursor.controls.allowableUpdateLatencyMs = latency;
	}

	/**
	 * The most recent mouse position of the current client.
	 */
	public getMyMousePosition(): IMousePosition {
		return this.cursor.local;
	}
}
