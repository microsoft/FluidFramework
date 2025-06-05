/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "node:http";

import cors from "cors";
import express from "express";
import { isWebUri } from "valid-url";

import { ITaskData, assertValidTaskData } from "../model-interface/index.js";

import { ExternalDataSource } from "./externalDataSource.js";
import { MockWebhook } from "./webhook.js";

/**
 * Represents the external data servers query url or uuid.
 * This is the URL or the id of the external resource that the customer service needs to subscribe for at the external service.
 */
type ExternalTaskListId = string;

/**
 * Internally used errors used for streamlining error handling
 */
class ApiError extends Error {
	code: number;
	constructor(message: string, code: number) {
		super(message);
		this.code = code;
	}
}

/**
 * Api Error thrown when something is wrong with the request data
 */
class InvalidRequestError extends ApiError {
	static ERROR_CODE = 400;
	constructor(message: string, code = InvalidRequestError.ERROR_CODE) {
		super(message, code);
	}
}

/**
 * Expected shape of the request that is handled by the
 * webhook register endpoint
 */
export interface RegisterWebhookRequest extends express.Request {
	body: {
		/**
		 * The target URL to subscribe to change notifications for
		 */
		url: string;
		/**
		 * The ID of the task list to subscribe to change notifications for
		 */
		externalTaskListId: string;
	};
}

/**
 * Expected shape of the request that is handled by the
 * webhook unregister endpoint
 */
export interface UnregisterWebhookRequest extends express.Request {
	body: {
		/**
		 * The target URL to unsubscribe from change notifications
		 */
		url: string;
		/**
		 * The ID of the task list to unsubscribe to change notifications for
		 */
		externalTaskListId: string;
	};
}

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

	/**
	 * Map of ExternalTaskListId string with a webbook that contains all the subscribers of that external task list id.
	 * In this implementation this stays in memory but for production it makes sense to keep this in a more redundant
	 * memory store like redis. In the implementation of using an external redundant memory source, this will be passed
	 * into the service.
	 */
	webhookCollection: Map<ExternalTaskListId, MockWebhook<ITaskData>>;
}

/**
 * Initializes the mock external data service.
 */
export async function initializeExternalDataService(props: ServiceProps): Promise<Server> {
	const { port } = props;
	const externalDataSource: ExternalDataSource =
		props.externalDataSource ?? new ExternalDataSource();
	const webhookCollection =
		props.webhookCollection ?? new Map<ExternalTaskListId, MockWebhook<ITaskData>>();

	/**
	 * Helper function to prepend service-specific metadata to messages logged by this service.
	 */
	function formatLogMessage(message: string): string {
		return `EXTERNAL DATA SERVICE (${port}): ${message}`;
	}

	/**
	 * Mock webhook for notifying subscribers to changes in external data.
	 */
	function notifyWebhookSubscribers(externalTaskListId: string, newData: ITaskData): void {
		console.log(formatLogMessage("External data has changed. Notifying webhook subscribers."));
		const webhook = webhookCollection.get(externalTaskListId);
		if (webhook === undefined) {
			return; // No subscribers for this task list
		}
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
	 * Expected request body format: {@link RegisterWebhookRequest}
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
	expressApp.post("/register-for-webhook", (request: RegisterWebhookRequest, result) => {
		try {
			const subscriberUrl = request.body.url;
			if (subscriberUrl === undefined || typeof subscriberUrl !== "string") {
				throw new InvalidRequestError(
					'Missing or Invalid subscription URL provided. Expected under "url" property.',
				);
			} else if (isWebUri(subscriberUrl) === undefined) {
				throw new InvalidRequestError("Provided subscription URL is invalid.");
			}

			const externalTaskListId = request.body.externalTaskListId;
			if (externalTaskListId === undefined || typeof externalTaskListId !== "string") {
				throw new InvalidRequestError(
					`Missing or malformed taskListId in request url: ${externalTaskListId}`,
				);
			}

			console.log(`externalTaskListId: ${externalTaskListId}`);
			console.log(`subscriberUrl: ${subscriberUrl}`);
			let webhook = webhookCollection.get(externalTaskListId);
			if (webhook === undefined) {
				webhook = new MockWebhook();
				webhookCollection.set(externalTaskListId, webhook);
			}
			webhook.registerSubscriber(subscriberUrl);
			console.log(
				formatLogMessage(`Registered for webhook notifications at URL: "${subscriberUrl}".`),
			);
		} catch (error) {
			if (error instanceof ApiError) {
				if (error.code >= 500) {
					console.error(formatLogMessage(error.message));
				} else {
					console.warn(formatLogMessage(error.message));
				}
				result.status(error.code).json({ message: error.message });
			} else {
				console.error(error);
				throw error;
			}
		}

		result.send();
	});

	/**
	 * Unregisters the specified URL from receiving notifications for the specified external task list id.
	 *
	 * Expected request body format: {@link UnregisterWebhookRequest}
	 */
	expressApp.post("/unregister-webhook", (request: UnregisterWebhookRequest, result) => {
		try {
			// 1. Validate request data
			const subscriberUrl = request.body.url;
			if (typeof subscriberUrl !== "string") {
				throw new InvalidRequestError("Missing or unexpected data in request body");
			} else if (isWebUri(subscriberUrl) === undefined) {
				throw new InvalidRequestError(`Provided subscriber URL is invalid ${subscriberUrl}`);
			}
			const externalTaskListId = request.body.externalTaskListId;
			if (externalTaskListId === undefined || typeof externalTaskListId !== "string") {
				throw new InvalidRequestError(
					`Missing or malformed taskListId in request url: ${externalTaskListId}`,
				);
			}

			// 2. Find cooresponding webook for the given externalTaskListId
			const webhook = webhookCollection.get(externalTaskListId);
			if (webhook === undefined) {
				throw new InvalidRequestError(
					"Provided externalTaskListId has no outstanding webhooks",
				);
			}

			// 3. Webhook exists, attempt to remove the subscriber from the webhook
			if (webhook.subscribers.includes(subscriberUrl)) {
				// 3a. Webhook exists and the provided subcriber is currently subscribed to it.
				webhook.removeSubscriber(subscriberUrl);
				const resultMessage = `Unregistered webhook notification for externalTaskListId ${externalTaskListId} at subscriberUrl: "${subscriberUrl}".`;
				console.info(formatLogMessage(resultMessage));
				result.status(200).json({ message: resultMessage });
			} else {
				// 3b. Webhook exists but the provided subscriber is not subscribed with the webhook.
				const resultMessage =
					"Provided subscriberUrl does not have a webhook registered for the given externalTaskListId";
				console.info(formatLogMessage(resultMessage));
				result.status(200).json({ message: resultMessage });
			}
		} catch (error) {
			if (error instanceof ApiError) {
				console.warn(formatLogMessage(error.message));
				result.status(error.code).json({ message: error.message });
			} else {
				console.error(error);
				throw error;
			}
		}

		result.send();
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
			async (response) => {
				const responseText = await response.text();
				const responseBody = JSON.parse(responseText) as Record<
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
					result.status(500).json({ message: "Failed to set task data due to an error." });
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
