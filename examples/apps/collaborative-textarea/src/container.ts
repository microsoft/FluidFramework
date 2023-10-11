/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { CollaborativeText } from "./fluid-object";

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
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const collaborativeText = await runtime.createDataStore(
			CollaborativeText.getFactory().type,
		);
		await collaborativeText.trySetAlias(collaborativeTextId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		// eslint-disable-next-line import/no-deprecated
		const collaborativeText = await requestFluidObject<CollaborativeText>(
			await runtime.getRootDataStore(collaborativeTextId),
			"",
		);
		return new CollaborativeTextAppModel(collaborativeText);
	}
}
