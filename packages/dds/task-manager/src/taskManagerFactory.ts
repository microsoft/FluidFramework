/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { TaskManager } from "./taskManager.js";
import { ITaskManager } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * The factory that defines the task queue
 */
export class TaskManagerFactory implements IChannelFactory {
	public static readonly Type = "https://graph.microsoft.com/types/task-manager";

	public static readonly Attributes: IChannelAttributes = {
		type: TaskManagerFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return TaskManagerFactory.Type;
	}

	public get attributes() {
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
		const taskQueue = new TaskManager(id, runtime, attributes);
		await taskQueue.load(services);
		return taskQueue;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ITaskManager {
		const taskQueue = new TaskManager(id, document, this.attributes);
		taskQueue.initializeLocal();
		return taskQueue;
	}
}
