/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { assert } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IOldestClientObserver } from "./interfaces";

/**
 * The `OldestClientObserver` is a utility inspect if the local client is the oldest amongst connected clients (in
 * terms of when they connected) and watch for changes.
 *
 * It is still experimental and under development.  Please do try it out, but expect breaking changes in the future.
 *
 * @remarks
 * ### Creation
 *
 * The `OldestClientObserver` constructor takes an `IContainerRuntime`:
 *
 * ```typescript
 * const oldestClientObserver = new OldestClientObserver(containerRuntime);
 * ```
 *
 * ### Usage
 *
 * To check if the local client is the oldest, use the `isOldest()` method.
 *
 * ```typescript
 * if (oldestClientObserver.isOldest()) {
 *     console.log("I'm the oldest");
 * } else {
 *     console.log("Someone else is older");
 * }
 * ```
 *
 * ### Eventing
 *
 * `OldestClientObserver` is an `EventEmitter`, and will emit events when the local client becomes the oldest and when
 * it is no longer the oldest.
 *
 * ```typescript
 * oldestClientObserver.on("becameOldest", () => {
 *     console.log("I'm the oldest now");
 * });
 *
 * oldestClientObserver.on("lostOldest", () => {
 *     console.log("I'm not the oldest anymore");
 * });
 * ```
 */
export class OldestClientObserver extends EventEmitter implements IOldestClientObserver {
    private readonly quorum: IQuorum;
    private currentIsOldest: boolean = false;
    constructor(private readonly containerRuntime: IContainerRuntime) {
        super();
        this.quorum = this.containerRuntime.getQuorum();
        this.currentIsOldest = this.computeIsOldest();
        this.quorum.on("addMember", this.updateOldest);
        this.quorum.on("removeMember", this.updateOldest);
        containerRuntime.on("connected", this.updateOldest);
        containerRuntime.on("disconnected", this.updateOldest);
    }

    public isOldest(): boolean {
        return this.currentIsOldest;
    }

    private readonly updateOldest = () => {
        const oldest = this.computeIsOldest();
        if (this.currentIsOldest !== oldest) {
            this.currentIsOldest = oldest;
            if (oldest) {
                this.emit("becameOldest");
            } else {
                this.emit("lostOldest");
            }
        }
    };

    private computeIsOldest(): boolean {
        // If the container is detached, we are the only ones that know about it and are the oldest by default.
        if (this.containerRuntime.attachState === AttachState.Detached) {
            return true;
        }

        // If we're not connected we can't be the oldest connected client.
        if (!this.containerRuntime.connected) {
            return false;
        }

        assert(this.containerRuntime.clientId !== undefined, "Client id should be set if connected");

        const selfSequencedClient = this.quorum.getMember(this.containerRuntime.clientId);
        // When in readonly mode our clientId will not be present in the quorum.
        if (selfSequencedClient === undefined) {
            return false;
        }

        const members = this.quorum.getMembers();
        for (const sequencedClient of members.values()) {
            if (sequencedClient.sequenceNumber < selfSequencedClient.sequenceNumber) {
                return false;
            }
        }

        // No member of the quorum was older
        return true;
    }
}
