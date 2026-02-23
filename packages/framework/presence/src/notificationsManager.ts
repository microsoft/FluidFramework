/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listeners } from "@fluidframework/core-interfaces";
import type { JsonTypeWith } from "@fluidframework/core-interfaces/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import { revealOpaqueJson, toOpaqueJson } from "./internalUtils.js";
import type {
	NotificationEmitter,
	NotificationListenable,
	NotificationsManager,
	NotificationsManagerEvents,
	NotificationSubscriberSignatures,
} from "./notificationsManagerTypes.js";
import type { Attendee, PresenceWithNotifications as Presence } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import type { PostUpdateAction, ValueManager } from "./statesManagerTypes.js";
import { brandIVM } from "./valueManager.js";

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
	private readonly notificationsInternal =
		createEmitter<NotificationSubscriberSignatures<T>>();

	public readonly notifications: NotificationListenable<T> = this.notificationsInternal;

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<
			Key,
			InternalTypes.ValueRequiredState<InternalTypes.NotificationType>
		>,
		initialSubscriptions: Partial<NotificationSubscriberSignatures<T>>,
	) {
		// Add event listeners provided at instantiation
		for (const subscriptionName of recordKeys(initialSubscriptions)) {
			// Lingering Event typing issues with Notifications specialization requires
			// this cast. The only thing that really matters is that name is a string.
			const name = subscriptionName as keyof Listeners<NotificationSubscriberSignatures<T>>;
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
		const eventName = value.name as keyof Listeners<NotificationSubscriberSignatures<T>>;
		if (this.notificationsInternal.hasListeners(eventName)) {
			// Without schema validation, we don't know that the args are the correct type.
			// For now we assume the user is sending the correct types and there is no corruption along the way.
			const args = [attendee, ...value.args] as Parameters<
				NotificationSubscriberSignatures<T>[typeof eventName]
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
 * @alpha
 *
 * @privateRemarks
 * This overload requires explicit specification of the notification listener
 * types. It is useful when a schema is separately defined.
 */
export function Notifications<
	T extends InternalUtilityTypes.NotificationListeners<T>,
	Key extends string = string,
>(
	initialSubscriptions: Partial<NotificationSubscriberSignatures<T>>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<T>
>;
/**
 * Factory for creating a {@link NotificationsManager}.
 *
 * @alpha
 *
 * @privateRemarks
 * This overload infers the notification listener types from the provided
 * subscriptions, simplifying usage when a schema is not separately defined.
 */
export function Notifications<
	TSubscriptions extends
		InternalUtilityTypes.NotificationListenersWithSubscriberSignatures<TSubscriptions>,
	Key extends string = string,
>(
	initialSubscriptions: Partial<TSubscriptions>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
	NotificationsManager<
		InternalUtilityTypes.NotificationListenersFromSubscriberSignatures<TSubscriptions>
	>
>;

/**
 * Factory for creating a {@link NotificationsManager}.
 *
 * @alpha
 */
export function Notifications<
	T extends InternalUtilityTypes.NotificationListeners<T>,
	Key extends string = string,
	TSubscriptions extends
		NotificationSubscriberSignatures<T> = NotificationSubscriberSignatures<T>,
>(
	initialSubscriptions: Partial<TSubscriptions>,
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
