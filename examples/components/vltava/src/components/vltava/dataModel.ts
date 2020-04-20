/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IComponentLastEditedTracker } from "@microsoft/fluid-last-edited-experimental";
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
    private users: IVltavaUserDetails[] = [];

    public on(event: "membersChanged", listener: (users: Map<string, ISequencedClient>) => void): this;
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
                    name: (value.client.user as any).name,
                    colorCode: refColorCode++,
                };
                this.users.push(user);
            }
        });
        return this.users;
    }

    public getLastEditedUser(): IVltavaUserDetails | undefined {
        const lastEditedDetails = this.lastEditedTracker.getLastEditDetails();
        if (lastEditedDetails) {
            const userName = (lastEditedDetails.user as any).name;
            let colorCode = 0;
            this.users.forEach((userDetails: IVltavaUserDetails) => {
                if (userDetails.name === userName) {
                    colorCode = userDetails.colorCode;
                }
            });
            return {
                name: userName,
                colorCode,
            };
        }
        return undefined;
    }

    public getLastEditedTime(): string | undefined {
        const lastEditedDetails = this.lastEditedTracker.getLastEditDetails();
        if (lastEditedDetails) {
            const date = new Date(lastEditedDetails.timestamp);
            return date.toUTCString();
        }
        return undefined;
    }
}
