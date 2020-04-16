/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQuorum } from "@microsoft/fluid-protocol-definitions";
import { DependencyContainer } from "@microsoft/fluid-synthesize";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

import { IComponentUserInformation } from "../interfaces";

export class UserInfo implements IComponentUserInformation{
    public constructor(private readonly quorum: IQuorum) {
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

    // private getUserEmails(): string[] {
    //     const users = this.getHumanUsers();
    //     const emails: string[] = [];
    //     for (const user of users) {
    //         emails.push((user[1].client.user as any).email ?? "");
    //     }
    //     return emails;
    // }

    // Return `First Last` names in the string.
    private getUserNames(): string[] {
        const users = this.getHumanUsers();
        const names: string[] = [];
        for (const user of users) {
            names.push((user[1].client.user as any).name ?? "");
        }
        return names;
    }

    // private getUniqueClientId(): string[] {
    //     const users = this.getHumanUsers();
    //     const ids: string[] = [];
    //     for (const user of users) {
    //         ids.push(user[0]);
    //     }
    //     return ids;
    // }
}

export const userInfoFactory = async (dc: DependencyContainer) => {
    const s = dc.synthesize<IHostRuntime>({
        IHostRuntime,
        IComponentHandleContext:"IComponentHandleContext",
        IComponentSerializer:"IComponentSerializer",
        IComponentRegistry:"IComponentRegistry",
    },{});
    const hostRuntime = await s.IHostRuntime;
    if (hostRuntime) {
        return new UserInfo(hostRuntime.getQuorum());
    }

    return undefined;
};
