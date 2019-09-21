/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb, IDbFactory } from "@microsoft/fluid-server-services-core";
import { DB } from "./db";

export class DbFactory implements IDbFactory {
    private db = new DB();

    public async connect(): Promise<IDb> {
        return this.db;
    }
}
