/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";

export interface IMigrationToolEvents extends IEvent {
    (event: "newVersionAccepted" | "migrated", listener: () => void);
}

export interface IMigrationTool extends IEventProvider<IMigrationToolEvents> {
    migrated: boolean;
    newContainerId: string | undefined;
    setNewContainerId(id: string): Promise<void>;
    acceptedVersion: string | undefined;
    proposeVersion(newVersion: string): Promise<void>;
    volunteerForMigration(): Promise<void>;
    haveMigrationTask(): boolean;
}
