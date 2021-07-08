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

        this._audience.on("membersChanged", () => {
            this.pruneFocusMap();
            this.emit("focusChanged");
            // TODO: Currently the current connecting client does not always broadcast its
            // status on connection because it can't identify itself in the audience yet
            // (e.g. if the Container hasn't connected).  Once audience events are cleaned
            // up we can check for ourself here and broadcast.
        });

        this.signalManager.registerListener(FocusTracker.focusSignalType, (clientId, local, payload) => {
            this.onFocusSignalFn(clientId, payload);
        });
        this.signalManager.registerBroadcastListener(FocusTracker.focusSignalType, () => {
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
     * Go through the current audience to remove entries in our focus map on clients
     * that are no longer present
     */
    private pruneFocusMap() {
        this.focusMap.forEach((clientIdMap, userId) => {
            clientIdMap.forEach((hasFocus, clientId) => {
                if (this.audience.getMemberByClientId(clientId) === undefined) {
                    clientIdMap.delete(clientId);
                }
            });
        });
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
