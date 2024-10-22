/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IPresence,
	type ISessionClient,
	LatestMap,
	type LatestMapValueManager,
	type PresenceStates,
} from "@fluid-experimental/presence";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEvent } from "@fluidframework/core-interfaces";
import type { IMember, IServiceAudience } from "fluid-framework";

export interface IPointerTrackerEvents extends IEvent {
	(event: "pointerChanged", listener: () => void): void;
}

type PointerId = PointerEvent["pointerId"];

export interface IPointerInfo {
	x: number;
	y: number;
	pressure: number;
}

export class PointerTracker extends TypedEventEmitter<IPointerTrackerEvents> {
	private readonly pointers: LatestMapValueManager<IPointerInfo, PointerId>;

	/**
	 * Local map of pointer position status for clients
	 *
	 * ```
	 * Map<ClientId, Map<number, IPointerPosition>>
	 * ```
	 */
	private readonly pointersMap = new Map<ISessionClient, Map<PointerId, IPointerInfo>>();

	constructor(
		public readonly presence: IPresence,
		// eslint-disable-next-line @typescript-eslint/ban-types
		statesWorkspace: PresenceStates<{}>,
		public readonly audience: IServiceAudience<IMember>,
	) {
		super();

		statesWorkspace.add("pointers", LatestMap<IPointerInfo, PointerId>());
		this.pointers = statesWorkspace.pointers;

		this.presence.events.on("attendeeDisconnected", (client: ISessionClient) => {
			this.pointersMap.delete(client);
			this.emit("pointerChanged");
		});

		this.pointers.events.on("updated", ({ client, items }) => {
			const clientPointers = this.getClientPointers(client);
			items.forEach((item, key) => {
				clientPointers.set(key, item.value);
			});
			this.emit("pointerChanged");
		});

		this.pointers.events.on("itemRemoved", ({ client, key }) => {
			if (this.pointersMap.get(client)?.delete(key) ?? false) {
				this.emit("pointerChanged");
			}
		});

		window.addEventListener("pointermove", (e) => {
			// Alert all connected clients that there has been a change to a client's pointer info
			this.pointers.local.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY,
				pressure: e.pressure,
			});
		});

		window.addEventListener("pointerleave", (e) => {
			// Alert all connected clients that client's pointer is gone
			this.pointers.local.delete(e.pointerId);
		});
	}

	private getClientPointers(client: ISessionClient): Map<PointerId, IPointerInfo> {
		let clientPointers = this.pointersMap.get(client);
		if (clientPointers === undefined) {
			clientPointers = new Map();
			this.pointersMap.set(client, clientPointers);
		}
		return clientPointers;
	}

	public getPointerPresences(): Map<string, IPointerInfo> {
		const statuses = new Map<string, IPointerInfo>();
		// Deomonstrates connecting service audience and presence attendees.
		// Getting from presence attendee to service audience member is not
		// as easy as there is no connection to the service audience member
		// lookup.
		this.audience.getMembers().forEach((member) => {
			member.connections.forEach((connection) => {
				const attendee = this.presence.getAttendee(connection.id);
				const pointers = this.pointersMap.get(attendee);
				if (pointers !== undefined) {
					pointers.forEach((pointer, pointerId) =>
						statuses.set(`${(member as any).userName}.${pointerId}`, pointer),
					);
				}
			});
		});
		return statuses;
	}
}
