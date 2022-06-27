/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";

import { AttachState, IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { applyStringData, extractStringData } from "./dataHelpers";
import { externalDataSource } from "./externalData";
import type { IContainerKillBit, IInventoryList } from "./interfaces";
import { containerKillBitId } from "./version1";

async function getInventoryListFromContainer(container: IContainer): Promise<IInventoryList> {
    // Our inventory list is available at the URL "/".
    return requestFluidObject<IInventoryList>(container, { url: "/" });
}

async function getContainerKillBitFromContainer(container: IContainer): Promise<IContainerKillBit> {
    // Our kill bit is available at the URL containerKillBitId.
    return requestFluidObject<IContainerKillBit>(container, { url: containerKillBitId });
}

export class AppDebug extends EventEmitter {
    private _sessionState = SessionState.collaborating;
    public get sessionState(): SessionState {
        return this._sessionState;
    }

    public constructor(
        public readonly inventoryList: IInventoryList,
        private readonly containerKillBit: IContainerKillBit,
    ) {
        super();
        this.containerKillBit.on("markedForDestruction", this.onStateChanged);
        this.containerKillBit.on("dead", this.onStateChanged);
    }

    private readonly onStateChanged = () => {
        const newState = getStateFromKillBit(this.containerKillBit);
        // assert new state !== old state
        this._sessionState = newState;
        this.emit("sessionStateChanged", this._sessionState);
    };
}

const getStateFromKillBit = (containerKillBit: IContainerKillBit) => {
    if (containerKillBit.dead) {
        return SessionState.ended;
    } else if (containerKillBit.markedForDestruction) {
        return SessionState.ending;
    } else {
        return SessionState.collaborating;
    }
};

export enum SessionState {
    collaborating,
    ending,
    ended,
}

export class App extends EventEmitter {
    private _sessionState = SessionState.collaborating;
    public get sessionState(): SessionState {
        return this._sessionState;
    }

    private _inventoryList: IInventoryList | undefined;
    public get inventoryList() {
        if (this._inventoryList === undefined) {
            throw new Error("Initialize App before using");
        }
        return this._inventoryList;
    }

    private _containerKillBit: IContainerKillBit | undefined;
    private get containerKillBit() {
        if (this._containerKillBit === undefined) {
            throw new Error("Initialize App before using");
        }
        return this._containerKillBit;
    }

    public constructor(private readonly container: IContainer) {
        super();
    }

    public readonly initialize = async (initialData?: string) => {
        if (initialData !== undefined && this.container.attachState !== AttachState.Detached) {
            throw new Error("Cannot set initial data after attach");
        }

        this._inventoryList = await getInventoryListFromContainer(this.container);
        this._containerKillBit = await getContainerKillBitFromContainer(this.container);
        this.containerKillBit.on("markedForDestruction", this.onStateChanged);
        this.containerKillBit.on("dead", this.onStateChanged);

        if (initialData !== undefined) {
            await applyStringData(this.inventoryList, initialData);
        }
    };

    private readonly onStateChanged = () => {
        const newState = getStateFromKillBit(this.containerKillBit);
        // assert new state !== old state
        this._sessionState = newState;
        this.emit("sessionStateChanged", this._sessionState);
    };

    public readonly exportStringData = async () => {
        return extractStringData(this.inventoryList);
    };

    public readonly writeToExternalStorage = async () => {
        // CONSIDER: it's perhaps more-correct to spawn a new client to extract with (to avoid local changes).
        // This can be done by making a loader.request() call with appropriate headers (same as we do for the
        // summarizing client).  E.g.
        // const exportContainer = await loader.resolve(...);
        // const inventoryList = (await exportContainer.request(...)).value;
        // const stringData = extractStringData(inventoryList);
        // exportContainer.close();

        const stringData = await extractStringData(this.inventoryList);
        await externalDataSource.writeData(stringData);
    };

    public readonly proposeEndSession = () => {
        this.containerKillBit.markForDestruction().catch(console.error);
    };

    public readonly endSession = () => {
        this.containerKillBit.setDead().catch(console.error);
    };

    public readonly saveAndEndSession = async () => {
        if (!this.containerKillBit.markedForDestruction) {
            await this.containerKillBit.markForDestruction();
        }

        if (this.containerKillBit.dead) {
            return;
        }

        // After the quorum proposal is accepted, our system doesn't allow further edits to the string
        // So we can immediately get the data out even before taking the lock.
        const stringData = await extractStringData(this.inventoryList);
        if (this.containerKillBit.dead) {
            return;
        }

        await this.containerKillBit.volunteerForDestruction();
        if (this.containerKillBit.dead) {
            return;
        }

        await externalDataSource.writeData(stringData);
        if (!this.containerKillBit.haveDestructionTask()) {
            throw new Error("Lost task during write");
        } else {
            await this.containerKillBit.setDead();
        }
    };
}
