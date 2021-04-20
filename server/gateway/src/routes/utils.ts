/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/protocol-definitions";
import { chooseCelaName } from "@fluidframework/server-services-core";
import { Request } from "express";
import { v4 as uuid } from "uuid";

export interface IExtendedUser extends IUser {
    displayName: string;
    name: string;
}

export function getUser(request: Request): IExtendedUser | undefined {
    if ("cela" in request.query) {
        const celaName = chooseCelaName();
        return { id: uuid(), name: celaName, displayName: celaName };
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    } else if (request.user) {
        return {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        };
    }
}
