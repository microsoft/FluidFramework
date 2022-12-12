/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This directoy contains a mock implementation of a customer service that manages a webhook subscription.
 *
 * When prompted (TODO), it initializes the mock webhook simulating a connection with some external service (e.g. Jira).
 * The corresponding REST API will then be "activated" and will begin submitting updates
 *
 * When prompted via a debug request (TODO), it simulates a change to the external data, which
 */

import Path from "path";

import Chokidar from "chokidar";
import express from "express";
import type { Express } from "express";
import Fs from "fs-extra";

export const mockCustomerServicePort =
    process.env.MOCK_CUSTOMER_SERVICE_PORT ?? 5237;

const pathToMockData = Path.resolve(
    // eslint-disable-next-line unicorn/prefer-module
    __dirname,
    "..",
    "mock-external-data",
    "task-list.txt"
);

/**
 * The express app instance.
 * Used to mock the customer service.
 *
 * The task-manager client will interact with this service
 */
let customerService: Express | undefined;

let fileWatcher: Chokidar.FSWatcher | undefined;

/**
 * Initializes the mock customer service.
 */
export function initializeCustomerService(): void {
    if(customerService !== undefined) {
        throw new Error("Customer service has already been initialized.");
    }

    customerService = express();

    // Bind simple console logger middleware
    customerService.use((request, result, next): void => {
        console.log(
            `${request.protocol}://${request.get("host")}${
                request.originalUrl
            }: ${new Date().toLocaleString()}`
        );
        next();
    });

    /**
     * Hello World!
     */
    customerService.get("/", (request, result) => {
        result.send("Hello World!");
    });

    /**
     * Initializes REST-style content updates for data changes to the external data.
     */
    customerService.get("/initialize-webhook", (request, result) => {
        initializeWebhook();
        result.send();
    });

    /**
     * Fetches the task list from the external data store.
     *
     * TODO: document response data format
     */
    customerService.get("/fetch-tasks", (request, result) => {
        fetchData().then(
            (data) => {
                console.log("Data fetch request completed!");
                result.send(data);
            },
            (error) => {
                console.error(`Encountered an error while reading mock external data file:`);
                console.group();
                console.error(error);
                console.groupEnd();

                result.status(500).json({ message: "Failed to fetch task data." });
            }
        );
    });

    /**
     * Updates external data store with new tasks list (complete override).
     *
     * TODO: document expected request format
     */
    customerService.put("/set-tasks", (request, result) => {
        const data = request.get("taskList");
        if (data === undefined) {
            result.status(400).json({message: "Client failed to provide task list to set."})
        } else {
            setData(data).then(
                () => {
                    console.log("Data set request completed!");
                    result.send();
                },
                (error) => {
                    console.error(`Encountered an error while writing to mock external data file:`);
                    console.group();
                    console.error(error);
                    console.groupEnd();

                    result.status(500).json({ message: "Failed to set task data." });
                }
            );
        }
    });

    customerService.listen(mockCustomerServicePort);
}

/**
 * Mocks initializing the external service webhook.
 * Once this has been called, updates will be sent any time a data change is detected in our mock external data file.
 */
function initializeWebhook(): void {
    if (fileWatcher === undefined) {
        console.log("Initializing mock webhook...");
        fileWatcher = Chokidar.watch(pathToMockData);
        fileWatcher.on("change", notifySubscribers);
    } else {
        console.warn("Mock webhook already initialized.")
    }

}

/**
 * Mocks submitting notifications of changes to webhook subscribers.
 *
 * For now, we simply send a notification that data has changed.
 * Consumers are expected to query for the actual data updates.
 * This could be updated in the future to send the new data / just the delta as a part of the webhook payload.
 */
function notifySubscribers(): void {
    console.log("External data has been updated. Notifying subscribers...");
    // TODO: notify subscribers of data change.
}



/**
 * Mocks fetching the task list from the external data store by reading the contents from the local txt file.
 */
async function fetchData(): Promise<string> {
    const taskListContents = await Fs.readFile(pathToMockData, "utf-8");
    return taskListContents.trim();
}

/**
 * Mocks updating (i.e. completely overriding) the task list in external data store by writing the provided contents
 * to the local txt file.
 */
async function setData(data: string): Promise<void> {
    await Fs.writeFile(pathToMockData, data.trim(), "utf-8");
}
