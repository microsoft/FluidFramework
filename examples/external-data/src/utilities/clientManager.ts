/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a Fluid containers URL.
 * This URL contains the client's Fluid session information necessary for broadcasting signals to.
 */
type ClientSessionUrl = string;

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
		const clientSessionUrls = this._taskListMapping.get(externalTaskListId);
		return clientSessionUrls ?? new Set<ClientSessionUrl>();
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
	public registerClient(client: ClientSessionUrl, externalTaskListId: ExternalTaskListId): void {
		if (this._clientMapping.get(client) === undefined) {
			this._clientMapping.set(client, new Set<ExternalTaskListId>([externalTaskListId]));
		} else {
			this._clientMapping.get(client)?.add(externalTaskListId);
		}

		if (this._taskListMapping.get(externalTaskListId) === undefined) {
			this._taskListMapping.set(externalTaskListId, new Set<ClientSessionUrl>([client]));
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
		client: ClientSessionUrl,
		externalTaskListId: ExternalTaskListId,
	): void {
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

	/**
	 * De-registers the provided subscriber URL from future notifications for all existing tasks it is subscribed to.
	 * @returns A list of task list ID's that no longer have any client sessions mapped to them.
	 */
	public removeAllClientTaskListRegistrations(client: ClientSessionUrl): string[] {
		const clientTaskListIds = this._clientMapping.get(client);
		const emptyTaskListRegistrationIds: string[] = [];
		if (clientTaskListIds !== undefined) {
			for (const taskListId of clientTaskListIds) {
				const taskListClients = this._taskListMapping.get(taskListId);
				// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
				if (taskListClients !== undefined && taskListClients.has(client)) {
					taskListClients.delete(client);
					if (taskListClients.size === 0) {
						emptyTaskListRegistrationIds.push(taskListId);
						this._taskListMapping.delete(taskListId);
					}
				}
			}
			clientTaskListIds.clear();
		}

		return emptyTaskListRegistrationIds;
	}
}
