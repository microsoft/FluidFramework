/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import cors from "cors";
import express from "express";
import fetch from 'node-fetch';
import { isWebUri } from "valid-url";

import { customerServicePort } from '../mock-customer-service-interface';
import { MockWebhook } from '../utilities';

/**
 * {@link initializeCustomerService} input properties.
 */
export interface ServiceProps {
    /**
     * Port to listen on.
     *
     * @defaultValue {@link customerServicePort}
     */
    port?: number | string;

    /**
     * URL of the external data service webhook.
     *
     * @remarks
     *
     * This service will register with the external data service to receive data change notifications.
     * Any restered listeners for this "webhook echo" via `/register-for-webhook` will be notified of changes
     * any time the external data service communicates them.
     */
    externalDataServiceWebhookRegistrationUrl: string;
}

/**
 * Initializes the mock customer service.
 *
 * @remarks Consumers are required to manually dispose of the returned `Server` object.
 */
export async function initializeCustomerService(props: ServiceProps): Promise<Server> {
    const { externalDataServiceWebhookRegistrationUrl } = props;
    const port = props?.port ?? customerServicePort;

    /**
     * Helper function to prepend service-specific metadata to messages logged by this service.
     */
    function formatLogMessage(message: string): string {
        return `CUSTOMER SERVICE (${port}): ${message}`;
    }

    /**
     * Mock webhook for echoing webhook notifications from the external data service.
     */
    const webhook = new MockWebhook<string>();

    // Register with external data service for webhook notifications.
    try {
        await fetch(
            externalDataServiceWebhookRegistrationUrl,
            {
                method: 'POST',
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    // External data service will call our webhook echoer to notify our subscribers of the data changes.
                    url: `http://localhost:${customerServicePort}/echo-external-data-webhook`
                }),
            }
        );
    } catch(error){
        console.error(
            formatLogMessage(`Registering for data update notifications webhook with the external data service failed due to an error.`),
            error
        );
        throw error;
    }

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
     *  data: string // TODO: object instead
     * }
     * ```
     */
    expressApp.post("/register-for-webhook", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const subscriberUrl = request.body.url as string;
        if (subscriberUrl === undefined) {
            const errorMessage = "Client failed to provide URL for subscription.";
            console.error(formatLogMessage(errorMessage));
            result.status(400).json({ message: errorMessage })
        } else if (isWebUri(subscriberUrl) === undefined) {
            const errorMessage = "Provided subscription URL is invalid.";
            console.error(formatLogMessage(errorMessage));
            result.status(400).json({ message: errorMessage })
        } else {
            webhook.registerSubscriber(subscriberUrl);
            console.log(formatLogMessage(`Registered for webhook notifications at URL: "${subscriberUrl}".`));
            result.send();
        }
    });

    /**
     * "Echoes" the external data services data update notifications to our own webhook subscribers.
     *
     * Expected input data format:
     *
     * ```json
     * data: string // TODO: object instead
     * ```
     *
     * This data will be forwarded to our own subscribers.
     */
    expressApp.post("/echo-external-data-webhook", (request, result) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const data = request.body.data as string;
        if (data === undefined) {
            const errorMessage = "No tasklist data provided by external data service webhook.";
            console.error(formatLogMessage(errorMessage));
            result.status(400).json({ message: errorMessage });
        } else {
            webhook.notifySubscribers(data);
            console.log(formatLogMessage(`External data update echoed to subscribers.`));
        }
    });

    const server = expressApp.listen(port.toString());

    server.on("close", () => {
        console.log(formatLogMessage("Service was closed."));
    });

    console.log(formatLogMessage(`Now running on port ${port}.`));
    return server;
}




