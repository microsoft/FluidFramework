/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";

import { extractStringData } from "./dataHelpers";
import { externalDataSource } from "./externalData";
import type { IContainerKillBit, IInventoryList } from "./interfaces";

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
    public readonly debug = new AppDebug(this.inventoryList, this.containerKillBit);

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
