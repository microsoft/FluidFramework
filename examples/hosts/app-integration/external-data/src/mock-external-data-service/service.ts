/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import cors from "cors";
import express from "express";
import { isWebUri } from "valid-url";

import { ExternalDataSource } from './externalData';
import { MockWebhook } from './webhook';
import { externalDataServicePort } from './constants';

/**
 * {@link initializeExternalDataService} input properties.
 */
export interface ServiceProps {
    /**
     * Port to listen on.
     *
     * @defaultValue {@link externalDataServicePort}
     */
    port?: number | string;

    /**
     * External data source backing this service.
     *
     * @defaultValue A new data source will be initialized.
     */
    externalDataSource?: ExternalDataSource;
}

/**
 * Initializes the mock external data service.
 *
 * @remarks Consumers are required to manually dispose of the returned `Server` object.
 */
export async function initializeExternalDataService(props?: ServiceProps): Promise<Server> {
    const port = props?.port ?? externalDataServicePort;
    const externalDataSource = props?.externalDataSource ?? new ExternalDataSource();

    /**
     * Mock webhook for notifying subscibers to changes in external data.
     *
     * @remarks Initialized on demand.
     */
    let webhook: MockWebhook | undefined;

    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(cors());

    expressApp.get("/", (_, result) => {
        result.send();
    });

    /**
     * Register's the sender's URL to receive notifications when the external task-list data changes.
     *
     * Expected input data format:
     *
     * ```json
     * {
     *  url: string // The target URL to receive change notification
     * }
     * ```
     *
     * Notifications sent to subscribers will not contain any task-list data.
     * Rather, the notification can be considered as a signal to fetch the most recent data from the service.
     */
    expressApp.post("/register-for-webhook", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const subscriberUrl = request.body.url as string;
        if (subscriberUrl === undefined) {
            result.status(400).json({message: "Client failed to provide URL for subscription."})
        } else if (isWebUri(subscriberUrl) === undefined) {
            result.status(400).json({message: "Provided subscription URL is invalid."})
        } else {
            console.log(`EXTERNAL DATA SERVICE: Registering for webhook notifications at URL: "${subscriberUrl}".`);
            if(webhook === undefined) {
                webhook = new MockWebhook(externalDataSource);
            }
            webhook.registerSubscriber(subscriberUrl);
            result.send();
        }
    });

    /**
     * Fetches the task list from the external data store.
     */
    expressApp.get("/fetch-tasks", (_, result) => {
        console.log(`EXTERNAL DATA SERVICE: Fetching task list data...`);
        externalDataSource.fetchData().then(
            (data) => {
                console.log(`EXTERNAL DATA SERVICE: Returning current task list:\n"${data}".`);
                result.send({taskList: data});
            },
            (error) => {
                console.error(`EXTERNAL DATA SERVICE: Encountered an error while reading mock external data file:\n${error}`);
                result.status(500).json({ message: "Failed to fetch task data." });
            }
        );
    });

    /**
     * Updates external data store with new tasks list (complete override).
     *
     * Expected input data format:
     *
     * ```json
     * {
     *  taskList: string // TODO: object instead
     * }
     * ```
     */
    expressApp.post("/set-tasks", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (request.body.taskList === undefined) {
            result.status(400).json({message: "Client failed to provide task list to set."});
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const taskList = request.body.taskList as string;
            console.log(`EXTERNAL DATA SERVICE: Setting task list to "${taskList}"...`);
            externalDataSource.writeData(taskList).then(
                () => {
                    console.log("EXTERNAL DATA SERVICE: Data set request completed!");
                    result.send();
                },
                (error) => {
                    console.error(`EXTERNAL DATA SERVICE: Encountered an error while writing to mock external data file:\n${error}`);
                    result.status(500).json({ message: "Failed to set task data." });
                }
            );
        }
    });

    /**
     * Resets the external data to its original contents.
     */
    expressApp.post("/debug-reset-task-list", (_, result) => {
        externalDataSource.debugResetData();
        console.log("EXTERNAL DATA SERVICE (DEBUG): External data reset!");
        result.send();
    });

    const server = expressApp.listen(port.toString());

    server.on("close", () => {
        webhook?.dispose();
        console.log("EXTERNAL DATA SERVICE: Service was closed.");
    });

    console.log(`EXTERNAL DATA SERVICE: Now running on port ${port}.`);
    return server;
}
