/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { SharedString } from "@fluidframework/sequence";

import { externalDataSource, parseStringData } from "../externalData";
import type { ITask, ITaskEvents, ITaskList } from "../modelInterfaces";

class Task extends TypedEventEmitter<ITaskEvents> implements ITask {
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
        this._name.on("sequenceDelta", () => {
            this.emit("nameChanged");
        });
        this._priority.on("valueChanged", () => {
            this.emit("priorityChanged");
        });
    }
}

/**
 * The TaskList is our data object that implements the ITaskList interface.
 */
export class TaskList extends DataObject implements ITaskList {
    /**
     * The tasks collection holds local facades on the data.  These facades encapsulate the data for a single task
     * so we don't have to hand out references to the whole SharedDirectory.  Additionally, we only create them
     * after performing the async operations to retrieve the constituent data (.get() the handles) which allows
     * the ITask interface to be synchronous, and therefore easier to use in a view.  This is an example of the
     * collection pattern -- see the contact-collection example for more details on this pattern.
     */
    private readonly tasks = new Map<string, Task>();

    public readonly addTask = (id: string, name: string, priority: number) => {
        if (this.tasks.get(id) !== undefined) {
            throw new Error("Task already exists");
        }
        const nameString = SharedString.create(this.runtime);
        nameString.insertText(0, name);
        const priorityCell: SharedCell<number> = SharedCell.create(this.runtime);
        priorityCell.set(priority);
        // To add a task, we update the root SharedDirectory.  This way the change is propagated to all collaborators
        // and persisted.  In turn, this will trigger the "valueChanged" event and handleTaskAdded which will update
        // the this.tasks collection.
        this.root.set(id, { id, name: nameString.handle, priority: priorityCell.handle });
        // TODO: Ultimately we want to retain the data we retrieved from the external source separate from the draft
        // Fluid data.  Maybe we do this by just adding it to the objects we're already storing in the root?
        // this.root.set(
        //     id,
        //     {
        //         id,
        //         draftName: nameString.handle,
        //         savedName: name,
        //         draftPriority: priorityCell.handle,
        //         savedPriority: priority,
        //     },
        // );
        // Or maybe we create a separate map for it.  I probably prefer this direction.
        // this.savedData.set(
        //     id,
        //     {
        //         id,
        //         name,
        //         priority,
        //     },
        // );
        // this.draftData.set(
        //     id,
        //     {
        //         id,
        //         name: nameString.handle,
        //         priority: priorityCell.handle,
        //     },
        // );
    };

    public readonly deleteTask = (id: string) => {
        this.root.delete(id);
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
        // Here we might want to consider raising an event on the Task object so that anyone holding it can know
        // that it has been removed from its collection.  Not needed for this example though.
        this.emit("taskDeleted", deletedTask);
    };

    // TODO: Is it useful to block further changes during the sync'ing process?  Consider implementing a state to
    // put the data object in while import is occurring (e.g. to disable input, etc.).
    // TODO: Consider performing the update in 2 phases (fetch, merge) to enable some nice conflict UI
    // TODO: Guard against reentrancy
    // TODO: Use leader election to reduce noise from competing clients
    public async importExternalData() {
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
                // TODO: Name has changed from external source, update the Fluid data
                // For a first approach it's probably fine to stomp the Fluid data.  But eventually this is where
                // we'd want conflict resolution UX.
            }
            if (currentTask.priority !== priority) {
                // TODO: Priority has changed from external source, update the Fluid data
                // For a first approach it's probably fine to stomp the Fluid data.  But eventually this is where
                // we'd want conflict resolution UX.
            }
        });
        await Promise.all(updateTaskPs);
    }

    /**
     * Save the current data in the container back to the external data source.
     * @remarks This method is public, and would map to clicking a "Save" button in some UX.  For more-automatic
     * sync'ing this method probably wouldn't exist.
     * @returns A promise that resolves when the write completes
     */
    public readonly saveChanges = async () => {
        // TODO: Consider this.getTasks() will include local (un-ack'd) changes to the Fluid data as well.  In
        // the "save" button case this might be fine (the user saves what they see), but in more-automatic
        // sync'ing perhaps this should only include ack'd changes (by spinning up a second local client same
        // as what we do for summarization).
        const tasks = this.getTasks();
        const taskStrings = tasks.map((task) => {
            return `${ task.id }:${ task.name.getText() }:${ task.priority.toString() }`;
        });
        const stringDataToWrite = `${taskStrings.join("\n")}`;
        // TODO: Do something reasonable to handle failure, retry, etc.
        return externalDataSource.writeData(stringDataToWrite);
    };

    protected async initializingFirstTime(): Promise<void> {
        // TODO: Probably don't need to await this once the sync'ing flow is solid, we can just trust it to sync
        // at some point in the future.
        await this.importExternalData();
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
                // Since all data modifications happen within the SharedString or SharedCell (task IDs are immutable),
                // the root directory should never see anything except adds and deletes.
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
