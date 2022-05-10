/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IUser } from "@fluidframework/protocol-definitions";
import generateName from "sillyname";
import { v4 as uuid } from "uuid";

/**
 * Create a new user object with a unique id (uuid) and random name (FIRST LAST)
 * @returns a user object with a name and id property
 */
export const generateTestUser = (): IUser & { name: string; } => {
    const user = {
        id: uuid(),
        name: generateName(),
    };
    return user;
};
