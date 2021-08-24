/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
// import { IFluidHandle } from "@fluidframework/core-interfaces";
import { TaskManager } from "@fluid-experimental/task-manager";

const taskManagerKey = "task-manager";
const markedForDestructionKey = "marked";
const destroyTaskName = "destroy";
const deadKey = "dead";

export interface IContainerKillBitEvents extends IEvent {
    (event: "markedForDestruction" | "dead", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    dead: boolean;
    setDead(): Promise<void>;
    markedForDestruction: boolean;
    markForDestruction(): Promise<void>;
    volunteerForDestruction(): Promise<void>;
    haveDestructionTask(): boolean;
}

export class ContainerKillBit extends DataObject implements IContainerKillBit {
    private _taskManager: TaskManager | undefined;
    private get taskManager() {
        if (this._taskManager === undefined) {
            throw new Error("Couldn't retrieve the TaskManager");
        }
        return this._taskManager;
    }

    public get dead() {
        return this.root.get(deadKey) as boolean;
    }

    public async setDead() {
        // This should probably use a consensus-type data structure here, to make it easier to validate
        // that the setDead was ack'd and we can have confidence other clients will agree.
        this.root.set(deadKey, true);
    }

    public get markedForDestruction() {
        return this.root.get(markedForDestructionKey) as boolean;
    }

    public async markForDestruction() {
        // This should probably use a quorum-type data structure here.
        // Then, when everyone sees the quorum proposal get approved they can choose to either volunteer
        // or close themselves
        this.root.set(markedForDestructionKey, true);
    }

    public async volunteerForDestruction(): Promise<void> {
        return this.taskManager.lockTask(destroyTaskName);
    }

    public haveDestructionTask(): boolean {
        return this.taskManager.haveTaskLock(destroyTaskName);
    }

    protected async initializingFirstTime() {
        const taskManager = TaskManager.create(this.runtime);
        this.root.set(taskManagerKey, taskManager.handle);
        this.root.set(markedForDestructionKey, false);
        this.root.set(deadKey, false);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed) => {
            if (changed.key === markedForDestructionKey) {
                this.emit("markedForDestruction");
            } else if (changed.key === deadKey) {
                this.emit("dead");
            }
        });

        const taskManagerHandle = this.root.get(taskManagerKey);
        this._taskManager = await taskManagerHandle.get();
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const ContainerKillBitInstantiationFactory =
    new DataObjectFactory<ContainerKillBit, undefined, undefined, IEvent> (
        "container-kill-bit",
        ContainerKillBit,
        [
            TaskManager.getFactory(),
        ],
        {},
    );
