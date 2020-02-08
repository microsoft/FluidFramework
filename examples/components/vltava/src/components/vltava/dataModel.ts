/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IComponent, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedDirectory } from "@microsoft/fluid-map";
import {
    IQuorum,
} from "@microsoft/fluid-protocol-definitions";

export interface IVltavaDataModel extends EventEmitter {
    getDefaultComponent(): Promise<IComponent>;
    getTitle(): string;
    getUsers(): string[];

    on(event: "membersChanged", listener: (users: string[]) => void): this;
}

export class VltavaDataModel extends EventEmitter implements IVltavaDataModel {
    private readonly quorum: IQuorum;

    public on(event: "membersChanged", listener: (users: string[]) => void): this;
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

    public getUsers(): string[] {
        const members = this.quorum.getMembers();
        const users: string[] = [];
        members.forEach((value) => {
            // Todo: interface says not to use type but there's not alternative
            // should be value.client.details.environment
            if (value.client.type === "browser") {
                users.push((value.client.user as any).name);
            }
        });
        return users;
    }
}
