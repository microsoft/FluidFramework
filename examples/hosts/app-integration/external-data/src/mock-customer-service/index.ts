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

// TODOs:
// - Watch for file changes

import Path from "path";
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

let app: Express | undefined;

export function initializeCustomerService(): void {
    app = express();

    // Bind simple console logger middleware
    app.use((request, result, next): void => {
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
    app.get("/", (request, result) => {
        result.send("Hello World!");
    });

    /**
     * Initializes REST-style content updates for data changes to the external data.
     */
    app.get("/initialize-webhook", (request, result) => {
        initializeWebhook();
        // TODO: send result
    });

    /**
     * Fetches the task list from the external data store.
     *
     * TODO: document response data format
     */
    app.get("/fetch-tasks", (request, result) => {
        fetchData().then(
            (data) => {
                console.log("Data request completed!");

                result.send(data);
            },
            (error) => {
                console.error(
                    `Encountered an error while reading mock external data file:`
                );
                console.group();
                console.error(error);
                console.groupEnd();

                result
                    .status(500)
                    .json({ message: "Failed to fetch external data." });
            }
        );
    });

    /**
     * Updates external data store with new tasks list (complete override).
     *
     * TODO: document expected request format
     */
    app.put("/set-tasks", (request, result) => {

    });

    app.listen(mockCustomerServicePort);
}

/**
 * Mocks initializing the external service webhook.
 * Once this has been called, updates will be sent any time a data change is detected in our mock external data file.
 */
function initializeWebhook(): void {
    // TODO
}

/**
 * Mocks fetching the task list from the external data store by reading the contents from the local txt file.
 */
async function fetchData(): Promise<string> {
    const taskListContents = await Fs.readFile(pathToMockData, {});
    return taskListContents.trim();
}

/**
 * Mocks updating (i.e. completely overriding) the task list in external data store by writing the provided contents
 * to the local txt file.
 */
async function setData(data: string): Promise<void> {

}
