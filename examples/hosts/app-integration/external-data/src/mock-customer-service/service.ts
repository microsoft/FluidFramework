/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";

import { assertValidTaskListData, TaskListData } from "../model-interface";
import { ClientManager } from "../utilities";

/**
 * Submits notifications of changes to Fluid Service.
 */
function echoExternalDataWebhookToFluid(
	data: TaskListData,
	fluidServiceUrl: string,
	containerUrl: string,
): void {
	console.log(
		`CUSTOMER SERVICE: External data has been updated. Notifying Fluid Service at ${fluidServiceUrl}`,
	);

	const messageBody = JSON.stringify({ data, containerUrl });
	fetch(fluidServiceUrl, {
		method: "POST",
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": "application/json",
		},
		body: messageBody,
	}).catch((error) => {
		console.error(
			"CUSTOMER SERVICE: Encountered an error while notifying Fluid Service:",
			error,
		);
	});
}

/**
 * Registers for webhook on receiving a specific resource to register for.
 */
async function registerForWebhook(
	port: string,
	externalDataServiceWebhookRegistrationUrl: string,
): Promise<void> {
	// Register with external data service for webhook notifications.
	await fetch(externalDataServiceWebhookRegistrationUrl, {
		method: "POST",
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			// External data service will call our webhook echoer to notify our subscribers of the data changes.
			url: `http://localhost:${port}/external-data-webhook`,
		}),
	});
}

/**
 * {@link initializeCustomerService} input properties.
 */
export interface ServiceProps {
	/**
	 * Port to listen on.
	 */
	port: number | string;

	/**
	 * URL of the external data service webhook.
	 *
	 * @remarks
	 *
	 * This service will register with the external data service to receive data change notifications.
	 * Any registered listeners for this "webhook echo" via `/register-for-webhook` will be notified of changes
	 * any time the external data service communicates them.
	 */
	externalDataServiceWebhookRegistrationUrl: string;

	/**
	 * URL of the Fluid Service to notify when external data notification comes in.
	 *
	 * @remarks
	 *
	 * Once the notification comes in from the external data service that data
	 * has changed on it, this service needs to let the Fluid Service know on this URL
	 * that there has been a change.
	 */
	fluidServiceUrl: string;
}

/**
 * Initializes the mock customer service.
 */
export async function initializeCustomerService(props: ServiceProps): Promise<Server> {
	const { port, externalDataServiceWebhookRegistrationUrl, fluidServiceUrl } = props;

	/**
	 * Helper function to prepend service-specific metadata to messages logged by this service.
	 */
	function formatLogMessage(message: string): string {
		return `CUSTOMER SERVICE (${port}): ${message}`;
	}

	/**
	 * Client manager for managing clients session to resourse on external data service.
	 */
	const clientManager = new ClientManager<TaskListData>();

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
	 * "Echoes" the external data services data update notifications to our own webhook subscribers.
	 *
	 * Expected input data format:
	 *
	 * ```json
	 *	{
	 *		taskList: {
	 *			[id: string]: {
	 *				name: string,
	 * 				priority: number
	 *			}
	 *		}
	 *	}
	 * ```
	 *
	 * This data will be forwarded to our own subscribers.
	 */
	expressApp.post("/external-data-webhook", (request, result) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const messageData = request.body?.data as unknown;
		if (messageData === undefined) {
			const errorMessage =
				'No data provided by external data service webhook. Expected under "data" property.';
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			let taskListData: TaskListData;
			try {
				taskListData = assertValidTaskListData(messageData);
			} catch (error) {
				const errorMessage = "Malformed data received from external data service webhook.";
				console.error(formatLogMessage(errorMessage), error);
				result.status(400).json({ errorMessage });
				return;
			}

			// Retrieve exact Fluid session address for taskList
			const taskListId = Object.keys(taskListData.taskList)[0];
			const containerUrls = clientManager.getClientSessions(taskListId);

			console.log(
				formatLogMessage(
					`Data update received from external data service. Notifying webhook subscribers.`,
				),
			);
			for (const containerUrl of containerUrls) {
				echoExternalDataWebhookToFluid(taskListData, fluidServiceUrl, containerUrl);
			}
			result.send();
		}
	});

	/**
	 * "Echoes" the external data services data update notifications to our own webhook subscribers.
	 *
	 * Expected input data format:
	 *
	 * ```json
	 * {
	 *		taskList: {
	 * 			[ taskListId: string]: {
	 *      		[id: string]: {
	 *      	    	name: string,
	 *      	    	priority: number
	 *      		}
	 * 			}
	 *  	}
	 * }
	 * ```
	 *
	 * This data will be forwarded to our own subscribers.
	 */
	expressApp.post("/register-session-url", (request, result) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const containerUrl = request.body?.containerUrl as string;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const taskListId = request.body?.taskListId as string;
		if (containerUrl === undefined) {
			const errorMessage =
				'No session data provided by client. Expected under "sessionUrl" property.';
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			clientManager.registerClient(containerUrl, taskListId);
			console.log(
				formatLogMessage(
					`Registered containerUrl ${containerUrl} with external query: ${taskListId}".`,
				),
			);
			registerForWebhook(port.toString(), externalDataServiceWebhookRegistrationUrl).catch(
				(error) => {
					console.error(
						formatLogMessage(
							`Registering for data update notifications webhook with the external data service failed due to an error.`,
						),
						error,
					);
					throw error;
				},
			);
			result.send();
		}
	});

	const server = expressApp.listen(port.toString());

	server.on("close", () => {
		console.log(formatLogMessage("Service was closed."));
	});

	console.log(formatLogMessage(`Now running on port ${port}.`));
	return server;
}
