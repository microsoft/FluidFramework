/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb, IDbFactory } from "@fluidframework/server-services-core";
import { InMemoryDb } from "./inMemorydb";

export class DbFactory implements IDbFactory {
    private readonly db = new InMemoryDb();

    public async connect(): Promise<IDb> {
        return this.db;
    }
}
