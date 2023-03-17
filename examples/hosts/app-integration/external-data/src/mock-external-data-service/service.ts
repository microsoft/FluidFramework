/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import cors from "cors";
import express from "express";
import { isWebUri } from "valid-url";

import { assertValidTaskData, ITaskData } from "../model-interface";
import { MockWebhook } from "../utilities";
import { ExternalDataSource } from "./externalDataSource";

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
 */
export async function initializeExternalDataService(props: ServiceProps): Promise<Server> {
	const { port } = props;
	const externalDataSource: ExternalDataSource =
		props.externalDataSource ?? new ExternalDataSource();

	/**
	 * Helper function to prepend service-specific metadata to messages logged by this service.
	 */
	function formatLogMessage(message: string): string {
		return `EXTERNAL DATA SERVICE (${port}): ${message}`;
	}

	/**
	 * Mock webhook for notifying subscribers to changes in external data.
	 */
	const webhook = new MockWebhook<ITaskData>();

	function notifyWebhookSubscribers(newData: ITaskData): void {
		console.log(formatLogMessage("External data has changed. Notifying webhook subscribers."));
		webhook.notifySubscribers(newData);
	}

	externalDataSource.on("debugDataWritten", notifyWebhookSubscribers);

	const expressApp = express();
	expressApp.use(express.json());
	expressApp.use(cors());

	/**
	 * Default route. Can be used to verify connectivity to the service.
	 */
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
	 *  taskList: {
	 *      [id: string]: {
	 *          name: string,
	 *          priority: number
	 *      }
	 *  }
	 * }
	 * ```
	 */
	expressApp.post("/register-for-webhook", (request, result) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const subscriberUrl = request.body?.url as string;
		if (subscriberUrl === undefined) {
			const errorMessage = 'No subscription URL provided. Expected under "url" property.';
			console.log(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else if (isWebUri(subscriberUrl) === undefined) {
			const errorMessage = "Provided subscription URL is invalid.";
			console.log(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			webhook.registerSubscriber(subscriberUrl);
			console.log(
				formatLogMessage(
					`Registered for webhook notifications at URL: "${subscriberUrl}".`,
				),
			);
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
	 *  taskList: {
	 *      [id: string]: {
	 *          name: string,
	 *          priority: number
	 *      }
	 *  }
	 * }
	 * ```
	 */
	expressApp.get("/fetch-tasks/:externalTaskListId", (request, result) => {
		const externalTaskListId = request.params?.externalTaskListId;
		if (externalTaskListId === undefined) {
			result
				.status(400)
				.json({ message: "Missing parameter externalTaskListId in request url" });
		}
		externalDataSource.fetchData(externalTaskListId).then(
			(response) => {
				const responseBody = JSON.parse(response.body.toString()) as Record<
					string | number | symbol,
					unknown
				>;

				let taskData: ITaskData;
				try {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					taskData = assertValidTaskData((responseBody as any).taskList);
				} catch (error) {
					const errorMessage = "Received task data received from external data source.";
					console.error(formatLogMessage(errorMessage), error);
					result.status(400).json({ message: errorMessage });
					return;
				}
				console.log(formatLogMessage("Returning current task list:"), taskData);
				result.send({ taskList: taskData });
			},
			(error) => {
				console.error(
					formatLogMessage(
						`Encountered an error while reading from mock external data source.`,
					),
					error,
				);
				result.status(500).json({ message: "Failed to fetch task data due to an error." });
			},
		);
	});

	/**
	 * Updates external data store with new tasks list (complete override).
	 *
	 * Expected input data format: {@link ITaskData}.
	 */
	expressApp.post("/set-tasks/:externalTaskListId", (request, result) => {
		const externalTaskListId = request.params?.externalTaskListId;
		if (externalTaskListId === undefined) {
			result
				.status(400)
				.json({ message: "Missing parameter externalTaskListId in request url" });
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
		const messageData = request.body?.taskList;
		if (messageData === undefined) {
			const errorMessage = 'No task list data provided. Expected under "taskList" property.';
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			let taskData: ITaskData;
			try {
				taskData = assertValidTaskData(messageData);
			} catch (error) {
				const errorMessage = "Input task list data was malformed.";
				console.error(errorMessage, error);
				result.status(400).json({ message: errorMessage });
				return;
			}
			externalDataSource.writeData(taskData, externalTaskListId).then(
				() => {
					console.log(formatLogMessage("Data set request completed!"));
					result.send();
				},
				(error) => {
					console.error(
						formatLogMessage(
							`Encountered an error while writing to mock external data source.`,
						),
						error,
					);
					result
						.status(500)
						.json({ message: "Failed to set task data due to an error." });
				},
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
		console.log(formatLogMessage("Service was closed."));
	});

	console.log(formatLogMessage(`Now running on port ${port}.`));
	return server;
}
