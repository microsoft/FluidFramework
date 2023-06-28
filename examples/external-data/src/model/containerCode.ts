/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import type { IAppModel, IBaseDocument } from "../model-interface";
import { AppModel } from "./appModel";
import { BaseDocumentInstantiationFactory } from "./taskList";

const taskListCollectionId = "base-document";

/*
 * This is a server origin signal that lets the client know that the external source of truth
 * for the data has changed. On receiving this, the client should take some action, such as
 * fetching the new data. This is an enum as there may be more signals that need to be created.
 */
const SignalType = {
	ExternalDataChanged: "ExternalDataChange",
};

/**
 * {@inheritDoc ModelContainerRuntimeFactory}
 */
export class BaseDocumentContainerRuntimeFactory extends ModelContainerRuntimeFactory<IAppModel> {
	public constructor() {
		super(
			new Map([BaseDocumentInstantiationFactory.registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const taskListCollection = await runtime.createDataStore(
			BaseDocumentInstantiationFactory.type,
		);
		await taskListCollection.trySetAlias(taskListCollectionId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {
		runtime.on("signal", (message) => {
			// TODO: Check the message type? clientId?  And route to the TaskList for interpretation?
			// Interpretation of the message contents should probably live on the TaskList to encapsulate
			// knowledge of the task-specific data.
		});
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<AppModel> {
		const taskListCollection = await requestFluidObject<IBaseDocument>(
			await runtime.getRootDataStore(taskListCollectionId),
			"",
		);
		// Register listener only once the model is fully loaded and ready
		runtime.on("signal", (message) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (message?.content?.type === SignalType.ExternalDataChanged) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				const taskListId = message?.content?.taskListId as string;
				const taskList = taskListCollection.getTaskList(taskListId);
				if (taskList === undefined) {
					throw new Error(
						`TaskList with id '${taskListId}' does not exist in collection`,
					);
				}
				taskList.importExternalData().catch(console.error);
			}
		});
		return new AppModel(taskListCollection, container, runtime);
	}
}
