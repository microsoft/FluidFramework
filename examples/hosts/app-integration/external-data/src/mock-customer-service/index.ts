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

import { Server } from 'http';

import express from "express";
import type { Express } from "express";

import { ExternalDataSource } from "../externalData";

/**
 * The port used by the mock customer service.
 */
export const customerServicePort =
    process.env.MOCK_CUSTOMER_SERVICE_PORT ?? 5237;

/**
 * The express app instance.
 * Used to mock the customer service.
 *
 * The task-manager client will interact with this service
 */
let expressApp: Express | undefined;

/**
 * Initializes the mock customer service.
 */
export async function initializeCustomerService(): Promise<Server> {
    if(expressApp !== undefined) {
        throw new Error("Customer service has already been initialized.");
    }

    /**
     * The backing external data store.
     */
    const externalDataSource = new ExternalDataSource();

    /**
     * Mocks initializing the external service webhook.
     * Once this has been called, updates will be sent any time a data change is detected in our mock external data file.
     */
    function initializeWebhook(): void {
        externalDataSource.on("debugDataWritten", notifySubscribers)
    }

    /**
     * Closes down the mock external service webhook.
     */
    async function closeWebhook(): Promise<void> {
        externalDataSource.off("debugDataWritten", notifySubscribers);
    }

    expressApp = express();

    // Bind simple console logger middleware
    expressApp.use((request, result, next): void => {
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
    expressApp.get("/", (request, result) => {
        result.send("Hello World!");
    });

    /**
     * Initializes REST-style content updates for data changes to the external data.
     */
    expressApp.get("/initialize-webhook", (request, result) => {
        initializeWebhook();
        result.send();
    });

    /**
     * Fetches the task list from the external data store.
     *
     * TODO: document response data format
     */
    expressApp.get("/fetch-tasks", (request, result) => {
        externalDataSource.fetchData().then(
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
    expressApp.put("/set-tasks", (request, result) => {
        const data = request.get("taskList");
        if (data === undefined) {
            result.status(400).json({message: "Client failed to provide task list to set."})
        } else {
            externalDataSource.writeData(data).then(
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

    const server = expressApp.listen(customerServicePort);

    // Bind file-watcher disposal to server close event to ensure everything is properly cleaned up between sessions.
    server.on("close", () => {
        closeWebhook().catch((error) => {
            console.error(`Encountered an error closing mock webhook:`);
            console.group();
            console.error(error);
            console.groupEnd();
        });
    });

    return server;
}


/**
 * Mocks submitting notifications of changes to webhook subscribers.
 *
 * For now, we simply send a notification that data has changed.
 * Consumers are expected to query for the actual data updates.
 * This could be updated in the future to send the new data / just the delta as a part of the webhook payload.
 */
function notifySubscribers(data: string): void {
    console.log("External data has been updated. Notifying subscribers...");
    // TODO: notify subscribers of data change.
}
