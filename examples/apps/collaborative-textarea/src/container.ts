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

import { CollaborativeText } from "./fluid-object/index.js";

export interface ICollaborativeTextAppModel {
	readonly collaborativeText: CollaborativeText;
}

class CollaborativeTextAppModel implements ICollaborativeTextAppModel {
	public constructor(public readonly collaborativeText: CollaborativeText) {}
}

const collaborativeTextId = "collaborative-text";

export class CollaborativeTextContainerRuntimeFactory extends ModelContainerRuntimeFactory<ICollaborativeTextAppModel> {
	constructor() {
		super(
			new Map([CollaborativeText.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const collaborativeText = await runtime.createDataStore(
			CollaborativeText.getFactory().type,
		);
		await collaborativeText.trySetAlias(collaborativeTextId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<CollaborativeTextAppModel> {
		return new CollaborativeTextAppModel(
			await getDataStoreEntryPoint<CollaborativeText>(runtime, collaborativeTextId),
		);
	}
}
