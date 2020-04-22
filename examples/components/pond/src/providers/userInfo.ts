/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";
import { IQuorum } from "@microsoft/fluid-protocol-definitions";
import { DependencyContainer } from "@microsoft/fluid-synthesize";
import {
    IComponentRegistry,
    IContainerRuntime,
} from "@microsoft/fluid-runtime-definitions";

import { IComponentUserInformation } from "../interfaces";

export class UserInfo extends EventEmitter implements IComponentUserInformation {
    private readonly quorum: IQuorum;

    public on(event: "membersChanged", listener: () => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public constructor(hostRuntime: IContainerRuntime) {
        super();
        this.quorum = hostRuntime.getQuorum();

        this.quorum.on("addMember", () => {
            this.emit("membersChanged");
        });

        this.quorum.on("removeMember", () => {
            this.emit("membersChanged");
        });
    }

    public get IComponentUserInformation() { return this; }
    public get userCount(): number {
        return this.getHumanUsers().length;
    }

    public getUsers(): string[] {
        return this.getUserNames();
    }

    private getHumanUsers() {
        const members = this.quorum.getMembers();
        return Array.from(members).filter((member) => {
            // We only want interactive users (non-robots)
            return member[1].client.details.capabilities.interactive;
        });
    }

    // Return `First Last` names in the string.
    private getUserNames(): string[] {
        const users = this.getHumanUsers();
        const names: string[] = [];
        for (const user of users) {
            names.push((user[1].client.user as any).name ?? "");
        }
        return names;
    }
}

export const userInfoFactory = async (dc: DependencyContainer) => {
    const s = dc.synthesize<IContainerRuntime>({
        IContainerRuntime,
        IComponentHandleContext,
        IComponentSerializer,
        IComponentRegistry,
    },{});
    const hostRuntime = await s.IContainerRuntime;
    if (hostRuntime) {
        return new UserInfo(hostRuntime);
    }

    return undefined;
};
