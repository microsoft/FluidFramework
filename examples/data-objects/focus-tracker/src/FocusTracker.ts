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

export interface IFocusTrackerEvents extends IEvent {
    (event: "focusChanged", listener: () => void): void;
}

/**
 * Example of using the audience with signals to track focus state of connected clients
 * without writing changes to a DDS.
 */
export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
    private static readonly focusSignalType = "changedFocus";

    /**
     * Local map of focus status for clients
     *
     * ```
     * Map<userId, Map<clientid, hasFocus>>
     * ```
     */
    private readonly focusMap = new Map<string, Map<string, boolean>>();

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

    public constructor(
        container: IFluidContainer,
        public readonly audience: IServiceAudience<IMember>,
        private readonly signalManager: SignalManager,
    ) {
        super();

        this.audience.on("memberAdded", (clientId: string, member: IMember) => {
            this.emit("focusChanged");
        });
        this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const clientIdMap = this.focusMap.get(member.userId);
            if (clientIdMap !== undefined) {
                clientIdMap.delete(clientId);
                if (clientIdMap.size === 0) {
                    this.focusMap.delete(member.userId);
                }
            }
            this.emit("focusChanged");
        });

        this.signalManager.on("error", (error) => {
            this.emit("error", error);
        });
        this.signalManager.onSignal(FocusTracker.focusSignalType, (clientId, local, payload) => {
            this.onFocusSignalFn(clientId, payload);
        });
        this.signalManager.onBroadcastRequested(FocusTracker.focusSignalType, () => {
            this.sendFocusSignal(document.hasFocus());
        });
        window.addEventListener("focus", () => {
            this.sendFocusSignal(true);
        });
        window.addEventListener("blur", () => {
            this.sendFocusSignal(false);
        });

        container.on("connected", () => {
            this.signalManager.requestBroadcast(FocusTracker.focusSignalType);
        });
        this.signalManager.requestBroadcast(FocusTracker.focusSignalType);
    }

    /**
     * Alert all connected clients that there has been a change to a client's focus
     */
    private sendFocusSignal(hasFocus: boolean) {
        this.signalManager.submitSignal(
            FocusTracker.focusSignalType,
            { userId: this.audience.getMyself()?.userId, focus: hasFocus },
        );
    }

    /**
     * Get a copy of the internal presences map
     * @returns The map copy
     */
    public getPresences(): Map<string, Map<string, boolean>> {
        // deep copy to prevent outside shenanigans
        const mapCopy = new Map<string, Map<string, boolean>>();
        this.focusMap.forEach((value, key) => {
            mapCopy.set(key, new Map(value));
        });
        return mapCopy;
    }

    /**
     *
     * @returns Preformatted string of presence info for all users
     */
    public getPresencesString(newLineSeparator: string = "\n"): string {
        const statuses: string[] = [];
        this.audience.getMembers().forEach((member, userId) => {
            member.connections.forEach((connection) => {
                const focus = this.getPresenceForUser(userId, connection.id);
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

    public getPresenceForUser(userId: string, clientId: string): boolean | undefined {
        return this.focusMap.get(userId)?.get(clientId);
    }
}
