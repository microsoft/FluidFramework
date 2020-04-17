/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IComponentLastEditedTracker, ILastEditDetails } from "@microsoft/fluid-last-edited-experimental";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IQuorum, ISequencedClient } from "@microsoft/fluid-protocol-definitions";

export interface IVltavaUserDetails {
    name: string,
    colorCode: number,
}

export interface IVltavaDataModel extends EventEmitter {
    getDefaultComponent(): Promise<IComponent>;
    getTitle(): string;
    getUsers(): IVltavaUserDetails[];
    getLastEditedUser(): IVltavaUserDetails | undefined;
    getLastEditedTime(): string | undefined;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    private readonly quorum: IQuorum;
    private readonly users: Map<string, IVltavaUserDetails> = new Map();
    private lastEditedUser: IVltavaUserDetails | undefined;
    private lastEditedTime: string | undefined;
    private refColorCode = 0;

    public on(event: "membersChanged", listener: () => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    constructor(
        private readonly root: ISharedDirectory,
        private readonly lastEditedTracker: IComponentLastEditedTracker,
        private readonly context: IComponentContext,
        runtime: IComponentRuntime,
    ) {
        super();

        this.quorum = runtime.getQuorum();
        this.quorum.getMembers().forEach((member: ISequencedClient, clientId: string) => {
            this.addUser(clientId, member);
        });

        this.quorum.on("addMember", (clientId: string, member: ISequencedClient) => {
            this.addUser(clientId, member);
            this.emit("membersChanged");
        });
        this.quorum.on("removeMember", (clientId) => {
            this.removeUser(clientId);
            this.emit("membersChanged");
        });

        const details = this.lastEditedTracker.getLastEditDetails();
        if (details) {
            this.setLastEditedState(details);
        }

        this.lastEditedTracker.on("lastEditedChanged", (lastEditDetails: ILastEditDetails) => {
            this.setLastEditedState(lastEditDetails);
            this.emit("lastEditedChanged");
        });
    }

    public async getDefaultComponent(): Promise<IComponent> {
        return this.root.get<IComponentHandle>("tabs-component-id").get();
    }

    public getTitle(): string {
        return this.context.documentId;
    }

    public getUsers(): IVltavaUserDetails[] {
        const users: IVltavaUserDetails[] = [];
        this.users.forEach((user: IVltavaUserDetails) => {
            users.push(user);
        });
        return users;
    }

    public getLastEditedUser(): IVltavaUserDetails | undefined {
        return this.lastEditedUser;
    }

    public getLastEditedTime(): string | undefined {
        return this.lastEditedTime;
    }

    private addUser(clientId: string, member: ISequencedClient) {
        if (member && member.client.details?.capabilities?.interactive) {
            const userDetails: IVltavaUserDetails = {
                name: (member.client.user as any).name,
                colorCode: this.refColorCode++,
            };
            this.users.set(clientId, userDetails);
        }
    }

    private removeUser(clientId: string) {
        this.users.delete(clientId);
    }

    private setLastEditedState(lastEditDetails: ILastEditDetails) {
        this.lastEditedUser = this.users.get(lastEditDetails.clientId);
        const date = new Date(lastEditDetails.timestamp);
        this.lastEditedTime = date.toUTCString();
    }
}
