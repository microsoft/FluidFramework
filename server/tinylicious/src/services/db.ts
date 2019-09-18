/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb } from "@microsoft/fluid-server-services-core";

export class DB implements IDb {
    public close(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public on(event: string, listener: (...args: any[]) => void) {
        throw new Error("Method not implemented.");
    }

    public collection<T>(name: string): import("@microsoft/fluid-server-services-core").ICollection<T> {
        throw new Error("Method not implemented.");
    }
}
