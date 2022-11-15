/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IAppModelEvents extends IEvent { }

/**
 * For this simple demo, our app model only needs a single member taskList.
 */
export interface IAppModel extends IEventProvider<IAppModelEvents> {
    /**
     * A task tracker list.
     */
    readonly taskList: ITaskList;
}

export interface ITaskEvents extends IEvent {
    (event: "nameChanged" | "priorityChanged", listener: () => void);
}

export interface ITask extends IEventProvider<ITaskEvents> {
    readonly id: string;
    readonly name: SharedString;
    priority: number;
}

export interface ITaskListEvents extends IEvent {
    /**
     * The taskAdded/taskRemoved event will fire whenever an task is added/removed, either locally or remotely.
     */
    (event: "taskAdded" | "taskDeleted", listener: (task: ITask) => void);
}

/**
 * ITaskList describes the public API surface for our task list object.
 */
export interface ITaskList extends IEventProvider<ITaskListEvents> {
    readonly addTask: (id: string, name: string, priority: number) => void;

    readonly getTasks: () => ITask[];
    readonly getTask: (id: string) => ITask | undefined;

    readonly saveChanges: () => Promise<void>;
}
