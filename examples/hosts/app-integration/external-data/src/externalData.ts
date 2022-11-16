/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

/**
 * Parse string data into an array of simple objects that are easily imported into a task list.  Each task is
 * represented in the string in the format [id]:[name]:[priority], separated by newlines.
 * @param stringData - formatted string data
 * @returns An array of objects, each representing a single task
 * TODO: See notes below about moving away from plain string to something more realistic.
 */
export function parseStringData(stringData: string) {
    const taskStrings = stringData.split("\n");
    return taskStrings.map((taskString) => {
        const [taskIdString, taskNameString, taskPriorityString] = taskString.split(":");
        return {
            id: taskIdString,
            name: taskNameString,
            priority: parseInt(taskPriorityString, 10),
        };
    });
}

// prettier-ignore
const startingExternalData =
`12:Alpha:1
34:Beta:2
56:Gamma:3
78:Delta:4`;

const localStorageKey = "fake-external-data";

export interface IExternalDataSourceEvents extends IEvent {
    /**
     * Emitted when the external data changes.
     * @remarks Debug API for demo purposes - the real scenario will need to learn about the data changing via the
     * webhook path.
     */
    (event: "debugDataWritten", listener: () => void);
}

/**
 * Class to let us fake having an external data source and abstract the particulars of its implementation.
 * In a more-real scenario, maybe this is communicating with some server via RESTful APIs.
 * It's an event emitter just so we can render a reasonable debug view on it for demo purposes - in more-realistic
 * cases we would expect to learn about data updates through webhooks or similar.
 * TODO: Implement a debug control to simulate data changing remotely, webhook, etc.
 * TODO: Consider adding a fake delay to the async calls to give us a better approximation of expected experience.
 * TODO: This will probably want to move to a standalone Express server or something eventually, esp. when working
 * on the server-side bot approach.  But using localStorage is probably good enough for the broadcast signal portion.
 */
export class ExternalDataSource extends TypedEventEmitter<IExternalDataSourceEvents> {
    public constructor() {
        super();
        if (window.localStorage.getItem(localStorageKey) === null) {
            this.debugResetData();
        }
        // TODO: Should probably register here for the "storage" event to detect other tabs manipulating the external
        // data.
    }

    /**
     * Fetch the external data.
     * @returns A promise that resolves with the raw string data stored in the external source.
     * @remarks This is async to simulate the more-realistic scenario of a network request.
     * TODO: This is not a particularly realistic response for typical external data.  Should this instead return
     * more structured data?  Maybe something that looks like a Response that we can .json()?
     */
    public async fetchData(): Promise<string> {
        const currentExternalData = window.localStorage.getItem(localStorageKey);
        if (currentExternalData === null) {
            throw new Error("External data should not be null, something went wrong");
        }
        return currentExternalData;
    }

    /**
     * Write the specified data to the external source.
     * @param data - The string data to write.
     * @returns A promise that resolves when the write completes.
     * TODO: Similar to fetchData, this could be made more realistic.
     */
    public async writeData(data: string): Promise<void> {
        // Write to persisted storage
        window.localStorage.setItem(localStorageKey, data);
        // Emit for debug views to update
        this.emit("debugDataWritten");
    }

    /**
     * Reset the external data to a good demo state.
     * @remarks Debug API for demo purposes, not really something we'd expect to find on a real external data source.
     */
    public readonly debugResetData = (): void => {
        window.localStorage.setItem(localStorageKey, startingExternalData);
        // Emit for debug views to update
        this.emit("debugDataWritten");
    };
}

export const externalDataSource = new ExternalDataSource();
