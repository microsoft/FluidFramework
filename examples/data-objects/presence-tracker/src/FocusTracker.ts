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

export class FocusTracker extends TypedEventEmitter<IFocusTrackerEvents> {
    private static readonly focusSignalType = "changedFocus";
    private static readonly focusRequestType = "focusRequest";

    /**
     * Local map of focus status for clients
     *
     * @example
     * ```typescript
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

        this.audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const focusClientIdMap = this.focusMap.get(member.userId);
            if (focusClientIdMap !== undefined) {
                focusClientIdMap.delete(clientId);
                if (focusClientIdMap.size === 0) {
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

        this.signalManager.onSignal(FocusTracker.focusRequestType, () => {
            this.sendFocusSignal(document.hasFocus());
        });
        window.addEventListener("focus", () => {
            this.sendFocusSignal(true);
        });
        window.addEventListener("blur", () => {
            this.sendFocusSignal(false);
        });
        container.on("connected", () => {
            this.signalManager.submitSignal(FocusTracker.focusRequestType);
        });
        this.signalManager.submitSignal(FocusTracker.focusRequestType);
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

    public getFocusPresences(): Map<string, boolean> {
        const statuses: Map<string, boolean> = new Map <string, boolean>();
        this.audience.getMembers().forEach((member, userId) => {
            member.connections.forEach((connection) => {
                const focus = this.getFocusPresenceForUser(userId, connection.id);
                if (focus !== undefined) {
                    statuses.set((member as any).userName, focus);
                }
            });
        });
        return statuses;
    }

    /**
     * Returns focus status of specified client
     */
    public getFocusPresenceForUser(userId: string, clientId: string): boolean | undefined {
        return this.focusMap.get(userId)?.get(clientId);
    }
}
