/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";

import { ClientManager } from "../utilities";
import { assertValidTaskData, ITaskData } from "../model-interface";

/**
 * Submits notifications of changes to Fluid Service.
 */
function echoExternalDataWebhookToFluid(
	taskData: ITaskData,
	fluidServiceUrl: string,
	containerUrl: string,
	externalTaskListId: string,
): void {
	console.log(
		`CUSTOMER SERVICE: External data has been updated. Notifying Fluid Service at ${fluidServiceUrl}`,
	);

	// TODO: we will need to add details (like ContainerId) to the message body or the url,
	// so this message body format will evolve
	const messageBody = JSON.stringify({ taskData, containerUrl, externalTaskListId });
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
 * Expected shape of the request that is handled by the
 * /events-listener endpoint
 */
export interface EventsListenerRequest extends express.Request {
	body: {
		/**
		 * The type of the event.
		 * Different event types expect different request parameters and produce different effects.
		 */
		type: string;
	};
}

/**
 * Expected shape of the "session-end" event request that is handled by the
 * /events-listener endpoint
 */
export interface SessionEndEventsListenerRequest extends EventsListenerRequest {
	body: {
		/**
		 * The type of the event
		 */
		type: "session-end";
		/**
		 * The URL of the Fluid container whose session has ended.
		 */
		containerUrl: string;
	};
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
	 * URL of the endpoint used to unregister webhooks from the external data service.
	 *
	 * @remarks
	 *
	 * This endpoint will unregister a given webhook from the external data service so that it will no longer receive data change notifications.
	 */
	externalDataServiceWebhookUnregistrationUrl: string;
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
	const {
		port,
		externalDataServiceWebhookRegistrationUrl,
		externalDataServiceWebhookUnregistrationUrl,
		fluidServiceUrl,
	} = props;

	/**
	 * Helper function to prepend service-specific metadata to messages logged by this service.
	 */
	function formatLogMessage(message: string): string {
		return `CUSTOMER SERVICE (${port}): ${message}`;
	}

	const expressApp = express();
	expressApp.use(express.json());
	expressApp.use(cors());

	/**
	 * Client manager for managing clients session to resourse on external data service.
	 */
	const clientManager = new ClientManager<ITaskData>();

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
	expressApp.post("/external-data-webhook", (request, result) => {
		const externalTaskListId = request.query.externalTaskListId as string;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const messageData = request.body?.data as ITaskData;
		if (messageData === undefined) {
			const errorMessage =
				'No data provided by external data service webhook. Expected under "data" property.';
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ message: errorMessage });
		} else {
			let taskData: ITaskData;
			try {
				taskData = assertValidTaskData(messageData);
			} catch (error) {
				const errorMessage = "Malformed data received from external data service webhook.";
				console.error(formatLogMessage(errorMessage), error);
				result.status(400).json({ errorMessage });
				return;
			}

			const containerUrls = clientManager.getClientSessions(externalTaskListId);
			console.log(
				formatLogMessage(
					`Data update received from external data service. Notifying webhook subscribers.`,
				),
			);
			for (const containerUrl of containerUrls) {
				echoExternalDataWebhookToFluid(
					taskData,
					fluidServiceUrl,
					containerUrl,
					externalTaskListId,
				);
			}
			result.send();
		}
	});

	/**
	 * Creates an entry in the Customer Service of the mapping between the container and the external resource id
	 * (externalTaskListId in this example). Also, it signs up the container with the external service
	 * so that when there is a change upstream and it uses a webhook notification to inform the customer service,
	 * the customer service can in turn notify the container of the change.
	 *
	 * Expected input data format:
	 *
	 * ```json
	 *	{
	 *		containerUrl: string,
	 *		externalTaskListId: string
	 *	}
	 * ```
	 *
	 * Note: Implementers choice --can choose to break up containerUrl into multiple pieces
	 * containing tenantId, documentId and socketStreamURL separately and send them as a json
	 * object. The URL also contains all this information so for simplicity I use the URL here.
	 */
	expressApp.post("/register-session-url", (request, result) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const containerUrl = request.body?.containerUrl as string;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const externalTaskListId = request.body?.externalTaskListId as string;
		if (containerUrl === undefined) {
			const errorMessage =
				'No session data provided by client. Expected under "containerUrl" property.';
			result.status(400).json({ message: errorMessage });
			return;
		}
		if (externalTaskListId === undefined) {
			const errorMessage =
				'No external task list id provided by client. Expected under "externalTaskListId" property.';
			result.status(400).json({ message: errorMessage });
			return;
		}
		if (!clientManager.isSubscribed(externalTaskListId)) {
			// Register with external data service for webhook notifications.
			fetch(externalDataServiceWebhookRegistrationUrl, {
				method: "POST",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					// The external data service will call this service's own webhook echoer endpoint which will in turn notify our subscribers of the data changes.
					url: `http://localhost:${port}/external-data-webhook?externalTaskListId=${externalTaskListId}`,
					externalTaskListId,
				}),
			}).catch((error) => {
				console.error(
					formatLogMessage(
						`Registering for data update notifications webhook with the external data service failed due to an error.`,
					),
					error,
				);
				throw error;
			});
		}

		clientManager.registerClient(containerUrl, externalTaskListId);
		console.log(
			formatLogMessage(
				`Registered containerUrl ${containerUrl} with external query: ${externalTaskListId}".`,
			),
		);

		result.send();
	});

	/**
	 * An 'events' endpoint that can be called by Fluid services.
	 *
	 * For the 'session-end' event {@link SessionEndEventsListenerRequest}: If after unregistering the given client URL, there are any task ids that have an outstanding
	 * webhook registered using this service's internal '/external-data-webhook' endpoint but has no respective active client sessions mapped to them anymore,
	 * then those webhooks will be deregistered.
	 *
	 * @remarks Currently, the only supported request type is 'session-end' {@link SessionEndEventsListenerRequest} which enables the Fluid service to notify this service
	 * that a particular Fluid session has ended which in turn causes this service to unregister any related webhooks to the respective Fluid session.
	 */
	expressApp.post("/events-listener", (request: EventsListenerRequest, result) => {
		const eventType = request.body?.type;

		if (eventType === "session-end") {
			const typedRequest = request as SessionEndEventsListenerRequest;
			const containerUrl = typedRequest.body?.containerUrl;
			if (containerUrl === undefined || typeof containerUrl !== "string") {
				const errorMessage = `Missing or malformed containerUrl: ${containerUrl}`;
				result.status(400).json({ message: errorMessage });
				return;
			}

			// Removes the mapping of the given container URL from all task id's
			const emptyTaskListRegistrationIds =
				clientManager.removeAllClientTaskListRegistrations(containerUrl);
			// If there are any task list id's that no longer have any active client sessions mapped to them
			// then we should deregister our webhook for that task list id.
			for (const emptyExternalTaskListId of emptyTaskListRegistrationIds) {
				fetch(externalDataServiceWebhookUnregistrationUrl, {
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						// External data service will call our webhook echoer to notify our subscribers of the data changes.
						url: `http://localhost:${port}/external-data-webhook?externalTaskListId=${emptyExternalTaskListId}`,
						emptyExternalTaskListId,
					}),
				}).catch((error) => {
					console.error(
						formatLogMessage(
							`Un-registering for data update notifications webhook with the external data service failed due to an error.`,
						),
						error,
					);
					throw error;
				});
			}
		} else {
			const errorMessage = `Unexpected event type: ${eventType}`;
			console.error(formatLogMessage(errorMessage));
			result.status(400).json({ errorMessage });
		}

		result.send();
	});

	const server = expressApp.listen(port.toString());

	server.on("close", () => {
		console.log(formatLogMessage("Service was closed."));
	});

	console.log(formatLogMessage(`Now running on port ${port}.`));
	return server;
}
