/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable, Off } from "@fluidframework/core-interfaces";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/exposedUtilityTypes";

import type { ISessionClient } from "./sessionClientTypes.js";

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
export interface NotificationListenable<
	TListeners extends InternalUtilityTypes.NotificationListeners<TListeners>,
> {
	/**
	 * Register a notification listener.
	 * @param notificationName - the name of the notification
	 * @param listener - The listener function to run when the notification is fired.
	 * @returns A {@link @fluidframework/core-interfaces#Off | function} which will deregister the listener when called.
	 * Calling the deregistration function more than once will have no effect.
	 *
	 * Listeners may also be deregistered by passing the listener to {@link NotificationListenable.off | off()}.
	 * @remarks Registering the exact same `listener` object for the same notification more than once will throw an error.
	 * If registering the same listener for the same notification multiple times is desired, consider using a wrapper function for the second subscription.
	 */
	on<K extends keyof InternalUtilityTypes.NotificationListeners<TListeners>>(
		notificationName: K,
		listener: (
			sender: ISessionClient,
			...args: InternalUtilityTypes.JsonDeserializedParameters<TListeners[K]>
		) => void,
	): Off;

	/**
	 * Deregister notification listener.
	 * @param notificationName - The name of the notification.
	 * @param listener - The listener function to remove from the current set of notification listeners.
	 * @remarks If `listener` is not currently registered, this method will have no effect.
	 *
	 * Listeners may also be deregistered by calling the {@link @fluidframework/core-interfaces#Off | deregistration function} returned when they are {@link NotificationListenable.on | registered}.
	 */
	off<K extends keyof InternalUtilityTypes.NotificationListeners<TListeners>>(
		notificationName: K,
		listener: (
			sender: ISessionClient,
			...args: InternalUtilityTypes.JsonDeserializedParameters<TListeners[K]>
		) => void,
	): void;
}

/**
 * Record of notification subscriptions.
 *
 * @sealed
 * @alpha
 */
export type NotificationSubscriptions<
	E extends InternalUtilityTypes.NotificationListeners<E>,
> = {
	[K in string & keyof InternalUtilityTypes.NotificationListeners<E>]: (
		sender: ISessionClient,
		...args: InternalUtilityTypes.JsonDeserializedParameters<E[K]>
	) => void;
};

/**
 * Interface for a notification emitter that can send typed notification to other clients.
 *
 * @sealed
 * @alpha
 */
export interface NotificationEmitter<E extends InternalUtilityTypes.NotificationListeners<E>> {
	/**
	 * Emits a notification with the specified name and arguments, notifying all clients.
	 * @param notificationName - the name of the notification to fire
	 * @param args - the arguments sent with the notification
	 */
	broadcast<K extends string & keyof InternalUtilityTypes.NotificationListeners<E>>(
		notificationName: K,
		...args: Parameters<E[K]>
	): void;

	/**
	 * Emits a notification with the specified name and arguments, notifying a single client.
	 * @param notificationName - the name of the notification to fire
	 * @param targetClient - the single client to notify
	 * @param args - the arguments sent with the notification
	 */
	unicast<K extends string & keyof InternalUtilityTypes.NotificationListeners<E>>(
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
export interface NotificationsManager<
	T extends InternalUtilityTypes.NotificationListeners<T>,
> {
	/**
	 * Events for Notifications manager.
	 */
	readonly events: Listenable<NotificationsManagerEvents>;

	/**
	 * Send notifications to other clients.
	 */
	readonly emit: NotificationEmitter<T>;

	/**
	 * Provides subscription to notifications from other clients.
	 */
	readonly notifications: NotificationListenable<T>;
}
