/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer } from "@fluidframework/container-definitions";

import { parseStringDataVersionOne, readVersion } from "../dataTransform";
import type { MigrationState } from "../migratableModel";
import type { IMigrationTool } from "../migrationTool";
import type {
    IInventoryListAppModel,
    IInventoryListAppModelEvents,
    IInventoryList,
} from "../modelInterfaces";

const getStateFromMigrationTool = (migrationTool: IMigrationTool): MigrationState => {
    if (migrationTool.migrated) {
        return "migrated";
    } else if (migrationTool.acceptedVersion !== undefined) {
        return "migrating";
    } else if (migrationTool.proposedVersion !== undefined) {
        return "stopping";
    } else {
        return "collaborating";
    }
};

// Applies string data in version:one format.
const applyStringData = async (inventoryList: IInventoryList, stringData: string) => {
    const parsedInventoryItemData = parseStringDataVersionOne(stringData);
    for (const { name, quantity } of parsedInventoryItemData) {
        inventoryList.addItem(name, quantity);
    }
};

// Exports in version:one format (using ':' delimiter between name/quantity)
const exportStringData = async (inventoryList: IInventoryList) => {
    const inventoryItems = inventoryList.getItems();
    const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
        return `${ inventoryItem.name.getText() }:${ inventoryItem.quantity.toString() }`;
    });
    return `version:one\n${inventoryItemStrings.join("\n")}`;
};

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportType = string;

/**
 * The InventoryListContainer serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel extends TypedEventEmitter<IInventoryListAppModelEvents>
    implements IInventoryListAppModel {
    // To be used by the consumer of the model to pair with an appropriate view.
    public readonly version = "one";
    private _migrationState: MigrationState = "collaborating";
    public getMigrationState(): MigrationState {
        return this._migrationState;
    }

    private readonly _inventoryList: IInventoryList;
    public get inventoryList() {
        return this._inventoryList;
    }

    public constructor(
        inventoryList: IInventoryList,
        private readonly migrationTool: IMigrationTool,
        private readonly container: IContainer,
    ) {
        super();
        this._inventoryList = inventoryList;
        this._migrationState = getStateFromMigrationTool(this.migrationTool);
        this.migrationTool.on("newVersionProposed", this.onNewVersionProposed);
        this.migrationTool.on("newVersionAccepted", this.onNewVersionAccepted);
        this.migrationTool.on("migrated", this.onMigrated);
    }

    public readonly supportsDataFormat = (initialData: unknown): initialData is InventoryListAppModelExportType => {
        if (typeof initialData !== "string" || readVersion(initialData) !== "one") {
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

    private readonly onNewVersionProposed = () => {
        this._migrationState = "stopping";
        this.emit("stopping");
    };

    private readonly onNewVersionAccepted = () => {
        this._migrationState = "migrating";
        this.emit("migrating");
    };

    private readonly onMigrated = () => {
        this._migrationState = "migrated";
        this.emit("migrated");
    };

    public readonly exportData = async (): Promise<InventoryListAppModelExportType> => {
        return exportStringData(this.inventoryList);
    };

    public get proposedVersion() {
        const version = this.migrationTool.proposedVersion;
        if (typeof version !== "string" && version !== undefined) {
            throw new Error("Unexpected code detail format");
        }
        return version;
    }

    public get acceptedVersion() {
        const version = this.migrationTool.acceptedVersion;
        if (typeof version !== "string" && version !== undefined) {
            throw new Error("Unexpected code detail format");
        }
        return version;
    }

    public readonly proposeVersion = (newVersion: string) => {
        this.migrationTool.proposeVersion(newVersion).catch(console.error);
    };

    public get newContainerId() {
        return this.migrationTool.newContainerId;
    }

    public readonly finalizeMigration = async (newContainerId: string) => {
        if (this.newContainerId !== undefined) {
            throw new Error("The migration has already been finalized.");
        }
        return this.migrationTool.setNewContainerId(newContainerId);
    };

    public close() {
        this.container.close();
    }
}
