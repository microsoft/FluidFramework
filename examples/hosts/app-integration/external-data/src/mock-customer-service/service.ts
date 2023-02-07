/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";

import { assertValidTaskData, TaskData } from "../model-interface";


/**
 * Submits notifications of changes to Fluid Service.
 */
export function notifyFluidService(data: TaskData): void {
	const tinyliciousServicePort = 7070;

	const fluidServiceUrl = `http://localhost:${tinyliciousServicePort}/task-list-hook`;
	console.log(`CUSTOMER SERVICE: Fluid Serice URL is "${fluidServiceUrl}"`);

	console.log(
		`WEBHOOK: External data has been updated. Notifying Fluid Service at ${fluidServiceUrl}`,
	);

	const messageBody = JSON.stringify({ data });
	fetch(fluidServiceUrl, {
		method: "POST",
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": "application/json",
		},
		body: messageBody,
	}).catch((error) => {
		console.error("WEBHOOK: Encountered an error while notifying Fluid Service:", error);
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
}

/**
 * Initializes the mock customer service.
 */
export async function initializeCustomerService(props: ServiceProps): Promise<Server> {
	const { port, externalDataServiceWebhookRegistrationUrl } = props;

	/**
	 * Helper function to prepend service-specific metadata to messages logged by this service.
	 */
	function formatLogMessage(message: string): string {
		return `CUSTOMER SERVICE (${port}): ${message}`;
	}

	// Register with external data service for webhook notifications.
	try {
		await fetch(externalDataServiceWebhookRegistrationUrl, {
			method: "POST",
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				// External data service will call our webhook echoer to notify our subscribers of the data changes.
				url: `http://localhost:${port}/echo-external-data-webhook`,
			}),
		});
	} catch (error) {
		console.error(
			formatLogMessage(
				`Registering for data update notifications webhook with the external data service failed due to an error.`,
			),
			error,
		);
		throw error;
	}

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
	 * {
	 *  taskList: {
	 *      [id: string]: {
	 *          name: string,
	 *          priority: number
	 *      }
	 *  }
	 * }
	 * ```
	 *
	 * This data will be forwarded to our own subscribers.
	 */
	expressApp.post("/echo-external-data-webhook", (request, result) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const messageData = request.body?.data as unknown;
		if (messageData === undefined) {
			const errorMessage =
				'No data provided by external data service webhook. Expected under "data" property.';
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			let taskData: TaskData;
			try {
				taskData = assertValidTaskData(messageData);
			} catch (error) {
				const errorMessage = "Malformed data received from external data service webhook.";
				console.error(formatLogMessage(errorMessage), error);
				result.status(400).json({ errorMessage });
				return;
			}

			console.log(
				formatLogMessage(
					`Data update received from external data service. Notifying webhook subscribers.`,
				),
			);
			notifyFluidService(taskData);
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
