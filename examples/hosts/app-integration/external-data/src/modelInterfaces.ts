/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
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

export interface ITask extends EventEmitter {
    readonly id: string;
    readonly name: SharedString;
    priority: number;
}

/**
 * ITaskList describes the public API surface for our task list object.
 */
export interface ITaskList extends EventEmitter {
    readonly addTask: (id: string, name: string, priority: number) => void;

    readonly getTasks: () => ITask[];
    readonly getTask: (id: string) => ITask | undefined;

    readonly saveChanges: () => Promise<void>;

    /**
     * The taskAdded/taskRemoved event will fire whenever an task is added/removed, either locally or remotely.
     */
    on(event: "taskAdded" | "taskDeleted", listener: (task: ITask) => void): this;
}
