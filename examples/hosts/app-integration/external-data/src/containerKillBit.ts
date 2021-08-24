/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
// import { IFluidHandle } from "@fluidframework/core-interfaces";
import { TaskManager } from "@fluid-experimental/task-manager";

const taskManagerKey = "task-manager";
const markedForDestructionKey = "marked";
const destroyTaskName = "destroy";
const deadKey = "dead";

export interface IContainerKillBit extends EventEmitter {
    dead: boolean;
    setDead(): void;
    markedForDestruction: boolean;
    markForDestruction(): void;
    volunteerForDestruction(): Promise<void>;
    on(event: "markedForDestruction" | "dead", listener: () => void): this;
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

    public setDead() {
        this.root.set(deadKey, true);
    }

    public get markedForDestruction() {
        return this.root.get(markedForDestructionKey) as boolean;
    }

    public markForDestruction() {
        // consider using a quorum-type data structure here?
        // Then, when everyone sees the quorum proposal get approved they can choose to either volunteer
        // or close themselves
        this.root.set(markedForDestructionKey, true);
    }

    public async volunteerForDestruction(): Promise<void> {
        await this.taskManager.lockTask(destroyTaskName);
        // do destroy task
        // Only trust that we succeeded as expected if we still have the lock after completing the destruction
        if (this.taskManager.haveTaskLock(destroyTaskName)) {
            this.root.set(deadKey, true);
        } else {
            throw new Error("Lost task during destruction");
        }
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
