/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/protocol-definitions";
import generateName from "sillyname";
import { v4 as uuid } from "uuid";

export const generateTestUser = (): IUser & { name: string } => {
    const user = {
        id: uuid(),
        name: generateName(),
    }
    return user; 
} 