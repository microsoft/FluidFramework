/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import cors from "cors";
import express from "express";
import { isWebUri } from "valid-url";

import { customerServicePort } from '../mock-customer-service-interface';

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
}

/**
 * Initializes the mock customer service.
 *
 * @remarks Consumers are required to manually dispose of the returned `Server` object.
 */
export async function initializeCustomerService(props?: ServiceProps): Promise<Server> {
    const port = props?.port ?? customerServicePort;

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
            console.log(`CUSTOMER SERVICE: Registering for webhook notifications at URL: "${subscriberUrl}".`);
            // TODO
            result.send();
        }
    });

    const server = expressApp.listen(port.toString());

    server.on("close", () => {
        console.log("CUSTOMER SERVICE: Service was closed.");
    });

    console.log(`CUSTOMER SERVICE: Now running on port ${port}.`);
    return server;
}




