/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains a distributed data structure, {@link ITaskManager}, to track the queues of clients that want to
 * exclusively run tasks.
 *
 * @packageDocumentation
 */

export { ITaskManager, ITaskManagerEvents, TaskEventListener } from "./interfaces.js";
export { TaskManager } from "./taskManager.js";
