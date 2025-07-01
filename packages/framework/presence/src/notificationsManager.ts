/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listeners, Listenable, Off } from "@fluidframework/core-interfaces";
import type { JsonTypeWith } from "@fluidframework/core-interfaces/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import type { PostUpdateAction, ValueManager } from "./internalTypes.js";
import { revealOpaqueJson, toOpaqueJson } from "./internalUtils.js";
import type { Attendee, PresenceWithNotifications as Presence } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

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
 * Record of notification subscriptions.
 *
 * @sealed
 * @alpha
 */
export type NotificationSubscriptions<
	E extends InternalUtilityTypes.NotificationListeners<E>,
> = {
	[K in string & keyof InternalUtilityTypes.NotificationListeners<E>]: (
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
 * @remarks Create using {@link Notifications} registered to
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
 * Object.keys retyped to support specific records keys and
 * branded string-based keys.
 */
const recordKeys = Object.keys as <K extends string>(o: Partial<Record<K, unknown>>) => K[];

class NotificationsManagerImpl<
	T extends InternalUtilityTypes.NotificationListeners<T>,
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
		broadcast: (name: string, ...args) => {
			this.datastore.localUpdate(
				this.key,
				{
					rev: 0,
					timestamp: 0,
					value: toOpaqueJson({
						name,
						args: [...(args as JsonTypeWith<never>[])],
					}),
					ignoreUnmonitored: true,
				},
				// This is a notification, so we want to send it immediately.
				{ allowableUpdateLatencyMs: 0 },
			);
		},
		unicast: (name: string, targetAttendee, ...args) => {
			this.datastore.localUpdate(
				this.key,
				{
					rev: 0,
					timestamp: 0,
					value: toOpaqueJson({
						name,
						args: [...(args as JsonTypeWith<never>[])],
					}),
					ignoreUnmonitored: true,
				},
				// This is a notification, so we want to send it immediately.
				{ allowableUpdateLatencyMs: 0, targetClientId: targetAttendee.getConnectionId() },
			);
		},
	};

	// Workaround for types
	private readonly notificationsInternal = createEmitter<NotificationSubscriptions<T>>();

	public readonly notifications: NotificationListenable<T> = this.notificationsInternal;

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<
			Key,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>,
		initialSubscriptions: Partial<NotificationSubscriptions<T>>,
	) {
		// Add event listeners provided at instantiation
		for (const subscriptionName of recordKeys(initialSubscriptions)) {
			// Lingering Event typing issues with Notifications specialization requires
			// this cast. The only thing that really matters is that name is a string.
			const name = subscriptionName as keyof Listeners<NotificationSubscriptions<T>>;
			const value = initialSubscriptions[subscriptionName];
			// This check should not be needed while using exactOptionalPropertyTypes, but
			// typescript appears to ignore that with Partial<>. Good to be defensive
			// against callers sending `undefined` anyway.
			if (value !== undefined) {
				this.notificationsInternal.on(name, value);
			}
		}
	}

	public get presence(): Presence {
		return this.datastore.presence;
	}

	public update(
		attendee: Attendee,
		_received: number,
		updateValue: InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	): PostUpdateAction[] {
		const postUpdateActions: PostUpdateAction[] = [];
		const value = revealOpaqueJson(updateValue.value);
		const eventName = value.name as keyof Listeners<NotificationSubscriptions<T>>;
		if (this.notificationsInternal.hasListeners(eventName)) {
			// Without schema validation, we don't know that the args are the correct type.
			// For now we assume the user is sending the correct types and there is no corruption along the way.
			const args = [attendee, ...value.args] as Parameters<
				NotificationSubscriptions<T>[typeof eventName]
			>;
			postUpdateActions.push(() => this.notificationsInternal.emit(eventName, ...args));
		} else {
			postUpdateActions.push(() =>
				this.events.emit("unattendedNotification", value.name, attendee, ...value.args),
			);
		}
		return postUpdateActions;
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
	T extends InternalUtilityTypes.NotificationListeners<T>,
	Key extends string = string,
>(
	initialSubscriptions: Partial<NotificationSubscriptions<T>>,
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
