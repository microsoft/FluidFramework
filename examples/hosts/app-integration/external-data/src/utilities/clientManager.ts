/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	 * Map of active external resource id to client sessions.
	 * Values are the set of Fluid Container URLs that will be notified of changes.
	 */
	private readonly _taskListMapping: Map<ExternalTaskListId, Set<ClientSessionUrl>>;
	/**
	 * Map of active clients to external resource id.
	 * Values are the set of external resource id's that the client has active and is registered to listen for.
	 */
	private readonly _clientMapping: Map<ClientSessionUrl, Set<ExternalTaskListId>>;

	public constructor() {
		this._clientMapping = new Map<ClientSessionUrl, Set<ExternalTaskListId>>();
		this._taskListMapping = new Map<ExternalTaskListId, Set<ClientSessionUrl>>();
	}

	/**
	 * Gets the current list of client session URLs for the specified task list id.
	 */
	public getClientSessions(externalTaskListId: ExternalTaskListId): Set<ClientSessionUrl> {
		const clientSessionUrls = this._clientMapping.get(externalTaskListId);
		if (clientSessionUrls === undefined) {
			console.error(
				`CUSTOMER SERVICE: "${externalTaskListId}" is not registered to a client session.`,
			);
		}
		return clientSessionUrls ?? new Set<ClientSessionUrl>();
	}

	/**
	 * Registers a client session url to an external resource id for the duration of the client session.
	 */
	public registerClient(client: ClientSessionUrl, externalTaskListId: ExternalTaskListId): void {
		if (this._taskListMapping.get(client) === undefined) {
			this._taskListMapping.set(client, new Set<ExternalTaskListId>([externalTaskListId]));
		}

		if (this._clientMapping.get(externalTaskListId) === undefined) {
			this._clientMapping.set(externalTaskListId, new Set<ClientSessionUrl>([client]));
		}
		console.log(
			`CUSTOMER SERVICE: "${client}" has been registered with ${externalTaskListId}.`,
		);
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeClientTaskListRegistration(
		client: ClientSessionUrl,
		externalTaskListId: ExternalTaskListId,
	): void {
		const clientTaskListIds = this._clientMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (clientTaskListIds !== undefined && clientTaskListIds.has(externalTaskListId)) {
			clientTaskListIds.delete(externalTaskListId);
		}
		const taskListClients = this._taskListMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (taskListClients !== undefined && taskListClients.has(client)) {
			this._taskListMapping.delete(client);
		}
	}
}
