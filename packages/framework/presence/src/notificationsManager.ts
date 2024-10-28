/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueManager } from "./internalTypes.js";
import type { ISessionClient } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

import type { ISubscribable } from "@fluid-experimental/presence/internal/events";
import { createEmitter } from "@fluid-experimental/presence/internal/events";
import type { InternalTypes } from "@fluid-experimental/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluid-experimental/presence/internal/exposedUtilityTypes";

/**
 * @sealed
 * @alpha
 */
export interface NotificationsManagerEvents {
	/**
	 * Raised when notification is received, but no subscribers were found.
	 *
	 * @eventProperty
	 */
	unattendedNotification: (
		name: string,
		sender: ISessionClient,
		...content: unknown[]
	) => void;
}

/**
 * An object which allows the registration of listeners so that subscribers can be
 * notified when a notification happens.
 *
 * @sealed
 * @alpha
 */
export interface NotificationSubscribable<
	E extends InternalUtilityTypes.NotificationEvents<E>,
> {
	/**
	 * Register a notification listener.
	 * @param notificationName - the name of the notification
	 * @param listener - the handler to run when the notification is received from other client
	 * @returns a function which will deregister the listener when run. This function
	 * has undefined behavior if called more than once.
	 */
	on<K extends keyof InternalUtilityTypes.NotificationEvents<E>>(
		notificationName: K,
		listener: (
			sender: ISessionClient,
			...args: InternalUtilityTypes.JsonDeserializedParameters<E[K]>
		) => void,
	): () => void;
}

/**
 * Record of notification subscriptions.
 *
 * @sealed
 * @alpha
 */
export type NotificationSubscriptions<E extends InternalUtilityTypes.NotificationEvents<E>> = {
	[K in string & keyof InternalUtilityTypes.NotificationEvents<E>]: (
		sender: ISessionClient,
		...args: InternalUtilityTypes.JsonSerializableParameters<E[K]>
	) => void;
};

/**
 * Interface for a notification emitter that can send typed notification to other clients.
 *
 * @sealed
 * @alpha
 */
export interface NotificationEmitter<E extends InternalUtilityTypes.NotificationEvents<E>> {
	/**
	 * Emits a notification with the specified name and arguments, notifying all clients.
	 * @param notificationName - the name of the notification to fire
	 * @param args - the arguments sent with the notification
	 */
	broadcast<K extends string & keyof InternalUtilityTypes.NotificationEvents<E>>(
		notificationName: K,
		...args: Parameters<E[K]>
	): void;

	/**
	 * Emits a notification with the specified name and arguments, notifying a single client.
	 * @param notificationName - the name of the notification to fire
	 * @param targetClient - the single client to notify
	 * @param args - the arguments sent with the notification
	 */
	unicast<K extends string & keyof InternalUtilityTypes.NotificationEvents<E>>(
		notificationName: K,
		targetClient: ISessionClient,
		...args: Parameters<E[K]>
	): void;
}

/**
 * Value manager that provides notifications from this client to others and subscription
 * to their notifications.
 *
 * @remarks Create using {@link Notifications} registered to {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export interface NotificationsManager<T extends InternalUtilityTypes.NotificationEvents<T>> {
	/**
	 * Events for Notifications manager.
	 */
	readonly events: ISubscribable<NotificationsManagerEvents>;

	/**
	 * Send notifications to other clients.
	 */
	readonly emit: NotificationEmitter<T>;

	/**
	 * Provides subscription to notifications from other clients.
	 */
	readonly notifications: NotificationSubscribable<T>;
}

class NotificationsManagerImpl<
	T extends InternalUtilityTypes.NotificationEvents<T>,
	Key extends string,
> implements
		NotificationsManager<T>,
		ValueManager<
			InternalTypes.NotificationType,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>
{
	public readonly events = createEmitter<NotificationsManagerEvents>();

	public readonly emit: NotificationEmitter<T> = {
		broadcast: (name, ...args) => {
			this.datastore.localUpdate(
				this.key,
				// @ts-expect-error TODO
				{ rev: 0, timestamp: 0, value: { name, args: [...args] }, ignoreUnmonitored: true },
				true,
			);
		},
		unicast: (name, targetClient, ...args) => {
			this.datastore.localUpdate(
				this.key,
				// @ts-expect-error TODO
				{ rev: 0, timestamp: 0, value: { name, args: [...args] }, ignoreUnmonitored: true },
				targetClient,
			);
		},
	};
	// @ts-expect-error TODO

	public readonly notifications: NotificationSubscribable<T> =
		// @ts-expect-error TODO
		createEmitter<NotificationSubscriptions<T>>();

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<
			Key,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>,
		_initialSubscriptions: Partial<NotificationSubscriptions<T>>,
	) {}

	public update(
		client: ISessionClient,
		_received: number,
		value: InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	): void {
		console.debug(`NotificationsManager.update called:`)
		this.events.emit("unattendedNotification", value.value.name, client, ...value.value.args);
	}
}

/**
 * Factory for creating a {@link NotificationsManager}.
 *
 * @remarks
 * Typescript inference for `Notifications` is not working correctly yet.
 * Explicitly specify generics to make result types usable.
 *
 * @alpha
 */
export function Notifications<
	T extends InternalUtilityTypes.NotificationEvents<T>,
	Key extends string = string,
>(
	initialSubscriptions: NotificationSubscriptions<T>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<T>
> {
	const factory = (
		key: Key,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			Key,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>,
	): {
		manager: InternalTypes.StateValue<NotificationsManager<T>>;
	} => ({
		manager: brandIVM<
			NotificationsManagerImpl<T, Key>,
			InternalTypes.NotificationType,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>(
			new NotificationsManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				initialSubscriptions,
			),
		),
	});
	return Object.assign(factory, { instanceBase: NotificationsManagerImpl });
}
