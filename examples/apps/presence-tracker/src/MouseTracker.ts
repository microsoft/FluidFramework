/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { Signaler } from "@fluid-experimental/data-objects";
import {
	type ClientId,
	type EmptyIndependentDirectory,
	Latest,
	type LatestValueManager,
} from "@fluid-experimental/ephemeral-independent/alpha";
import type { IEvent } from "@fluidframework/core-interfaces";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IMember, IServiceAudience } from "fluid-framework";

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
	 * Map<ClientId, IMousePosition>
	 * ```
	 */
	private readonly posMap = new Map<ClientId, IMousePosition>();

	constructor(
		public readonly audience: IServiceAudience<IMember>,
		directory: EmptyIndependentDirectory,
	) {
		super();

		directory.add("cursor", Latest({ x: 0, y: 0 }));
		this.cursor = directory.cursor;

		this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
			this.posMap.delete(clientId);
			this.emit("mousePositionChanged");
		});

		this.cursor.on("update", ({ clientId, value }) => {
			this.posMap.set(clientId, value);
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
				const position = this.posMap.get(connection.id);
				if (position !== undefined) {
					statuses.set((member as any).userName, position);
				}
			});
		});
		return statuses;
	}
}
