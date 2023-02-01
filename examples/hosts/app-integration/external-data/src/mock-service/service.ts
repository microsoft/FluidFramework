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

// eslint-disable-next-line import/no-nodejs-modules
import { Server } from "http";

import cors from "cors";
import express from "express";
import type { Express } from "express";
import { isWebUri } from "valid-url";
import { TaskData } from "../model-interface";
import { ExternalDataSource } from "./externalData";
import { MockWebhook } from "./webhook";

/**
 * The express app instance.
 * Used to mock the customer service.
 *
 * @remarks The task-manager client will interact with this service.
 */
let expressApp: Express | undefined;

/**
 * {@link initializeCustomerService} input properties.
 */
export interface ServiceProps {
	/**
	 * External data source backing this service.
	 */
	externalDataSource: ExternalDataSource;

	/**
	 * Port to listen on.
	 */
	port: number | string;
}

/**
 * Initializes the mock customer service.
 *
 * @remarks Consumers are required to manually dispose of the returned `Server` object.
 */
export async function initializeCustomerService(props: ServiceProps): Promise<Server> {
	const { externalDataSource, port } = props;

	if (expressApp !== undefined) {
		throw new Error("Customer service has already been initialized.");
	}

	/**
	 * Mock webhook for notifying subscibers to changes in external data.
	 *
	 * @remarks Initialized on demand.
	 */
	let webhook: MockWebhook | undefined;

	expressApp = express();
	expressApp.use(express.json());
	expressApp.use(cors());

	/**
	 * Hello World!
	 */
	expressApp.get("/", (request, result) => {
		result.send("Hello World!");
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
			result.status(400).json({ message: "Client failed to provide URL for subscription." });
		} else if (isWebUri(subscriberUrl) === undefined) {
			result.status(400).json({ message: "Provided subscription URL is invalid." });
		} else {
			console.log(
				`SERVICE: Registering for webhook notifications at URL: "${subscriberUrl}".`,
			);
			if (webhook === undefined) {
				webhook = new MockWebhook(externalDataSource);
			}
			webhook.registerSubscriber(subscriberUrl);
			result.send();
		}
	});

	/**
	 * Fetches the task list from the external data store.
	 */
	expressApp.get("/fetch-tasks", (request, result) => {
		console.log(`SERVICE: Fetching task list data...`);
		externalDataSource.fetchData().then(
			(data) => {
				console.log(`SERVICE: Returning current task list:\n"${data.body}".`);
				result.send(JSON.parse(data.body.toString()) as TaskData);
			},
			(error) => {
				console.error(
					`SERVICE: Encountered an error while reading mock external data file:\n${error}`,
				);
				result.status(500).json({ message: "Failed to fetch task data." });
			},
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
			result.status(400).json({ message: "Client failed to provide task list to set." });
		} else {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const taskList = request.body.taskList as TaskData;
			console.log(taskList);

			console.log(`SERVICE: Setting task list to "${taskList}"...`);
			externalDataSource.writeData(taskList).then(
				() => {
					console.log("SERVICE: Data set request completed!");
					result.send();
				},
				(error) => {
					console.error(
						`SERVICE: Encountered an error while writing to mock external data file:\n${error}`,
					);
					result.status(500).json({ message: "Failed to set task data." });
				},
			);
		}
	});

	/**
	 * Resets the external data to its original contents.
	 */
	expressApp.post("/debug-reset-task-list", (request, result) => {
		externalDataSource.debugResetData();
		console.log("SERVICE (DEBUG): External data reset!");
		result.send();
	});

	const server = expressApp.listen(port.toString());

	server.on("close", () => {
		webhook?.dispose();
		closeCustomerService();
	});

	return server;
}

function closeCustomerService(): void {
	if (expressApp === undefined) {
		console.warn("SERVICE: Service has already been closed.");
	} else {
		expressApp.removeAllListeners();
		expressApp = undefined;
	}
}
