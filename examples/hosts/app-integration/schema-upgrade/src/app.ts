/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import type { IApp, IAppEvents, IContainerKillBit, IInventoryList } from "./interfaces";
import { SessionState } from "./interfaces";
import { containerKillBitId } from "./version1";

async function getInventoryListFromContainer(container: IContainer): Promise<IInventoryList> {
    // Our inventory list is available at the URL "/".
    return requestFluidObject<IInventoryList>(container, { url: "/" });
}

async function getContainerKillBitFromContainer(container: IContainer): Promise<IContainerKillBit> {
    // Our kill bit is available at the URL containerKillBitId.
    return requestFluidObject<IContainerKillBit>(container, { url: containerKillBitId });
}

const getStateFromKillBit = (containerKillBit: IContainerKillBit) => {
    if (containerKillBit.migrated) {
        return SessionState.ended;
    } else if (containerKillBit.codeDetailsProposed) {
        return SessionState.migrating;
    } else {
        return SessionState.collaborating;
    }
};

// These helper functions produce and consume the same stringified form of the data.
function parseStringData(stringData: string) {
    const itemStrings = stringData.split("\n");
    return itemStrings.map((itemString) => {
        const [itemNameString, itemQuantityString] = itemString.split(":");
        return { name: itemNameString, quantity: parseInt(itemQuantityString, 10) };
    });
}

const applyStringData = async (inventoryList: IInventoryList, stringData: string) => {
    const parsedInventoryItemData = parseStringData(stringData);
    for (const { name, quantity } of parsedInventoryItemData) {
        inventoryList.addItem(name, quantity);
    }
};

const extractStringData = async (inventoryList: IInventoryList) => {
    const inventoryItems = inventoryList.getItems();
    const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
        return `${ inventoryItem.name.getText() }:${ inventoryItem.quantity.toString() }`;
    });
    return inventoryItemStrings.join("\n");
};

/**
 * The App serves the purpose of wrapping this particular Container in a friendlier interface, with stronger typing
 * and accessory functionality.  It should have the same layering restrictions as we want for the Container (e.g. no
 * direct access to the Loader).  It does not have a goal of being general-purpose like Container does -- instead it
 * is specially designed for the specific container code.  It seems likely that a bootloader layer might want to
 * exist to bridge the gap between loading the container and being sure the App is the right type for the container.
 */
export class App extends TypedEventEmitter<IAppEvents> implements IApp {
    private _sessionState = SessionState.collaborating;
    public getSessionState(): SessionState {
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
        this._sessionState = getStateFromKillBit(this._containerKillBit);
        this.containerKillBit.on("codeDetailsAccepted", this.onStateChanged);
        this.containerKillBit.on("migrated", this.onStateChanged);

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

    public get acceptedCodeDetails() {
        return this.containerKillBit.acceptedCodeDetails;
    }

    public readonly proposeCodeDetails = (codeDetails: IFluidCodeDetails) => {
        this.containerKillBit.proposeCodeDetails(codeDetails).catch(console.error);
    };

    public get newContainerId() {
        return this.containerKillBit.newContainerId;
    }

    public readonly finalizeMigration = (newContainerId: string) => {
        if (this.newContainerId !== undefined) {
            throw new Error("The migration has already been finalized.");
        }
        this.containerKillBit.setNewContainerId(newContainerId).catch(console.error);
    };
}
