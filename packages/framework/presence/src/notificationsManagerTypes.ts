/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable, Off } from "@fluidframework/core-interfaces";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import type { Attendee, PresenceWithNotifications as Presence } from "./presence.js";

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
	unattendedNotification: (name: string, sender: Attendee, ...content: unknown[]) => void;
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
			sender: Attendee,
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
			sender: Attendee,
			...args: InternalUtilityTypes.JsonDeserializedParameters<TListeners[K]>
		) => void,
	): void;
}

/**
 * Record of notification subscription signatures transformed from listener emit signatures.
 *
 * @remarks
 * Prepends the `sender: Attendee` parameter to each notification listener signature.
 *
 * @sealed
 * @alpha
 */
export type NotificationSubscriberSignatures<
	E extends InternalUtilityTypes.NotificationListeners<E>,
> = {
	[K in keyof InternalUtilityTypes.NotificationListeners<E>]: (
		sender: Attendee,
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
	broadcast<K extends keyof InternalUtilityTypes.NotificationListeners<E>>(
		notificationName: K,
		...args: Parameters<E[K]>
	): void;

	/**
	 * Emits a notification with the specified name and arguments, notifying a single attendee.
	 * @param notificationName - the name of the notification to fire
	 * @param targetAttendee - the single attendee to notify
	 * @param args - the arguments sent with the notification
	 */
	unicast<K extends keyof InternalUtilityTypes.NotificationListeners<E>>(
		notificationName: K,
		targetAttendee: Attendee,
		...args: Parameters<E[K]>
	): void;
}

/**
 * Provides notifications from this client to others and subscription
 * to their notifications.
 *
 * @remarks Create using {@link (Notifications:1)} registered to
 * {@link NotificationsWorkspace} or {@link StatesWorkspace}.
 *
 * @sealed
 * @alpha
 */
export interface NotificationsManager<
	T extends InternalUtilityTypes.NotificationListeners<T>,
> {
	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;

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

/**
 * Type alias for the return type of {@link (Notifications:1)}.
 *
 * @remarks
 * Use this type instead of any InternalPresenceTypes that may be revealed from
 * examining factory return type.
 *
 * @alpha
 * @sealed
 */
export type NotificationsConfiguration<
	T extends InternalUtilityTypes.NotificationListeners<T>,
	Key extends string,
> = InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<T>
>;

/**
 * Type alias for the return type of {@link (Notifications:2)}.
 *
 * @remarks
 * Use this type instead of any InternalPresenceTypes that may be revealed from
 * examining factory return type.
 *
 * @alpha
 * @sealed
 */
export type NotificationsWithSubscriptionsConfiguration<
	TSubscriptions extends
		InternalUtilityTypes.NotificationListenersWithSubscriberSignatures<TSubscriptions>,
	Key extends string,
> = InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<
		InternalUtilityTypes.NotificationListenersFromSubscriberSignatures<TSubscriptions>
	>
>;
