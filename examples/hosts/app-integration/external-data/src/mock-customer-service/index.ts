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

import { MockWebhook } from '../mock-webhook';
import { ExternalDataSource } from '../externalData';

/**
 * The port used by the mock customer service.
 */
export const customerServicePort = process.env.MOCK_CUSTOMER_SERVICE_PORT ?? 5237;

/**
 * The express app instance.
 * Used to mock the customer service.
 *
 * @remarks The task-manager client will interact with this service.
 */
let expressApp: Express | undefined;

/**
 * Initializes the mock customer service.
 *
 * @remarks Consumers are required to manually dispose of the returned `Server` object.
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
     * Mock webhook for notifying subscibers to changes in external data.
     *
     * @remarks Initialized on demand.
     */
    let webhook: MockWebhook | undefined;

    expressApp = express();
    expressApp.use(express.json());

    /**
     * Hello World!
     */
    expressApp.get("/", (request, result) => {
        result.send("Hello World!");
    });

    /**
     * Initializes REST-style content updates for data changes to the external data.
     */
    expressApp.get("/register-for-webhook", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const subscriberUrl = request.body.url as string;
        if (subscriberUrl === undefined) {
            result.status(400).json({message: "Client failed to provide URL for subscription."})
        } else {
            if(webhook === undefined) {
                webhook = new MockWebhook(externalDataSource);
            }
            webhook.registerSubscriber(subscriberUrl);
            result.send();
        }
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
                result.send({taskList: data});
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
    expressApp.post("/set-tasks", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const taskList = request.body.taskList as string;
        if (taskList === undefined) {
            result.status(400).json({message: "Client failed to provide task list to set."});
        } else {
            externalDataSource.writeData(taskList).then(
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

    server.on("close", () => {
        webhook?.dispose();
        closeCustomerService();
    });

    return server;
}

function closeCustomerService(): void {
    if(expressApp === undefined) {
        console.warn("Service has already been closed.")
    } else {
        expressApp.removeAllListeners();
        expressApp = undefined;
    }
}


