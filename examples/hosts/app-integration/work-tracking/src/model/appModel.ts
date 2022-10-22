/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer } from "@fluidframework/container-definitions";

import { parseStringData } from "../dataTransform";
import type {
    IAppModel,
    IAppModelEvents,
    ITaskList,
} from "../modelInterfaces";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type TaskListAppModelExportFormat = string;

/**
 * The AppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class AppModel extends TypedEventEmitter<IAppModelEvents>
    implements IAppModel {
    // To be used by the consumer of the model to pair with an appropriate view.
    public readonly version = "one";

    public constructor(
        public readonly taskList: ITaskList,
        private readonly container: IContainer,
    ) {
        super();
    }

    public readonly supportsDataFormat = (initialData: unknown): initialData is TaskListAppModelExportFormat => {
        return typeof initialData === "string";
    };

    // Ideally, prevent this from being called after the container has been modified at all -- i.e. only support
    // importing data into a completely untouched AppModel.
    public readonly importData = async (initialData: unknown): Promise<void> => {
        if (this.container.attachState !== AttachState.Detached) {
            throw new Error("Cannot set initial data after attach");
        }
        if (!this.supportsDataFormat(initialData)) {
            throw new Error("Data format not supported");
        }

        // Applies string data
        const parsedTaskData = parseStringData(initialData);
        for (const { id, name, priority } of parsedTaskData) {
            this.taskList.addTask(id, name, priority);
        }
    };

    public readonly exportData = async (): Promise<TaskListAppModelExportFormat> => {
        // Exports in version:one format (using ':' delimiter between name/priority)
        const tasks = this.taskList.getTasks();
        const taskStrings = tasks.map((task) => {
            return `${ task.name.getText() }:${ task.priority.toString() }`;
        });
        return `version:one\n${taskStrings.join("\n")}`;
    };

    public close() {
        this.container.close();
    }
}
