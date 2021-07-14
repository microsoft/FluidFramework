/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IEvent } from "@fluidframework/common-definitions";
import {
    DataObject,
    DataObjectFactory,
    IMember,
    IServiceAudience,
    SignalManager,
} from "@fluid-experimental/fluid-framework";

export interface IFocusTrackerEvents extends IEvent {
    (event: "focusChanged", listener: () => void): void;
}

/**
 * Data object example of using the audience with signals to track focus
 * state of connected clients without writing changes to a DDS
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export class FocusTracker extends DataObject<{}, undefined, IFocusTrackerEvents> implements EventEmitter {
    private static readonly focusSignalType = "changedFocus";

    /**
     * Local map of focus status for clients
     * Map<userId, Map<clientid, hasFocus>>
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

    private _audience: IServiceAudience<IMember> | undefined;
    public get audience(): IServiceAudience<IMember> {
        if (this._audience === undefined) {
            throw new Error("no audience");
        }
        return this._audience;
    }

    private _signalManager: SignalManager | undefined;
    private get signalManager(): SignalManager {
        if (this._signalManager === undefined) {
            throw new Error("no signalManager");
        }
        return this._signalManager;
    }

    public init(newAudience: IServiceAudience<IMember>) {
        if (this._audience !== undefined || this._signalManager !== undefined) {
            throw new Error("init only once");
        }
        this._audience = newAudience;
        this._signalManager = new SignalManager(this.runtime);

        this._audience.on("memberAdded", (clientId: string, member: IMember) => {
            this.emit("focusChanged");
        });
        this._audience.on("memberRemoved", (clientId: string, member: IMember) => {
            const clientIdMap = this.focusMap.get(member.userId);
            if (clientIdMap !== undefined) {
                clientIdMap.delete(clientId);
                if (clientIdMap.size === 0) {
                    this.focusMap.delete(member.userId);
                }
            }
            this.emit("focusChanged");
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
        this.runtime.on("connected", () => {
            this.signalManager.requestBroadcast(FocusTracker.focusSignalType);
        });
        this.signalManager.requestBroadcast(FocusTracker.focusSignalType);
    }

    public static get Name() { return "@fluid-example/focus-tracker"; }

    public static readonly factory = new DataObjectFactory<FocusTracker, undefined, undefined, IFocusTrackerEvents>
    (
        FocusTracker.Name,
        FocusTracker,
        [],
        {},
    );

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
