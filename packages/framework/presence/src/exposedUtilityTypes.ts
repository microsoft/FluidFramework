/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalUtilityTypes as CoreInternalUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal";

/**
 * Collection of utility types that are not intended to be used/imported
 * directly outside of this package.
 *
 * @beta
 * @system
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/**
	 * `IfListener` iff the given type is an acceptable shape for a notification.
	 * `Else` otherwise.
	 *
	 * @system
	 */
	export type IfNotificationListener<Event, IfListener, Else> = Event extends (
		...args: infer P
	) => void
		? CoreInternalUtilityTypes.IfSameType<
				P,
				JsonSerializable<P> & JsonDeserialized<P>,
				IfListener,
				Else
			>
		: Else;

	/**
	 * Used to specify the kinds of notifications emitted by a {@link NotificationListenable}.
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
		[P in keyof E as IfNotificationListener<E[P], P, never>]: E[P];
	};

	/**
	 * {@link @fluidframework/core-interfaces#JsonDeserialized} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonDeserializedParameters<T extends (...args: any[]) => any> = T extends (
		...args: infer P
	) => any
		? JsonDeserialized<P>
		: never;

	/**
	 * {@link @fluidframework/core-interfaces#JsonSerializable} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonSerializableParameters<T extends (...args: any[]) => any> = T extends (
		...args: infer P
	) => any
		? JsonSerializable<P>
		: never;
}
