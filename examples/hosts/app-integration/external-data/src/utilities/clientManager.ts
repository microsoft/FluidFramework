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
	private readonly _taskListMapping: Map<ExternalTaskListId, Set<ClientSessionUrl>>;
	/**
	 * Map of active clients to external query id.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _clientMapping: Map<ClientSessionUrl, Set<ExternalTaskListId>>;

	public constructor() {
		this._clientMapping = new Map<ClientSessionUrl, Set<ExternalTaskListId>>();
		this._taskListMapping = new Map<ExternalTaskListId, Set<ClientSessionUrl>>();
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
	public getClientSessions(taskListId: ExternalTaskListId): Set<ClientSessionUrl> {
		if (this._taskListMapping.get(taskListId) === undefined) {
			console.error(
				`CUSTOMER SERVICE: "${taskListId}" is not registered to a client session.`,
			);
		}
		return this._taskListMapping.get(taskListId) ?? new Set<ClientSessionUrl>();
	}

	/**
	 * Registers a client session url to an external resource  for the duration of the client session.
	 */
	public registerClient(client: ClientSessionUrl, taskListId: ExternalTaskListId): void {
		if (this._taskListMapping.get(client) === undefined) {
			this._taskListMapping.set(client, new Set<ExternalTaskListId>());
		}
		this._taskListMapping.get(client)?.add(taskListId);

		if (this._clientMapping.get(taskListId) === undefined) {
			this._clientMapping.set(client, new Set<ClientSessionUrl>());
		}
		this._clientMapping.get(taskListId)?.add(client);
		console.log(`CUSTOMER SERVICE: "${client}" has been registered with ${taskListId}.`);
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeClientTaskListRegistration(
		client: ClientSessionUrl,
		taskListId: ExternalTaskListId,
	): void {
		const clientTaskListIds = this._clientMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (clientTaskListIds !== undefined && clientTaskListIds.has(taskListId)) {
			clientTaskListIds.delete(taskListId);
		}
		const taskListClients = this._taskListMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (taskListClients !== undefined && taskListClients.has(client)) {
			this._taskListMapping.delete(client);
		}
	}
}
