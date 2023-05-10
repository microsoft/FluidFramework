/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains a distributed data structure for queueing and processing tasks that must be completed by a single client.
 *
 * @packageDocumentation
 */

export { ITaskManager, ITaskManagerEvents } from "./interfaces";
export { TaskManager } from "./taskManager";
