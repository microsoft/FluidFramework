/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentUserInformation } from "../interfaces";

export class UserInfo implements IComponentUserInformation{
    public get IComponentUserInformation() { return this; }
    public readonly userCount: number = 101;
    public getUsers(): string[] {
        return ["user1", "user2"];
    }
}

