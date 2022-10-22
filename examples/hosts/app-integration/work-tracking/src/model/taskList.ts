/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedString } from "@fluidframework/sequence";

import { externalDataSource } from "../externalData";
import type { ITask, ITaskList } from "../modelInterfaces";
import { parseStringData } from "../dataTransform";

class Task extends EventEmitter implements ITask {
    public get id() {
        return this._id;
    }
    // Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
    public get name() {
        return this._name;
    }
    public get priority() {
        const cellValue = this._priority.get();
        if (cellValue === undefined) {
            throw new Error("Expected a valid priority");
        }
        return cellValue;
    }
    public set priority(newValue: number) {
        this._priority.set(newValue);
    }
    public constructor(
        private readonly _id: string,
        private readonly _name: SharedString,
        private readonly _priority: SharedCell<number>,
    ) {
        super();
        this._priority.on("valueChanged", () => {
            this.emit("priorityChanged");
        });
    }
}

/**
 * The TaskList is our data object that implements the ITaskList interface.
 */
export class TaskList extends DataObject implements ITaskList {
    private readonly tasks = new Map<string, Task>();

    public readonly addTask = (id: string, name: string, priority: number) => {
        const nameString = SharedString.create(this.runtime);
        nameString.insertText(0, name);
        const priorityCell: SharedCell<number> = SharedCell.create(this.runtime);
        priorityCell.set(priority);
        this.root.set(id, { id, name: nameString.handle, priority: priorityCell.handle });
    };

    public readonly getTasks = () => {
        return [...this.tasks.values()];
    };

    public readonly getTask = (id: string) => {
        return this.tasks.get(id);
    };

    private readonly handleTaskAdded = async (id: string) => {
        const taskData = this.root.get(id);
        const [nameSharedString, prioritySharedCell] = await Promise.all([
            taskData.name.get(),
            taskData.priority.get(),
        ]);
        // It's possible the task was deleted while getting the name/priority, in which case quietly exit.
        if (this.root.get(id) === undefined) {
            return;
        }
        const newTask = new Task(id, nameSharedString, prioritySharedCell);
        this.tasks.set(id, newTask);
        this.emit("taskAdded", newTask);
    };

    private readonly handleTaskDeleted = (id: string) => {
        const deletedTask = this.tasks.get(id);
        this.tasks.delete(id);
        this.emit("taskDeleted", deletedTask);
    };

    public async fetchExternalDataAndUpdate() {
        const externalData = await externalDataSource.fetchData();
        const parsedTaskData = parseStringData(externalData);
        // TODO: Delete any items that are in the root but missing from the external data
        const updateTaskPs = parsedTaskData.map(async ({ id, name, priority }) => {
            const currentTask = this.tasks.get(id);
            if (currentTask === undefined) {
                // A new task was added from external source, add it to the Fluid data.
                this.addTask(id, name, priority);
                return;
            }
            if (currentTask.name.getText() !== name) {
                // Name has changed from external source, update the Fluid data
            }
            if (currentTask.priority !== priority) {
                // Priority has changed from external source, update the Fluid data
            }
        });
        await Promise.all(updateTaskPs);
    }

    public async pushDataToExternal() {
        const tasks = this.getTasks();
        const taskStrings = tasks.map((task) => {
            return `${ task.id }:${ task.name.getText() }:${ task.priority.toString() }`;
        });
        const stringDataToWrite = `${taskStrings.join("\n")}`;
        return externalDataSource.writeData(stringDataToWrite);
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for changes to the task list.
     */
    protected async hasInitialized() {
        this.root.on("valueChanged", (changed) => {
            if (changed.previousValue === undefined) {
                // Must be from adding a new task
                this.handleTaskAdded(changed.key).catch((error) => {
                    console.error(error);
                });
            } else if (this.root.get(changed.key) === undefined) {
                // Must be from a deletion
                this.handleTaskDeleted(changed.key);
            } else {
                // Since all data modifications happen within the SharedString or SharedCell, the root directory
                // should never see anything except adds and deletes.
                console.error("Unexpected modification to task list");
            }
        });

        for (const [id, taskData] of this.root) {
            const [nameSharedString, prioritySharedCell] = await Promise.all([
                taskData.name.get(),
                taskData.priority.get(),
            ]);
            this.tasks.set(id, new Task(id, nameSharedString, prioritySharedCell));
        }
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const TaskListInstantiationFactory = new DataObjectFactory<TaskList>(
    "task-list",
    TaskList,
    [
        SharedCell.getFactory(),
        SharedString.getFactory(),
    ],
    {},
);
