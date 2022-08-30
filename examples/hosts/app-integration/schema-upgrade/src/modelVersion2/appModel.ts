/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer } from "@fluidframework/container-definitions";

import { parseStringDataVersionTwo, readVersion } from "../dataTransform";
import type { IMigrationTool } from "../migrationInterfaces";
import type {
    IInventoryListAppModel,
    IInventoryListAppModelEvents,
    IInventoryList,
} from "../modelInterfaces";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportType = string;

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel extends TypedEventEmitter<IInventoryListAppModelEvents>
    implements IInventoryListAppModel {
    // To be used by the consumer of the model to pair with an appropriate view.
    public readonly version = "two";

    private readonly _inventoryList: IInventoryList;
    public get inventoryList() {
        return this._inventoryList;
    }

    private readonly _migrationTool: IMigrationTool;
    public get migrationTool() {
        return this._migrationTool;
    }

    public constructor(
        inventoryList: IInventoryList,
        migrationTool: IMigrationTool,
        private readonly container: IContainer,
    ) {
        super();
        this._inventoryList = inventoryList;
        this._migrationTool = migrationTool;
    }

    public readonly supportsDataFormat = (initialData: unknown): initialData is InventoryListAppModelExportType => {
        if (typeof initialData !== "string" || readVersion(initialData) !== "two") {
            return false;
        }
        return true;
    };

    // Ideally, prevent this from being called after the container has been modified at all -- i.e. only support
    // importing data into a completely untouched InventoryListAppModel.
    public readonly importData = async (initialData: unknown) => {
        if (this.container.attachState !== AttachState.Detached) {
            throw new Error("Cannot set initial data after attach");
        }
        if (!this.supportsDataFormat(initialData)) {
            throw new Error("Data format not supported");
        }

        // Applies string data in version:two format.
        const parsedInventoryItemData = parseStringDataVersionTwo(initialData);
        for (const { name, quantity } of parsedInventoryItemData) {
            this.inventoryList.addItem(name, quantity);
        }
    };

    public readonly exportData = async (): Promise<InventoryListAppModelExportType> => {
        // Exports in version:two format (using tab delimiter between name/quantity)
        const inventoryItems = this.inventoryList.getItems();
        const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
            return `${ inventoryItem.name.getText() }\t${ inventoryItem.quantity.toString() }`;
        });
        return `version:two\n${inventoryItemStrings.join("\n")}`;
    };

    public close() {
        this.container.close();
    }
}
