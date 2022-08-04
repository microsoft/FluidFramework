/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";

export interface IContainerKillBitEvents extends IEvent {
    (event: "codeDetailsAccepted" | "migrated", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    migrated: boolean;
    newContainerId: string | undefined;
    setNewContainerId(id: string): Promise<void>;
    codeDetailsAccepted: boolean;
    acceptedCodeDetails: IFluidCodeDetails | undefined;
    proposeCodeDetails(codeDetails: IFluidCodeDetails): Promise<void>;
    volunteerForMigration(): Promise<void>;
    haveMigrationTask(): boolean;
}
