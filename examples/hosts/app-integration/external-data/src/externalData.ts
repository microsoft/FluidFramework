/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

/**
 * Parse string data into an array of simple objects that are easily imported into an
 * task list.
 * @param stringData - version:one formatted string data
 * @returns An array of objects, each representing a single task
 */
 export function parseStringData(stringData: string) {
    const taskStrings = stringData.split("\n");
    return taskStrings.map((taskString) => {
        const [taskIdString, taskNameString, taskPriorityString] = taskString.split(":");
        return { id: taskIdString, name: taskNameString, priority: parseInt(taskPriorityString, 10) };
    });
}

export interface IExternalDataSourceEvents extends IEvent {
    (event: "dataWritten", listener: (data: string) => void);
}

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 * Here we make it an event emitter just so we can render a reasonable debug view on it for demo purposes -- in those
 * more-realistic cases there's not an expectation that the data source pushes updates or anything.
 */
export class ExternalDataSource extends TypedEventEmitter<IExternalDataSourceEvents> {
    private externalTaskData: string;

    // TODO: Maybe put this in localStorage so multiple clients can reference the same?
    public constructor() {
        super();
        this.externalTaskData =
`12:Alpha:1
34:Beta:2
56:Gamma:3
78:Delta:4`;
    }

    public async fetchData(): Promise<string> {
        return this.externalTaskData;
    }

    public async writeData(data: string): Promise<void> {
        // Write to persisted storage
        this.externalTaskData = data;
        // Emit for debug views to update
        this.emit("dataWritten", data);
    }
}

export const externalDataSource = new ExternalDataSource();
