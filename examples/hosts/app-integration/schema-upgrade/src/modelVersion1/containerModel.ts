/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";

import { MigrationState } from "../migrationInterfaces";
import type {
    IContainerKillBit,
} from "../containerKillBit";
import type {
    IInventoryListContainer,
    IInventoryListContainerEvents,
    IInventoryList,
} from "../modelInterfaces";

const getStateFromKillBit = (containerKillBit: IContainerKillBit) => {
    if (containerKillBit.migrated) {
        return MigrationState.migrated;
    } else if (containerKillBit.codeDetailsAccepted) {
        return MigrationState.migrating;
    } else {
        return MigrationState.collaborating;
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

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListContainerExportType = string;

/**
 * The InventoryListContainer serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListContainer extends TypedEventEmitter<IInventoryListContainerEvents>
    implements IInventoryListContainer {
    // To be used by the consumer of the model to pair with an appropriate view.
    public readonly version = "one";
    private _migrationState = MigrationState.collaborating;
    public getMigrationState(): MigrationState {
        return this._migrationState;
    }

    private readonly _inventoryList: IInventoryList;
    public get inventoryList() {
        return this._inventoryList;
    }

    public constructor(
        inventoryList: IInventoryList,
        private readonly containerKillBit: IContainerKillBit,
        private readonly container: IContainer,
    ) {
        super();
        this._inventoryList = inventoryList;
        this._migrationState = getStateFromKillBit(this.containerKillBit);
        this.containerKillBit.on("codeDetailsAccepted", this.onCodeDetailsAccepted);
        this.containerKillBit.on("migrated", this.onMigrated);
    }

    public readonly supportsDataFormat = (initialData: unknown): initialData is InventoryListContainerExportType => {
        if (typeof initialData !== "string") {
            return false;
        }
        try {
            parseStringData(initialData);
        } catch {
            return false;
        }
        return true;
    };

    // Ideally, prevent this from being called after the container has been modified at all -- i.e. only support
    // importing data into a completely untouched InventoryListContainer.
    public readonly importData = async (initialData: unknown) => {
        if (this.container.attachState !== AttachState.Detached) {
            throw new Error("Cannot set initial data after attach");
        }
        if (!this.supportsDataFormat(initialData)) {
            throw new Error("Data format not supported");
        }
        await applyStringData(this.inventoryList, initialData);
    };

    private readonly onCodeDetailsAccepted = () => {
        this._migrationState = MigrationState.migrating;
        this.emit("migrating");
    };

    private readonly onMigrated = () => {
        this._migrationState = MigrationState.migrated;
        this.emit("migrated");
    };

    public readonly exportData = async (): Promise<InventoryListContainerExportType> => {
        return extractStringData(this.inventoryList);
    };

    public get acceptedVersion() {
        const version = this.containerKillBit.acceptedCodeDetails?.package;
        if (typeof version !== "string" && version !== undefined) {
            throw new Error("Unexpected code detail format");
        }
        return version;
    }

    public readonly proposeCodeDetails = (codeDetails: IFluidCodeDetails) => {
        this.containerKillBit.proposeCodeDetails(codeDetails).catch(console.error);
    };

    public readonly proposeVersion = (version: string) => {
        this.containerKillBit.proposeCodeDetails({ package: version }).catch(console.error);
    };

    public get newContainerId() {
        return this.containerKillBit.newContainerId;
    }

    public readonly finalizeMigration = async (newContainerId: string) => {
        if (this.newContainerId !== undefined) {
            throw new Error("The migration has already been finalized.");
        }
        return this.containerKillBit.setNewContainerId(newContainerId);
    };

    public close() {
        this.container.close();
    }
}
