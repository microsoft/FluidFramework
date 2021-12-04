/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { RootDataObject } from "./rootDataObject";
import { ContainerSchema, LoadableObjectRecord } from "./types";

/** Binds a data object to a schema */
export const withSchema = (schema: ContainerSchema): typeof RootDataObject => {
    const RootDOWithMigrations = class extends RootDataObject {
        protected async initializingFromExisting() {
            if (typeof schema.migrations === "undefined") {
                // no-op when no migration routines provided with the schema
                return;
            }

            await this.loadInitialObjects();

            const migrations = typeof schema.migrations === "function" ? [schema.migrations] : schema.migrations;

            for (const migration of migrations) {
                const revision = await migration(
                    this.initialObjects,
                    async (objectClass, props) => { return this.create(objectClass, props); },
                );
                if (revision) {
                    await this.commitRevision(revision);
                }
            }
        }

        async commitRevision(revision: LoadableObjectRecord) {
            this.initialObjectsDir.clear();
            for (const [key,value] of Object.entries(revision)) {
                this.initialObjectsDir.set(key, value.handle);
            }
            for (const prop of Object.getOwnPropertyNames(this.initialObjects)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.initialObjects[prop];
            }
            await this.loadInitialObjects();
        }
    };
    return RootDOWithMigrations;
};
