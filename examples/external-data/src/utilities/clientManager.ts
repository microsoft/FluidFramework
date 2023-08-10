/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a Fluid containers URL.
 * This URL contains the client's Fluid session information necessary for broadcasting signals to.
 */
type ClientConnectionDetails = string;

/**
 * Represents the external data servers query url or uuid.
 * This is the URL or the id of the external resource that the customer service needs to subscribe for at the external service.
 */
type ExternalTaskListId = string;

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
	private readonly _taskListMapping: Map<ExternalTaskListId, Set<ClientConnectionDetails>>;
	/**
	 * Map of active clients to external resource id.
	 * Values are the set of external resource id's that the client has active and is registered to listen for.
	 */
	private readonly _clientMapping: Map<ClientConnectionDetails, Set<ExternalTaskListId>>;

	public constructor() {
		this._clientMapping = new Map<ClientConnectionDetails, Set<ExternalTaskListId>>();
		this._taskListMapping = new Map<ExternalTaskListId, Set<ClientConnectionDetails>>();
	}
	/**
	 * Gets the current list of client session URLs for the specified task list id.
	 */
	public getClientSessions(externalTaskListId: ExternalTaskListId): Set<ClientConnectionDetails> {
		const clientSessionUrls = this._taskListMapping.get(externalTaskListId);
		return clientSessionUrls ?? new Set<ClientConnectionDetails>();
	}

	/**
	 * Returns a boolean if externalTaskListId already exists entry exists. This means that the customer service
	 * is already subscribed for webhook notifications for it so we do not need to re-subscribe.
	 */
	public isSubscribed(externalTaskListId: string): boolean {
		return this._taskListMapping.has(externalTaskListId);
	}

	/**
	 * Registers a client session url to an external resource id until removeClientTaskListRegistration is called.
	 * The client can choose when to call it, typically it will be at the end of the session.
	 */
	public registerClient(
		tenantId: string,
		documentId: string,
		externalTaskListId: ExternalTaskListId,
	): void {
		const client = `${tenantId}/${documentId}`;
		if (this._clientMapping.get(client) === undefined) {
			this._clientMapping.set(client, new Set<ExternalTaskListId>([externalTaskListId]));
		} else {
			this._clientMapping.get(client)?.add(externalTaskListId);
		}

		if (this._taskListMapping.get(externalTaskListId) === undefined) {
			this._taskListMapping.set(
				externalTaskListId,
				new Set<ClientConnectionDetails>([client]),
			);
		} else {
			this._taskListMapping.get(externalTaskListId)?.add(client);
		}
		console.log(
			`CUSTOMER SERVICE: "${client}" has been registered with ${externalTaskListId}.`,
		);
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeClientTaskListRegistration(
		tenantId: string,
		documentId: string,
		externalTaskListId: ExternalTaskListId,
	): void {
		const client = `${tenantId}/${documentId}`;
		const clientTaskListIds = this._clientMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (clientTaskListIds !== undefined && clientTaskListIds.has(externalTaskListId)) {
			clientTaskListIds.delete(externalTaskListId);
		}
		const taskListClients = this._taskListMapping.get(externalTaskListId);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
		if (taskListClients !== undefined && taskListClients.has(client)) {
			taskListClients.delete(client);
		}
	}
}
