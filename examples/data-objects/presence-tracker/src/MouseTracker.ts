/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Signaler } from "@fluid-experimental/data-objects";
import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IMember,
    IServiceAudience,
} from "fluid-framework";

export interface IMouseTrackerEvents extends IEvent {
    (event: "mousePositionChanged", listener: () => void): void;
}

export interface IMousePosition {
    x: number;
    y: number;
}

export class MouseTracker extends TypedEventEmitter<IMouseTrackerEvents> {
    private static readonly mouseSignalType = "positionChanged";

    /**
     * Local map of mouse position status for clients
     *
     * ```
     * Map<userId, Map<clientid, position>>
     * ```
     */
    private readonly posMap = new Map<string, Map<string, IMousePosition>>();

    private readonly onMouseSignalFn = (clientId: string, payload: any) => {
        const userId: string = payload.userId;
        const position: IMousePosition = payload.pos;

        let clientIdMap = this.posMap.get(userId);
        if (clientIdMap === undefined) {
            clientIdMap = new Map<string, IMousePosition>();
            this.posMap.set(userId, clientIdMap);
        }
        clientIdMap.set(clientId, position);
        this.emit("mousePositionChanged");
    };

    public constructor(
        public readonly audience: IServiceAudience<IMember>,
        private readonly signaler: Signaler,
    ) {
        super();

        this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const clientIdMap = this.posMap.get(member.userId);
            if (clientIdMap !== undefined) {
                clientIdMap.delete(clientId);
                if (clientIdMap.size === 0) {
                    this.posMap.delete(member.userId);
                }
            }
            this.emit("mousePositionChanged");
        });

        this.signaler.on("error", (error) => {
            this.emit("error", error);
        });
        this.signaler.onSignal(MouseTracker.mouseSignalType, (clientId, local, payload) => {
            this.onMouseSignalFn(clientId, payload);
        });
        window.addEventListener("mousemove", (e) => {
            const position: IMousePosition = {
                x: e.clientX,
                y: e.clientY,
            };
            this.sendMouseSignal(position);
        });
    }

    /**
     * Alert all connected clients that there has been a change to a client's mouse position
     */
    private sendMouseSignal(position: IMousePosition) {
        this.signaler.submitSignal(
            MouseTracker.mouseSignalType,
            { userId: this.audience.getMyself()?.userId, pos: position },
        );
    }

    public getMousePresences(): Map<string, IMousePosition> {
        const statuses: Map<string, IMousePosition> = new Map <string, IMousePosition>();
        this.audience.getMembers().forEach((member, userId) => {
            member.connections.forEach((connection) => {
                const position = this.getMousePresenceForUser(userId, connection.id);
                if (position !== undefined) {
                    statuses.set((member as any).userName, position);
                }
            });
        });
        return statuses;
    }

    public getMousePresenceForUser(userId: string, clientId: string): IMousePosition | undefined {
        return this.posMap.get(userId)?.get(clientId);
    }
}
