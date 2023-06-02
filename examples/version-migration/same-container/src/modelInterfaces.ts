/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type {
	ISameContainerMigratableModel,
	ISameContainerMigratableModelEvents,
} from "@fluid-example/example-utils";
import type { IEventProvider } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IInventoryListAppModelEvents extends ISameContainerMigratableModelEvents {}

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IInventoryListAppModel
	extends ISameContainerMigratableModel,
		IEventProvider<IInventoryListAppModelEvents> {
	/**
	 * An inventory tracker list.
	 */
	readonly inventoryList: IInventoryList;
	// TODO: TEMPORARY debug API to advance past the code proposal phase, until we have a good way to get the container ref inside the MigrationTool.
	readonly DEBUG_proposeCodeDetails: (codeDetails: IFluidCodeDetails) => Promise<void>;

	// TODO: TEMPORARY debug API to trigger a summary - for now the demo disables automatic summarization entirely, so this allows it to advance past the stages that require a summary.
	readonly DEBUG_summarizeOnDemand: () => void;
}

export interface IInventoryItem extends EventEmitter {
	readonly id: string;
	readonly name: SharedString;
	quantity: number;
}

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IInventoryList extends EventEmitter {
	readonly addItem: (name: string, quantity: number) => void;
	readonly deleteItem: (id: string) => void;

	readonly getItems: () => IInventoryItem[];
	readonly getItem: (id: string) => IInventoryItem | undefined;

	/**
	 * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
	 */
	on(event: "itemAdded" | "itemDeleted", listener: (item: IInventoryItem) => void): this;
}
