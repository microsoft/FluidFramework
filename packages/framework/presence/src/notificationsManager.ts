/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISessionClient } from "./presence.js";

import type { ISubscribable } from "@fluid-experimental/presence/internal/events";
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

/**
 * Factory for creating a {@link NotificationsManager}.
 *
 * @alpha
 */
export function Notifications<
	T extends InternalUtilityTypes.NotificationEvents<T>,
	Key extends string,
>(
	initialSubscriptions: NotificationSubscriptions<T>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<T>
> {
	throw new Error("Method not implemented.");
}
