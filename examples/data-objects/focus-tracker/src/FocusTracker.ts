/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SignalManager } from "@fluid-experimental/data-objects";
import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IFluidContainer,
    IMember,
    IServiceAudience,
} from "fluid-framework";

export interface IMouseFocusTrackerEvents extends IEvent {
    (event: "focusChanged", listener: () => void): void;
    (event: "mousePositionChanged", listener: () => void): void;
}


/**
 * Example of using the audience with signals to track focus state of connected clients
 * without writing changes to a DDS.
 */
export class MouseFocusTracker extends TypedEventEmitter<IMouseFocusTrackerEvents> {
    private static readonly focusSignalType = "changedFocus";
    private static readonly focusRequestType = "focusRequest";
    private static readonly mouseSignalType ="positionChanged";

    /**
     * Local map of focus status for clients
     *
     * ```
     * Map<userId, Map<clientid, hasFocus>>
     * ```
     */
    private readonly focusMap = new Map<string, Map<string, boolean>>();

    /**
     * Local map of mouse position status for clients
     *
     * ```
     * Map<userId, Map<clientid, hasFocus>>
     * ```
     */
    private readonly posMap = new Map<string, Map<string,[number, number]>>();

    private readonly onFocusSignalFn = (clientId: string, payload: any) => {
        const userId: string = payload.userId;
        const hasFocus: boolean = payload.focus;

        let clientIdMap = this.focusMap.get(userId);
        if (clientIdMap === undefined) {
            clientIdMap = new Map<string, boolean>();
            this.focusMap.set(userId, clientIdMap);
        }
        clientIdMap.set(clientId, hasFocus);
        this.emit("focusChanged");
    };

    private readonly onMouseSignalFn = (clientId: string, payload: any) => {
        const userId: string = payload.userId;
        const position: [number,number] = payload.pos;

        let clientIdMap = this.posMap.get(userId);
        if (clientIdMap === undefined) {
            clientIdMap = new Map<string, [number, number]>();
            this.posMap.set(userId, clientIdMap);
        }
        clientIdMap.set(clientId, position);
        this.emit("mousePositionChanged");

    };

    public constructor(
        container: IFluidContainer,
        public readonly audience: IServiceAudience<IMember>,
        private readonly signalManager: SignalManager,
    ) {
        super();

        this.audience.on("memberAdded", (clientId: string, member: IMember) => {
            this.emit("focusChanged");
            this.emit("mousePositionChanged");
        });
        this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const focusClientIdMap = this.focusMap.get(member.userId);
            const mouseClientIdMap = this.posMap.get(member.userId);
            if (focusClientIdMap !== undefined) {
                focusClientIdMap.delete(clientId);
                if (focusClientIdMap.size === 0) {
                    this.focusMap.delete(member.userId);
                }
            }
            if (mouseClientIdMap !== undefined) {
                mouseClientIdMap.delete(clientId);
                if (mouseClientIdMap.size === 0) {
                    this.posMap.delete(member.userId);
                }
            }
            this.emit("mousePositionChanged");
            this.emit("focusChanged");
        });

        this.signalManager.on("error", (error) => {
            this.emit("error", error);
        });
        this.signalManager.onSignal(MouseFocusTracker.mouseSignalType, (clientId, local, payload) => {
            this.onMouseSignalFn(clientId, payload);

        });
        this.signalManager.onSignal(MouseFocusTracker.focusSignalType, (clientId, local, payload) => {
            this.onFocusSignalFn(clientId, payload);
        });

        this.signalManager.onSignal(MouseFocusTracker.focusRequestType, () => {
            this.sendFocusSignal(document.hasFocus());
        });
        window.addEventListener("focus", () => {
            this.sendFocusSignal(true);
        });
        window.addEventListener("blur", () => {
            this.sendFocusSignal(false);
        });
        window.addEventListener("mousemove", (e) => {
            console.log("mouse moving");
            this.sendMouseSignal([e.clientX, e.clientY]);
        });
        container.on("connected", () => {
            this.signalManager.submitSignal(MouseFocusTracker.focusRequestType);
        });
        this.signalManager.submitSignal(MouseFocusTracker.focusRequestType);
    }

    /**
     * Alert all connected clients that there has been a change to a client's mouse position
     */

    private sendMouseSignal(position: [number, number] | undefined) {
        this.signalManager.submitSignal(
            MouseFocusTracker.mouseSignalType,
            { userId: this.audience.getMyself()?.userId, pos: position },
        );
    }

    /**
     * Alert all connected clients that there has been a change to a client's focus
     */
    private sendFocusSignal(hasFocus: boolean) {
        this.signalManager.submitSignal(
            MouseFocusTracker.focusSignalType,
            { userId: this.audience.getMyself()?.userId, focus: hasFocus },
        );
    }

    /**
     * Get a copy of the internal focus presences map
     * @returns The map copy
     */
    public getFocusPresences(): Map<string, Map<string, boolean>> {
        // deep copy to prevent outside shenanigans
        const mapCopy = new Map<string, Map<string, boolean>>();
        this.focusMap.forEach((value, key) => {
            mapCopy.set(key, new Map(value));
        });
        return mapCopy;
    }

    /**
     *
     * @returns Preformatted string of focus presence info for all users
     */
    public getFocusPresencesString(newLineSeparator: string = "\n"): string {
        const statuses: string[] = [];
        this.audience.getMembers().forEach((member, userId) => {
            member.connections.forEach((connection) => {
                const focus = this.getFocusPresenceForUser(userId, connection.id);
                const prefix = `User ${member.userId} (${(member as any).userName}) client ${connection.id}:`;
                if (focus === undefined) {
                    statuses.push(`${prefix} unknown focus`);
                } else if (focus === true) {
                    statuses.push(`${prefix} has focus`);
                } else {
                    statuses.push(`${prefix} missing focus`);
                }
            });
        });
        return statuses.join(newLineSeparator);
    }

    /**
     * Get a copy of the internal mouse position presences map
     * @returns The map copy
     */

    public getFocusPresenceForUser(userId: string, clientId: string): boolean | undefined {
        return this.focusMap.get(userId)?.get(clientId);
    }

    /**
     * Get a copy of the internal mouse position presences map
     * @returns The map copy
     */
    public getMousePresences(): Map<string, Map<string, [number, number]>> {
        // deep copy to prevent outside shenanigans
        const mapCopy = new Map<string, Map<string, [number, number]>>();
        this.posMap.forEach((value, key) => {
            mapCopy.set(key, new Map(value));
        });
        return mapCopy;
    }

    public getMousePresencesString(newLineSeparator: string = "\n"): Map<string, [number, number]> {
        const statuses: Map<string, [number, number]> = new Map <string, [number,number]>();
        this.audience.getMembers().forEach((member, userId) => {
            member.connections.forEach((connection) => {
                const position = this.getMousePresenceForUser(userId, connection.id);
                if (position === undefined) {
                }
                else {
                    statuses.set((member as any).userName, position);
                }
            });
        });

        return statuses;

    }

    public getMousePresenceForUser(userId: string, clientId: string): [number, number] | undefined {
        return this.posMap.get(userId)?.get(clientId);
    }
}
