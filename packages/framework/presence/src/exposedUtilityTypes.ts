/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalCoreInterfacesUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { Attendee } from "./presence.js";

/**
 * Collection of utility types that are not intended to be used/imported
 * directly outside of this package.
 *
 * @alpha
 * @system
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/**
	 * Yields `IfParametersValid` when the given type is an acceptable shape for a
	 * notification. `Else` otherwise.
	 *
	 * @system
	 */
	export type IfNotificationParametersSignature<Event, IfParametersValid, Else> =
		Event extends (...args: infer P) => void
			? InternalCoreInterfacesUtilityTypes.IfSameType<
					P,
					JsonSerializable<P>,
					IfParametersValid,
					Else
				>
			: Else;

	/**
	 * Yields `IfSubscriber` when the given type is an acceptable shape for a notification
	 * listener (subscriber) function. `Else` otherwise.
	 *
	 * @system
	 */
	export type IfNotificationSubscriberSignature<Event, IfSubscriber, Else> = Event extends (
		sender: Attendee,
		...args: infer P
	) => void
		? InternalCoreInterfacesUtilityTypes.IfSameType<P, JsonSerializable<P>, IfSubscriber, Else>
		: Else;

	/**
	 * Used to specify the kinds of notifications handled by a {@link NotificationListenable}
	 * by describing the custom parameters in a function signature.
	 *
	 * @remarks
	 *
	 * Any object type is a valid NotificationListeners, but only the notification-like
	 * properties of that type will be included.
	 *
	 * @example
	 *
	 * ```typescript
	 * interface MyNotifications {
	 *   load: (user: string, data: IUserData) => void;
	 *   requestPause: (period: number) => void;
	 * }
	 * ```
	 *
	 * @system
	 */
	export type NotificationListeners<E> = {
		[P in keyof E as IfNotificationParametersSignature<E[P], P, never>]: E[P];
	};

	/**
	 * Converts a notification subscriber signature into parameters signature
	 * (by removing the `sender: Attendee` parameter).
	 *
	 * @remarks
	 * No attempt is made to validate that the original signature is valid with
	 * all parameters being JSON-serializable.
	 *
	 * @system
	 */
	export type NotificationParametersSignatureFromSubscriberSignature<Event> = Event extends (
		sender: Attendee,
		...args: infer P
	) => void
		? (...args: P) => void
		: never;

	/**
	 * Used to specify the kinds of notifications handled by a {@link NotificationListenable}
	 * by describing the subscriber signatures.
	 *
	 * @remarks
	 *
	 * Any object type is a valid NotificationListenersWithSubscriberSignatures,
	 * but only the notification-like properties of that type will be included.
	 *
	 * @example
	 *
	 * ```typescript
	 * interface MyNotifications {
	 *   load: (sender: Attendee, user: string, data: IUserData) => void;
	 *   requestPause: (sender: Attendee, period: number) => void;
	 * }
	 * ```
	 *
	 * @system
	 */
	export type NotificationListenersWithSubscriberSignatures<E> = {
		[P in keyof E as IfNotificationSubscriberSignature<E[P], P, never>]: E[P];
	};

	/**
	 * Converts a record of notification subscriber signatures into
	 * a record of base parameter signatures (which are the canonical form).
	 *
	 * @system
	 */
	export type NotificationListenersFromSubscriberSignatures<
		E extends NotificationListenersWithSubscriberSignatures<E>,
	> = {
		[K in keyof NotificationListenersWithSubscriberSignatures<E>]: NotificationParametersSignatureFromSubscriberSignature<
			E[K]
		>;
	} extends infer TListeners
		? // Additional filter is needed to convince TypeScript that the result is NotificationListeners shape
			NotificationListeners<TListeners>
		: never;

	/**
	 * {@link @fluidframework/core-interfaces#JsonDeserialized} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonDeserializedParameters<T extends (...args: any[]) => unknown> = T extends (
		...args: infer P
	) => unknown
		? JsonDeserialized<P>
		: never;

	/**
	 * {@link @fluidframework/core-interfaces#JsonSerializable} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonSerializableParameters<T extends (...args: any[]) => unknown> = T extends (
		...args: infer P
	) => unknown
		? JsonSerializable<P>
		: never;
}
