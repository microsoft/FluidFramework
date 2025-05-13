/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreChannel, IFluidDataStoreContext } from "./dataStoreContext.js";

/**
 * @legacy
 * @alpha
 */
export const IFluidDataStoreFactory: keyof IProvideFluidDataStoreFactory =
	"IFluidDataStoreFactory";

/**
 * @legacy
 * @alpha
 */
export interface IProvideFluidDataStoreFactory {
	readonly IFluidDataStoreFactory: IFluidDataStoreFactory;
}

/**
 * The `IFluidDataStoreFactory` interface is responsible for creating data stores.
 * A data store is a component that manages a specific set of data and its operations.
 * It encapsulates the logic for data management, synchronization, and interaction
 * with other components within a Fluid container.
 *
 * Data stores are fundamental building blocks in the Fluid Framework. They are used
 * to store and manage state, handle operations, and provide APIs for interacting
 * with the data. Each data store type is associated with a unique identifier (its `type` member)
 * and is typically provided to consumers through a data store registry.
 *
 * The factory is responsible for creating new instances of data stores and loading existing ones.
 * The factory ensures that the data store is correctly initialized.
 *
 * @legacy
 * @alpha
 */
export interface IFluidDataStoreFactory extends IProvideFluidDataStoreFactory {
	/**
	 * Uniquely identifies the type of data store created by this factory.
	 */
	type: string;

	/**
	 * Asynchronously generates the runtime for the data store from the given context.
	 * @remarks
	 * Once created, the data store should be bound to the context.
	 *
	 * This method supports both creation and loading paths. It is important to differentiate
	 * between the two based on the `existing` parameter:
	 * - When `existing` is false, this method creates a new data store.
	 * - When `existing` is true, it loads a pre-existing data store.
	 *
	 * @param context - The context for the data store, providing necessary information and services.
	 * @param existing - A boolean indicating whether the data store is being instantiated from an existing file.
	 * @returns A promise that resolves to the created data store channel.
	 */
	instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel>;

	/**
	 * Synchronously creates a new runtime for a new data store from the provided context.
	 *
	 * @remarks
	 * This method enables a synchronous creation path. Specifically, if this factory is registered
	 * as a child factory in another data store's registry, and the registry synchronously provides
	 * this factory, it becomes eligible for synchronous creation via the parent data store's context.
	 * After creation, all subsequent loads of a data store created through this method will utilize
	 * the asynchronous `instantiateDataStore` method on this factory.
	 *
	 * Note: This method is optional. Not all data stores can or will support a synchronous creation path,
	 * as being synchronous imposes limitations on the capabilities that can be used. Generally, this
	 * creation path should only be implemented when synchronous creation is necessary.
	 *
	 * @param context - The context for the data store, providing the necessary information and services.
	 * @returns An object containing the runtime of the created data store channel.
	 */
	createDataStore?(context: IFluidDataStoreContext): {
		readonly runtime: IFluidDataStoreChannel;
	};
}
