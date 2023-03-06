/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import fetch from "node-fetch";

/**
 * Represents a Fluid client URL.
 * This URL contains the client's Fluid session information necessary for broadcasting signals to.
 */
export type ClientSessionUrl = string;

/**
 * Represents the external data servers query url or uuid.
 * This is the URL or the id of the external resource that the customer service needs to subscribe for at the external service.
 */
export type ExternalTaskListId = string;

/**
 * Mock client manager.
 * Can be registered with to receive notifications when {@link ClientManager.notifySubscribers} is called.
 *
 * @typeParam TData - The kind of data that will be sent alongside notifications to subscribers.
 * Must be JSON-serializable.
 */
export class ClientManager<TData = unknown> {
	/**
	 * Map of active external query id to client session.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _taskListMapping: Map<ExternalTaskListId, ClientSessionUrl>;
	/**
	 * Map of active clients to external query id.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _clientMapping: Map<ClientSessionUrl, ExternalTaskListId>;

	public constructor() {
		this._clientMapping = new Map<ClientSessionUrl, ExternalTaskListId>();
		this._taskListMapping = new Map<ExternalTaskListId, ClientSessionUrl>();
	}

	/**
	 * Gets the current list of client session URLs.
	 */
	public get clients(): readonly ClientSessionUrl[] {
		return [...this._clientMapping.keys()];
	}

	/**
	 * Gets the current list external resource ids registered to client session URLs.
	 */
	public get taskLists(): readonly ExternalTaskListId[] {
		return [...this._taskListMapping.keys()];
	}

	/**
	 * Gets the current list of client session URLs.
	 */
	public getClientSession(taskListId: ExternalTaskListId): ClientSessionUrl | undefined {
		if (this._taskListMapping.has(taskListId)) {
			return this._taskListMapping.get(taskListId);
		} else {
			console.error(
				`CUSTOMER SERVICE: "${taskListId}" is not registered to a client session.`,
			);
		}
	}

	/**
	 * Registers a client session url to an external resource  for the duration of the client session.
	 */
	public registerClient(client: ClientSessionUrl, taskListId: ExternalTaskListId): void {
		if (this._taskListMapping.has(client) && this._clientMapping.has(taskListId)) {
			console.warn(
				`CUSTOMER SERVICE: "${client}" has already been registered with ${taskListId}.`,
			);
		} else {
			this._taskListMapping.set(taskListId, client);
			this._clientMapping.set(client, taskListId);
			console.log(`CUSTOMER SERVICE: "${client}" has been registered with ${taskListId}.`);
		}
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeClient(client: ClientSessionUrl): void {
		if (this._clientMapping.has(client)) {
			const taskListId = this._clientMapping.get(client);
			if (taskListId !== undefined && this._taskListMapping.has(taskListId)) {
				this._taskListMapping.delete(taskListId);
			}
			this._clientMapping.delete(client);
		} else {
			console.warn(
				`CUSTOMER SERVICE: URL "${client}" is not registered for data notifications.`,
			);
		}
	}

	// /**
	//  * Submits notifications of changes to webhook subscribers.
	//  */
	// public notifySubscribers(data: TData): void {
	// 	console.log(
	// 		`EXTERNAL DATA SERVICE WEBHOOK: External data has been updated. Notifying ${this._subscribers.size} subscribers...`,
	// 	);

	// 	const messageBody = JSON.stringify({ data });
	// 	for (const subscriberUrl of this._subscribers) {
	// 		fetch(subscriberUrl, {
	// 			method: "POST",
	// 			headers: {
	// 				"Access-Control-Allow-Origin": "*",
	// 				"Content-Type": "application/json",
	// 			},
	// 			body: messageBody,
	// 		}).catch((error) => {
	// 			console.error(
	// 				"EXTERNAL DATA SERVICE WEBHOOK: Encountered an error while notifying subscribers:",
	// 				error,
	// 			);
	// 		});
	// 	}
	// }
}
