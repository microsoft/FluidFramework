/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IBaseDocument, IBaseDocumentInitialState } from "../model-interface";
import { TaskList, TaskListInstantiationFactory } from "./taskList";

export class BaseDocument extends DataObject implements IBaseDocument {
	private readonly taskListCollection = new Map<string, TaskList>();

	public readonly addTaskList = async (props: IBaseDocumentInitialState): Promise<void> => {
		if (this.taskListCollection.has(props.externalTaskListId)) {
			throw new Error(
				`task list ${props.externalTaskListId} already exists on this collection`,
			);
		}
		const taskList = await TaskListInstantiationFactory.createChildInstance(
			this.context,
			props,
		);
		this.taskListCollection.set(props.externalTaskListId, taskList);

		// Storing the handles here are necessary for non leader
		// clients to rehydrate local this.taskListCollection in hasInitialized().
		this.root.set(props.externalTaskListId, taskList.handle);
		this.emit("taskListCollectionChanged");
	};

	public readonly getTaskList = (id: string): TaskList | undefined => {
		return this.taskListCollection.get(id);
	};

	protected async hasInitialized(): Promise<void> {
		for (const [id, taskListHandle] of this.root) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			const taskListResolved = await taskListHandle.get();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			this.taskListCollection.set(id, taskListResolved);
		}
	}
}

export const BaseDocumentInstantiationFactory = new DataObjectFactory<BaseDocument>(
	"base-document",
	BaseDocument,
	[],
	{},
	new Map([TaskListInstantiationFactory.registryEntry]),
);
