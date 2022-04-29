/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IQuorumClients } from "@fluidframework/protocol-definitions";
import { IFluidDependencySynthesizer } from "@fluidframework/synthesize";
import { IContainerRuntime, IProvideContainerRuntime } from "@fluidframework/container-runtime-definitions";

import { IFluidUserInformation } from "../interfaces";

export class UserInfo extends EventEmitter implements IFluidUserInformation {
    private readonly quorum: IQuorumClients;

    public on(event: "membersChanged", listener: () => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public constructor(containerRuntime: IContainerRuntime) {
        super();
        this.quorum = containerRuntime.getQuorum();

        this.quorum.on("addMember", () => {
            this.emit("membersChanged");
        });

        this.quorum.on("removeMember", () => {
            this.emit("membersChanged");
        });
    }

    public get IFluidUserInformation() { return this; }
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

export const userInfoFactory = async (dc: IFluidDependencySynthesizer) => {
    // eslint-disable-next-line @typescript-eslint/ban-types
    const s = dc.synthesize<{}, IProvideContainerRuntime>(
        {},
        { IContainerRuntime });
    const containerRuntime = await s.IContainerRuntime;
    return new UserInfo(containerRuntime);
};
