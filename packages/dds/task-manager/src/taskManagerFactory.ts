/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { ITaskManager } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";
import { TaskManagerClass } from "./taskManager.js";

/**
 * The factory that defines the task queue
 */
export class TaskManagerFactory implements IChannelFactory<ITaskManager> {
	public static readonly Type = "https://graph.microsoft.com/types/task-manager";

	public static readonly Attributes: IChannelAttributes = {
		type: TaskManagerFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): typeof TaskManagerFactory.Type {
		return TaskManagerFactory.Type;
	}

	public get attributes(): typeof TaskManagerFactory.Attributes {
		return TaskManagerFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ITaskManager> {
		const taskQueue = new TaskManagerClass(id, runtime, attributes);
		await taskQueue.load(services);
		return taskQueue;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ITaskManager {
		const taskQueue = new TaskManagerClass(id, document, this.attributes);
		taskQueue.initializeLocal();
		return taskQueue;
	}
}

/**
 * {@inheritDoc ITaskManager}
 * @legacy
 * @alpha
 */
export const TaskManager = createSharedObjectKind(TaskManagerFactory);

/**
 * {@inheritDoc ITaskManager}
 * @legacy
 * @alpha
 */
export type TaskManager = ITaskManager;
