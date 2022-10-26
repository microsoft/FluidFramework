/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidLastEditedTracker, IProvideFluidLastEditedTracker } from "@fluid-experimental/last-edited";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IQuorumClients, ISequencedClient } from "@fluidframework/protocol-definitions";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { handleFromLegacyUri } from "@fluidframework/request-handler";

export interface IVltavaUserDetails {
    name: string;
    colorCode: number;
}

export interface IVltavaLastEditedState {
    user: IVltavaUserDetails;
    time: string;
}

export interface IVltavaDataModel extends EventEmitter {
    getDefaultFluidObject(): Promise<FluidObject>;
    getUsers(): IVltavaUserDetails[];
    getLastEditedState(): Promise<IVltavaLastEditedState | undefined>;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    private readonly quorum: IQuorumClients;
    private users: IVltavaUserDetails[] = [];
    private lastEditedTracker: IFluidLastEditedTracker | undefined;

    public on(event: "membersChanged", listener: (users: Map<string, ISequencedClient>) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    constructor(
        private readonly defaultFluidObject: IFluidHandle,
        private readonly context: IFluidDataStoreContext,
        runtime: IFluidDataStoreRuntime,
    ) {
        super();

        this.quorum = runtime.getQuorum();
        this.quorum.on("addMember", () => {
            const users = this.getUsers();
            this.emit("membersChanged", users);
        });
        this.quorum.on("removeMember", () => {
            const users = this.getUsers();
            this.emit("membersChanged", users);
        });
    }

    public async getDefaultFluidObject(): Promise<FluidObject> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.defaultFluidObject.get()!;
    }

    public getUsers(): IVltavaUserDetails[] {
        this.users = [];
        let refColorCode = 0;
        const members = this.quorum.getMembers();
        members.forEach((value) => {
            if (value.client.details?.capabilities?.interactive) {
                const user: IVltavaUserDetails = {
                    // Casting IUser to any to get the name is ugly but currently there is no other way to do it.
                    // Servers extend IUser in their own specific interface to add name but all of them do have it.
                    name: (value.client.user as any).name,
                    colorCode: refColorCode++,
                };
                this.users.push(user);
            }
        });
        return this.users;
    }

    public async getLastEditedState(): Promise<IVltavaLastEditedState | undefined> {
        // Set up the tracker the first time last edited state is requested.
        if (this.lastEditedTracker === undefined) {
            await this.setupLastEditedTracker();
        }

        const lastEditedDetails = this.lastEditedTracker?.getLastEditDetails();
        if (lastEditedDetails === undefined) {
            return;
        }

        // Casting IUser to any to get the name is ugly but currently there is no other way to do it.
        // Servers extend IUser in their own specific interface to add name but all of them do have it.
        const userName = (lastEditedDetails.user as any).name;
        let colorCode = 0;
        this.users.forEach((userDetails: IVltavaUserDetails) => {
            if (userDetails.name === userName) {
                colorCode = userDetails.colorCode;
            }
        });

        const date = new Date(lastEditedDetails.timestamp);
        const lastEditedState: IVltavaLastEditedState = {
            user: {
                name: userName,
                colorCode,
            },
            time: date.toLocaleString(),
        };

        return lastEditedState;
    }

    private async setupLastEditedTracker() {
        const handle = handleFromLegacyUri<IProvideFluidLastEditedTracker>(
            ContainerRuntimeFactoryWithDefaultDataStore.defaultDataStoreId,
            this.context.containerRuntime);
        this.lastEditedTracker = (await handle.get()).IFluidLastEditedTracker;
    }
}
