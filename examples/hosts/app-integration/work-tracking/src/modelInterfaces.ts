/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEventProvider } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";
import type { IMigratableModel, IMigratableModelEvents } from "./migrationInterfaces";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IAppModelEvents extends IMigratableModelEvents { }

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IAppModel extends IMigratableModel, IEventProvider<IAppModelEvents> {
    /**
     * An task tracker list.
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
    readonly addTask: (name: string, priority: number) => void;

    readonly getTasks: () => ITask[];
    readonly getTask: (id: string) => ITask | undefined;

    /**
     * The listChanged event will fire whenever an task is added/removed, either locally or remotely.
     */
    on(event: "taskAdded" | "taskDeleted", listener: (task: ITask) => void): this;
}
