/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedCell, SharedCell } from "@fluidframework/cell";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";
import { SharedMap } from "@fluidframework/map";

import { externalDataSource, parseStringData } from "../externalData";
import type { ITask, ITaskEvents, ITaskList } from "../modelInterfaces";

class Task extends TypedEventEmitter<ITaskEvents> implements ITask {
    public get id(): string {
        return this._id;
    }
    // Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
    public get name(): SharedString {
        return this._name;
    }
    public get priority(): number {
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
        private readonly _priority: ISharedCell<number>
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
 * Persisted form of task data stored in root {@link @fluidframework/map#SharedDirectory}.
 */
interface PersistedTask {
    id: string;
    name: IFluidHandle<SharedString>;
    priority: IFluidHandle<ISharedCell<number>>;
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
    /*
     * savedData stores data retrieved from the external source.
     */
    private _savedData: SharedMap | undefined;
    /*
     * draftData is used for storage of the draft Fluid data. It's used with savedData
     * to resolve & synchronize the data.
     * TODO: Update^ when the sync mechanism is appropriately defined.
     */
    private _draftData: SharedMap | undefined;

    private get savedData(): SharedMap {
        if (this._savedData === undefined) {
            throw new Error("The savedData SharedMap has not yet been initialized.");
        }
        return this._savedData;
    }

    private get draftData(): SharedMap {
        if (this._draftData === undefined) {
            throw new Error("The draftData SharedMap has not yet been initialized.");
        }
        return this._draftData;
    }

    public readonly addTask = (id: string, name: string, priority: number): void => {

        if (this.tasks.get(id) !== undefined) {
            throw new Error("Task already exists");
        }
        const savedNameString = SharedString.create(this.runtime);
        const draftNameString = SharedString.create(this.runtime);

        // TODO: addTask will be called for tasks added in Fluid. Should only write to the draftMap directly here
        // savedMap will get updated when the data syncs back
        savedNameString.insertText(0, name);
        draftNameString.insertText(0, name);

        const savedPriorityCell = SharedCell.create(this.runtime) as ISharedCell<number>;
        const draftPriorityCell = SharedCell.create(this.runtime) as ISharedCell<number>;

        savedPriorityCell.set(priority);
        draftPriorityCell.set(priority);

        // To add a task, we update the root SharedDirectory.  This way the change is propagated to all collaborators
        // and persisted.  In turn, this will trigger the "valueChanged" event and handleTaskAdded which will update
        // the this.tasks collection.
        const savedDataPT: PersistedTask = {
            id,
            name: savedNameString.handle as IFluidHandle<SharedString>,
            priority: savedPriorityCell.handle as IFluidHandle<ISharedCell<number>>,
        };
        this.savedData.set(id, savedDataPT);

        const draftDataPT: PersistedTask = {
            id,
            name: draftNameString.handle as IFluidHandle<SharedString>,
            priority: draftPriorityCell.handle as IFluidHandle<ISharedCell<number>>,
        };
        this.draftData.set(id, draftDataPT);
    };

    public readonly deleteTask = (id: string): void => {
        this.root.delete(id);
    };

    public readonly getTasks = (): Task[] => {
        return [...this.tasks.values()];
    };

    public readonly getTask = (id: string): Task | undefined => {
        return this.tasks.get(id);
    };

    private readonly handleTaskAdded = async (id: string): Promise<void> => {
        const taskData = this.root.get(id) as PersistedTask;
        if (taskData === undefined) {
            throw new Error("Newly added task is missing from map.");
        }

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

    private readonly handleTaskDeleted = (id: string): void => {
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
    public async importExternalData(): Promise<void> {
        console.log('Kicking off fetching external data from TaskList');
        const externalData = await externalDataSource.fetchData();
        const parsedTaskData = parseStringData(externalData);
        // TODO: Delete any items that are in the root but missing from the external data
        const updateTaskPs = parsedTaskData.map(async ({ id, name, priority }) => {
            const currentTask = this.draftData.get<PersistedTask>(id);
            // Write external data into savedData map.
            this.savedData.set(id, currentTask);

            if (currentTask === undefined) {
                // A new task was added from external source, add it to the Fluid data.
                this.addTask(id, name, priority);
                return;
            }
            const [currName, currPriority] = await Promise.all([
                currentTask.name.get(),
                currentTask.priority.get(),
            ]);
            if (currName.getText() !== name) {
                // TODO: Currently replacing existing Fluid data.  But eventually this is where
                // we'd want conflict resolution UX.
                currName.replaceText(0, currName.getLength(), name);
            }
            if (currPriority.get() !== priority) {
                // TODO: Currently replacing existing Fluid data. But eventually this is where
                // we'd want conflict resolution UX.
                currPriority.set(priority);
            }
            // Saved updated Fluid data with
            this.draftData.set(id, currentTask);
        });
        await Promise.all(updateTaskPs);
    }

    /**
     * Save the current data in the container back to the external data source.
     * @remarks This method is public, and would map to clicking a "Save" button in some UX.  For more-automatic
     * sync'ing this method probably wouldn't exist.
     * @returns A promise that resolves when the write completes
     */
    public readonly saveChanges = async (): Promise<void> => {
        // TODO: Consider this.getTasks() will include local (un-ack'd) changes to the Fluid data as well.  In
        // the "save" button case this might be fine (the user saves what they see), but in more-automatic
        // sync'ing perhaps this should only include ack'd changes (by spinning up a second local client same
        // as what we do for summarization).
        const tasks = this.getTasks();
        const taskStrings = tasks.map((task) => {
            return `${task.id}:${task.name.getText()}:${task.priority.toString()}`;
        });
        const stringDataToWrite = `${taskStrings.join("\n")}`;

        // TODO: Do something reasonable to handle failure, retry, etc.
        return externalDataSource.writeData(stringDataToWrite);
    };

    protected async initializingFirstTime(): Promise<void> {
        this._draftData = SharedMap.create(this.runtime);
        this._savedData = SharedMap.create(this.runtime);
        this.root.set("draftData", this._draftData.handle);
        this.root.set("savedData", this._savedData.handle);
        // TODO: Probably don't need to await this once the sync'ing flow is solid, we can just trust it to sync
        // at some point in the future.
        await this.importExternalData();
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for changes to the task list.
     */
    protected async hasInitialized(): Promise<void> {
        const saved = this.root.get<IFluidHandle<SharedMap>>("savedData");
        if (saved === undefined) {
            throw new Error("savedData was not initialized");
        }
        this._savedData = await saved.get();

        const draft = this.root.get<IFluidHandle<SharedMap>>("draftData");
        if (draft === undefined) {
            throw new Error("draftData was not initialized");
        }
        this._draftData = await draft.get();

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

        for (const [id, task] of this.draftData) {
            const typedTaskData = task as PersistedTask;
            const [nameSharedString, prioritySharedCell] = await Promise.all([
                typedTaskData.name.get(),
                typedTaskData.priority.get(),
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
        SharedMap.getFactory(),
    ],
    {},
);
