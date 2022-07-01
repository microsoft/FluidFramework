/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { extractStringData, writeData } from "./dataHelpers";
import { IContainerKillBit, IDataMigrationService, IInventoryList } from "./interfaces";
import { containerKillBitId } from "./version1";

async function getContainerKillBitFromContainer(container: IContainer): Promise<IContainerKillBit> {
    // Our kill bit is available at the URL containerKillBitId.
    return requestFluidObject<IContainerKillBit>(container, { url: containerKillBitId });
}

export class DataMigrationService implements IDataMigrationService {
    private constructor(
        public readonly containerKillBit: IContainerKillBit,
    ) {
    }

    static async create(container: IContainer) {
        const containerKillBit = await getContainerKillBitFromContainer(container);
        return new DataMigrationService(containerKillBit);
    }

    async endSession() {
        if (!this.containerKillBit.markedForDestruction) {
            await this.containerKillBit.markForDestruction();
        }
    }

    async setDead() {
        await this.containerKillBit.setDead();
    }

    async saveAndEndSession(inventoryList: IInventoryList) {
        await this.endSession();

        if (this.containerKillBit.dead) {
            return undefined;
        }

        // After the quorum proposal is accepted, our system doesn't allow further edits to the string
        // So we can immediately get the data out even before taking the lock.
        const stringData = await extractStringData(inventoryList);
        if (this.containerKillBit.dead) {
            return stringData;
        }

        await this.containerKillBit.volunteerForDestruction();
        if (this.containerKillBit.dead) {
            return stringData;
        }

        await writeData(stringData);
        if (!this.containerKillBit.haveDestructionTask()) {
            throw new Error("Lost task during write");
        } else {
            await this.setDead();
        }
        return stringData;
    }
}
