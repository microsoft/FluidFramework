/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a Fluid containers documentId.
 * It is part of the client's Fluid session information necessary for broadcasting signals to.
 */
type DocumentId = string;
/**
 * Represents a Fluid containers tenantId.
 * It is part of the client's Fluid session information necessary for broadcasting signals to.
 */
type TenantId = string;
/**
 * Represents a Fluid containers URL.
 * This URL contains the client's Fluid session information necessary for broadcasting signals to.
 */
type ClientSessionRecord = Record<TenantId, DocumentId>;

/**
 * String representation of ClientSessionRecord
 */
type ClientSessionString = string;

/**
 * Represents the external data servers query url or uuid.
 * This is the URL or the id of the external resource that the customer service needs to subscribe for at the external service.
 */
type ExternalTaskListId = string;

function clientRecordToString(record: ClientSessionRecord): string {
	return `${record.TenantId}_${record.DocumentId}`;
}

function clientStringToRecord(client: string): ClientSessionRecord {
	const [tenantId, documentId] = client.split("_");
	const record: ClientSessionRecord = { TenantId: tenantId, DocumentId: documentId };
	return record;
}
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
	private readonly _taskListMapping: Map<ExternalTaskListId, Set<ClientSessionString>>;
	/**
	 * Map of active clients to external resource id.
	 * Values are the set of external resource id's that the client has active and is registered to listen for.
	 */
	private readonly _clientMapping: Map<ClientSessionString, Set<ExternalTaskListId>>;

	public constructor() {
		this._clientMapping = new Map<ClientSessionString, Set<ExternalTaskListId>>();
		this._taskListMapping = new Map<ExternalTaskListId, Set<ClientSessionString>>();
	}
	/**
	 * Gets the current list of client session URLs for the specified task list id.
	 */
	public getClientSessions(externalTaskListId: ExternalTaskListId): Set<ClientSessionRecord> {
		const activeClients = this._taskListMapping.get(externalTaskListId);
		const activeClientSessionRecords = new Set<ClientSessionRecord>();
		if (activeClients) {
			// eslint-disable-next-line unicorn/no-array-for-each
			activeClients.forEach((client) => {
				activeClientSessionRecords.add(clientStringToRecord(client));
			});
		}
		return activeClientSessionRecords;
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
		clientRecord: ClientSessionRecord,
		externalTaskListId: ExternalTaskListId,
	): void {
		const client = clientRecordToString(clientRecord);
		if (this._clientMapping.get(client) === undefined) {
			this._clientMapping.set(client, new Set<ExternalTaskListId>([externalTaskListId]));
		} else {
			this._clientMapping.get(client)?.add(externalTaskListId);
		}

		if (this._taskListMapping.get(externalTaskListId) === undefined) {
			this._taskListMapping.set(externalTaskListId, new Set<ClientSessionString>([client]));
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
		clientRecord: ClientSessionRecord,
		externalTaskListId: ExternalTaskListId,
	): void {
		const client = clientRecordToString(clientRecord);
		const clientTaskListIds = this._clientMapping.get(client);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- Use of optional chaining disrupts needed type narrowing
		if (clientTaskListIds !== undefined && clientTaskListIds.has(externalTaskListId)) {
			clientTaskListIds.delete(externalTaskListId);
		}
		const taskListClients = this._taskListMapping.get(externalTaskListId);
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- Use of optional chaining disrupts needed type narrowing
		if (taskListClients !== undefined && taskListClients.has(client)) {
			taskListClients.delete(client);
		}
	}

	/**
	 * De-registers the provided subscriber URL from future notifications for all existing tasks it is subscribed to.
	 * @returns A list of task list ID's that no longer have any client sessions mapped to them.
	 */
	public removeAllClientTaskListRegistrations(clientRecord: ClientSessionRecord): string[] {
		const client = clientRecordToString(clientRecord);
		const clientTaskListIds = this._clientMapping.get(client);
		const emptyTaskListRegistrationIds: string[] = [];
		if (clientTaskListIds !== undefined) {
			// eslint-disable-next-line unicorn/no-array-for-each
			clientTaskListIds.forEach((taskListId) => {
				const taskListClients = this._taskListMapping.get(taskListId);
				// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- Use of optional chaining disrupts needed type narrowing
				if (taskListClients !== undefined && taskListClients.has(client)) {
					taskListClients.delete(client);
					if (taskListClients.size === 0) {
						emptyTaskListRegistrationIds.push(taskListId);
						this._taskListMapping.delete(taskListId);
					}
				}
			});
			clientTaskListIds.clear();
		}

		return emptyTaskListRegistrationIds;
	}
}
