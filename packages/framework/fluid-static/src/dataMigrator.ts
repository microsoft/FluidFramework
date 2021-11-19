/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDirectory } from "@fluidframework/map";
import { IDataMigrator, LoadableObjectRecord } from "./types";

export class DataMigrator implements IDataMigrator {
    private constructor() {}

    async static create(objects: IDirectory) {
        // We will always load the initial objects so they are available to the developer
        const loadInitialObjectsP: Promise<void>[] = [];
        for (const [key, value] of Array.from(this.initialObjectsDir.entries())) {
            const loadDir = async () => {
                const obj = await value.get();
                Object.assign(this._initialObjects, { [key]: obj });
            };
            loadInitialObjectsP.push(loadDir());
        }

        await Promise.all(loadInitialObjectsP);
    }

    get snapshot(): LoadableObjectRecord {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return undefined as any;
    }
    addObject(key: string, object: any, props: any) {
        throw new Error("Method not implemented.");
    }
    dropObject(key: string): void {
        throw new Error("Method not implemented.");
    }
    commit(): void {
        throw new Error("Method not implemented.");
    }
}
