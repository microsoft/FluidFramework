/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb, IDbFactory } from "@microsoft/fluid-server-services-core";

export class DbFactory implements IDbFactory {
    public connect(): Promise<IDb> {
        throw new Error("Method not implemented.");
    }
}
