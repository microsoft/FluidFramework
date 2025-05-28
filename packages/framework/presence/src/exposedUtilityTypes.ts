/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BrandedType } from "@fluidframework/core-interfaces/internal";
import type {
	DeepReadonly,
	InternalUtilityTypes as CoreInternalUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { asDeeplyReadonly } from "./internalUtils.js";

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
	declare class JsonDeserializedBrand<T> extends BrandedType<T> {
		private readonly EncodedValue: T;
		private constructor();
	}

	/**
	 * @system
	 */
	// export type JsonDeserializedHandle<T> = Tagged<JsonDeserialized<T>, "JsonDeserialized">;
	// export type OpaqueJsonDeserialized<T> = UnverifiedBrand<T>;
	export type OpaqueJsonDeserialized<T> = JsonDeserializedBrand<T>;
	// export type OpaqueJsonDeserialized<T extends JsonDeserialized<U>, U> = JsonDeserializedBrand<T, U>;

	/**
	 * @system
	 */
	export declare class JsonSerializableBrand<T> extends BrandedType<T> {
		private readonly JsonSerializable: JsonSerializable<T>;
		private constructor();
	}

	/**
	 * @system
	 */
	// export type JsonDeserializedHandle<T> = Tagged<JsonDeserialized<T>, "JsonDeserialized">;
	export type OpaqueJsonSerializable<T> = JsonSerializableBrand<T>;
}

/**
 * Cast a JsonDeserialized value to its branded version.
 *
 * @system
 */
export function brandJson<T>(
	value: JsonDeserialized<T>,
): InternalUtilityTypes.OpaqueJsonDeserialized<T> {
	return value as InternalUtilityTypes.OpaqueJsonDeserialized<T>;
}

/**
 * Cast a branded JsonDeserialized value back to its unbranded version.
 *
 * @system
 */
export function unbrandJson<T>(
	value: InternalUtilityTypes.OpaqueJsonDeserialized<T>,
): JsonDeserialized<T> {
	return value as JsonDeserialized<T>;
}

/**
 * Converts a JsonDeserializedHandle to a deeply readonly JsonDeserialized value.
 */
export function asDeeplyReadonlyFromJsonHandle<T>(
	value: InternalUtilityTypes.OpaqueJsonDeserialized<T>,
): DeepReadonly<JsonDeserialized<T>> {
	return asDeeplyReadonly(unbrandJson(value));
}
