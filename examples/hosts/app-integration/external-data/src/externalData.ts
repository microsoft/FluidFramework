/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

/**
 * Parse string data into an array of simple objects that are easily imported into an
 * task list.
 * @param stringData - formatted string data
 * @returns An array of objects, each representing a single task
 */
export function parseStringData(stringData: string) {
    const taskStrings = stringData.split("\n");
    return taskStrings.map((taskString) => {
        const [taskIdString, taskNameString, taskPriorityString] = taskString.split(":");
        return { id: taskIdString, name: taskNameString, priority: parseInt(taskPriorityString, 10) };
    });
}

const startingExternalData =
`12:Alpha:1
34:Beta:2
56:Gamma:3
78:Delta:4`;

const localStorageKey = "fake-external-data";

export interface IExternalDataSourceEvents extends IEvent {
    (event: "dataWritten", listener: () => void);
}

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 * It's an event emitter just so we can render a reasonable debug view on it for demo purposes - in more-realistic
 * cases we would expect to learn about data updates through webhooks or similar.
 * TODO: Implement a debug control to simulate data changing remotely, webhook, etc.
 */
export class ExternalDataSource extends TypedEventEmitter<IExternalDataSourceEvents> {
    public constructor() {
        super();
        if (window.localStorage.getItem(localStorageKey) === null) {
            this.debugResetData();
        }
    }

    public async fetchData(): Promise<string> {
        const currentExternalData = window.localStorage.getItem(localStorageKey);
        if (currentExternalData === null) {
            throw new Error("External data should not be null, something went wrong");
        }
        return currentExternalData;
    }

    public async writeData(data: string): Promise<void> {
        // Write to persisted storage
        window.localStorage.setItem(localStorageKey, data);
        // Emit for debug views to update
        this.emit("dataWritten");
    }

    /**
     * Debug API for demo purposes, not really something we'd expect to find on a real external data source.
     */
    public readonly debugResetData = (): void => {
        window.localStorage.setItem(localStorageKey, startingExternalData);
        // Emit for debug views to update
        this.emit("dataWritten");
    };
}

export const externalDataSource = new ExternalDataSource();
