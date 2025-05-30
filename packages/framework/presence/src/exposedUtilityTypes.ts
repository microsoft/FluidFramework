/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	InternalUtilityTypes as CoreInternalUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
	OpaqueJsonDeserialized,
	JsonTypeToOpaqueJson,
	OpaqueJsonToJsonType,
	OpaqueJsonSerializable,
} from "@fluidframework/core-interfaces/internal";

import { asDeeplyReadonly } from "./internalUtils.js";

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
	 * `true` iff the given type is an acceptable shape for a notification.
	 *
	 * @system
	 */
	export type IsNotificationListener<Event> = Event extends (...args: infer P) => void
		? CoreInternalUtilityTypes.IfSameType<
				P,
				JsonSerializable<P> & JsonDeserialized<P>,
				true,
				false
			>
		: false;

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
		[P in string & keyof E as IsNotificationListener<E[P]> extends true ? P : never]: E[P];
	};

	/**
	 * {@link @fluidframework/core-interfaces#JsonDeserialized} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonDeserializedParameters<T extends (...args: any) => any> = T extends (
		...args: infer P
	) => any
		? JsonDeserialized<P>
		: never;

	/**
	 * {@link @fluidframework/core-interfaces#JsonSerializable} version of the parameters of a function.
	 *
	 * @system
	 */
	export type JsonSerializableParameters<T extends (...args: any) => any> = T extends (
		...args: infer P
	) => any
		? JsonSerializable<P>
		: never;
}

/**
 * Cast a JsonDeserialized value to its branded version.
 *
 * @system
 */
export function toOpaqueJson<const T>(
	value: JsonSerializable<T> | JsonDeserialized<T>,
): JsonTypeToOpaqueJson<T> {
	return value as unknown as JsonTypeToOpaqueJson<T>;
}

/**
 * Cast a branded JsonDeserialized value back to its unbranded version.
 *
 * @system
 */
export function fromOpaqueJson<
	const TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
>(opaque: TOpaque): OpaqueJsonToJsonType<TOpaque> {
	return opaque as unknown as OpaqueJsonToJsonType<TOpaque>;
}

/**
 * Converts an opaque JSON value to a deeply readonly value.
 */
export function asDeeplyReadonlyFromJsonHandle<
	const TOpaque extends OpaqueJsonSerializable<unknown> | OpaqueJsonDeserialized<unknown>,
>(value: TOpaque): DeepReadonly<OpaqueJsonToJsonType<TOpaque>> {
	return asDeeplyReadonly(fromOpaqueJson(value));
}
