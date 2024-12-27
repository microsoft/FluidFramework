/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import type { IAppModel, IBaseDocument } from "../model-interface/index.js";

import { AppModel } from "./appModel.js";
import { BaseDocumentInstantiationFactory } from "./taskList.js";

const taskListCollectionId = "base-document";

/*
 * This is a server origin signal that lets the client know that the external source of truth
 * for the data has changed. On receiving this, the client should take some action, such as
 * fetching the new data. This is an enum as there may be more signals that need to be created.
 */
const SignalType = {
	ExternalDataChanged: "ExternalDataChanged_V1.0.0",
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
		const taskListCollection = await getDataStoreEntryPoint<IBaseDocument>(
			runtime,
			taskListCollectionId,
		);
		// Register listener only once the model is fully loaded and ready
		runtime.on("signal", (message) => {
			if (message?.type === SignalType.ExternalDataChanged) {
				const externalTaskListId = (
					message?.content as { externalTaskListId?: unknown } | undefined
				)?.externalTaskListId as string;
				if (externalTaskListId === undefined) {
					throw new Error("Signal with undefined externalTaskListId");
				}
				const taskList = taskListCollection.getTaskList(externalTaskListId);
				if (taskList === undefined) {
					throw new Error(
						`TaskList with id '${externalTaskListId}' does not exist in collection`,
					);
				}
				taskList.importExternalData().catch(console.error);
			}
		});
		return new AppModel(taskListCollection, container, runtime);
	}
}
