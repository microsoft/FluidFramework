/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listeners, Listenable, Off } from "@fluidframework/core-interfaces";

import type { ValueManager } from "./internalTypes.js";
import type { ISessionClient } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

import type { JsonTypeWith } from "@fluidframework/presence/internal/core-interfaces";
import type { InternalTypes } from "@fluidframework/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/exposedUtilityTypes";

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
		broadcast: (name, ...args) => {
			this.datastore.localUpdate(
				this.key,
				{
					rev: 0,
					timestamp: 0,
					value: { name, args: [...(args as JsonTypeWith<never>[])] },
					ignoreUnmonitored: true,
				},
				// This is a notification, so we want to send it immediately.
				{ allowableUpdateLatencyMs: 0 },
			);
		},
		unicast: (name, targetClient, ...args) => {
			this.datastore.localUpdate(
				this.key,
				{
					rev: 0,
					timestamp: 0,
					value: { name, args: [...(args as JsonTypeWith<never>[])] },
					ignoreUnmonitored: true,
				},
				// This is a notification, so we want to send it immediately.
				{ allowableUpdateLatencyMs: 0, targetClientId: targetClient.getConnectionId() },
			);
		},
	};

	// Workaround for types
	private readonly notificationsInternal = createEmitter<NotificationSubscriptions<T>>();

	// @ts-expect-error TODO
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

	public update(
		client: ISessionClient,
		_received: number,
		value: InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	): (() => void)[] {
		const eventName = value.value.name as keyof Listeners<NotificationSubscriptions<T>>;
		if (this.notificationsInternal.hasListeners(eventName)) {
			// Without schema validation, we don't know that the args are the correct type.
			// For now we assume the user is sending the correct types and there is no corruption along the way.
			const args = [client, ...value.value.args] as Parameters<
				NotificationSubscriptions<T>[typeof eventName]
			>;
			this.notificationsInternal.emit(eventName, ...args);
		} else {
			return [
				() =>
					this.events.emit(
						"unattendedNotification",
						value.value.name,
						client,
						...value.value.args,
					),
			];
		}
		return [];
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
