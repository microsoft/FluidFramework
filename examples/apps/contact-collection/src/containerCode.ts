/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import { ContactCollectionInstantiationFactory, IContactCollection } from "./dataObject.js";

const contactCollectionId = "contactCollection";

export interface IContactCollectionAppModel {
	readonly contactCollection: IContactCollection;
}

class ContactCollectionAppModel implements IContactCollectionAppModel {
	public constructor(public readonly contactCollection: IContactCollection) {}
}

export class ContactCollectionContainerRuntimeFactory extends ModelContainerRuntimeFactory<IContactCollectionAppModel> {
	public constructor() {
		super(
			new Map([ContactCollectionInstantiationFactory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(
			ContactCollectionInstantiationFactory.type,
		);
		await dataStore.trySetAlias(contactCollectionId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return new ContactCollectionAppModel(
			await getDataStoreEntryPoint<IContactCollection>(runtime, contactCollectionId),
		);
	}
}
