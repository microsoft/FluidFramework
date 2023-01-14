/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import cors from "cors";
import express from "express";
import { isWebUri } from "valid-url";

import { MockWebhook } from '../utilities';
import { ExternalDataSource } from './externalData';

/**
 * {@link initializeExternalDataService} input properties.
 */
export interface ServiceProps {
    /**
     * Port to listen on.
     */
    port: number | string;

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
export async function initializeExternalDataService(props: ServiceProps): Promise<Server> {
    const { port } = props;
    const externalDataSource = props.externalDataSource ?? new ExternalDataSource();

    /**
     * Helper function to prepend service-specific metadata to messages logged by this service.
     */
    function formatLogMessage(message: string): string {
        return `EXTERNAL DATA SERVICE (${port}): ${message}`;
    }

    /**
     * Mock webhook for notifying subscibers to changes in external data.
     */
    const webhook = new MockWebhook<string>();

    function notifyWebhookSubscribers(newData: string): void {
        webhook.notifySubscribers(newData);
    }

    externalDataSource.on("debugDataWritten", notifyWebhookSubscribers)

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
     * Notifications sent to subscribers will contain the updated task-list data in the form of:
     *
     * ```json
     * {
     *  data: string
     * }
     * ```
     */
    expressApp.post("/register-for-webhook", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const subscriberUrl = request.body.url as string;
        if (subscriberUrl === undefined) {
            const errorMessage = 'Caller failed to provide URL for subscription. Must provide "subcriberUrl" parameter.';
            console.log(formatLogMessage(errorMessage));
            result.status(400).json({ message: errorMessage });
        } else if (isWebUri(subscriberUrl) === undefined) {
            const errorMessage = "Provided subscription URL is invalid.";
            console.log(formatLogMessage(errorMessage));
            result.status(400).json({message: errorMessage});
        } else {
            webhook.registerSubscriber(subscriberUrl);
            console.log(formatLogMessage(`Registered for webhook notifications at URL: "${subscriberUrl}".`));
            result.send();
        }
    });

    /**
     * Fetches the task list from the external data store.
     *
     * Returned data format:
     *
     * ```json
     * {
     *  taskList: string // TODO: object instead
     * }
     * ```
     */
    expressApp.get("/fetch-tasks", (_, result) => {
        externalDataSource.fetchData().then(
            (data) => {
                console.log(formatLogMessage(`Returning current task list:\n"${data}".`));
                result.send({ taskList: data });
            },
            (error) => {
                console.error(formatLogMessage(`Encountered an error while reading from mock external data source.`), error);
                result.status(500).json({ message: "Failed to fetch task data due to an error." });
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
        const taskList = request.body.taskList as string;
        if (taskList === undefined) {
            const errorMessage = 'Caller failed to provide task list to set. Must provide "taskList" parameter.';
            console.error(formatLogMessage(errorMessage));
            result.status(400).json({ message: errorMessage });
        } else {
            externalDataSource.writeData(taskList).then(
                () => {
                    console.log(formatLogMessage("Data set request completed!"));
                    result.send();
                },
                (error) => {
                    console.error(
                        formatLogMessage(`Encountered an error while writing to mock external data source.`),
                        error
                    );
                    result.status(500).json({ message: "Failed to set task data due to an error." });
                }
            );
        }
    });

    /**
     * Resets the external data to its original contents.
     */
    expressApp.post("/debug-reset-task-list", (_, result) => {
        externalDataSource.debugResetData();
        console.log(formatLogMessage("(DEBUG) External data reset!"));
        result.send();
    });

    const server = expressApp.listen(port.toString());

    server.on("close", () => {
        externalDataSource.off("debugDataWritten", notifyWebhookSubscribers);
        webhook?.dispose();
        console.log(formatLogMessage("Service was closed."));
    });

    console.log(formatLogMessage(`Now running on port ${port}.`));
    return server;
}
