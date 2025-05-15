/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	InternalUtilityTypes as CoreInternalUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

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

	/**
	 * @system
	 */
	export declare class JsonDeserializedBrand<T> {
		private readonly JsonDeserialized: JsonDeserialized<T>;
	}

	/**
	 * @system
	 */
	// export type JsonDeserializedHandle<T> = Tagged<JsonDeserialized<T>, "JsonDeserialized">;
	export type JsonDeserializedHandle<T> = JsonDeserializedBrand<T>;

	/**
	 * @system
	 */
	export declare class JsonSerializableBrand<T> {
		private readonly JsonSerializable: JsonSerializable<T>;
	}

	/**
	 * @system
	 */
	// export type JsonDeserializedHandle<T> = Tagged<JsonDeserialized<T>, "JsonDeserialized">;
	export type JsonSerializableHandle<T> = JsonSerializableBrand<T>;
}

/**
 * Cast a JsonDeserialized value to its branded version.
 *
 * @system
 */
export function toJsonDeserializedHandle<T>(
	value: JsonDeserialized<T>,
): InternalUtilityTypes.JsonDeserializedHandle<T> {
	return value as InternalUtilityTypes.JsonDeserializedHandle<T>;
}

/**
 * Cast a branded JsonDeserialized value back to its unbranded version.
 *
 * @system
 */
export function fromJsonDeserializedHandle<T>(
	value: InternalUtilityTypes.JsonDeserializedHandle<T>,
): JsonDeserialized<T> {
	return value as JsonDeserialized<T>;
}
