/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IComponentLastEditedTracker } from "@microsoft/fluid-last-edited-experimental";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IQuorum, ISequencedClient } from "@microsoft/fluid-protocol-definitions";

export interface IVltavaUserDetails {
    name: string,
    colorCode: number,
}

export interface IVltavaLastEditedState {
    user: IVltavaUserDetails,
    time: string,
}

export interface IVltavaDataModel extends EventEmitter {
    getDefaultComponent(): Promise<IComponent>;
    getTitle(): string;
    getUsers(): IVltavaUserDetails[];
    getLastEditedState(): Promise<IVltavaLastEditedState | undefined>;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    private readonly quorum: IQuorum;
    private users: IVltavaUserDetails[] = [];
    private lastEditedTracker: IComponentLastEditedTracker | undefined;

    public on(event: "membersChanged", listener: (users: Map<string, ISequencedClient>) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    constructor(
        private readonly root: ISharedDirectory,
        private readonly context: IComponentContext,
        runtime: IComponentRuntime,
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

    public async getDefaultComponent(): Promise<IComponent> {
        return this.root.get<IComponentHandle>("tabs-component-id").get();
    }

    public getTitle(): string {
        return this.context.documentId;
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
        const response = await this.context.containerRuntime.request({ url: "default" });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error("Can't find last edited component");
        }
        this.lastEditedTracker = response.value.IComponentLastEditedTracker;
    }
}
