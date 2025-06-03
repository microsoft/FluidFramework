/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BrandedType } from "./brandedType.js";

/**
 * Placeholder for value that is known to be JSON because it has been
 * deserialized (`T` filtered through {@link JsonDeserialized} as out value).
 *
 * @remarks
 * Usage:
 *
 * - Cast to with `as unknown as OpaqueJsonDeserialized<T>` when value `T`
 * has been filtered through {@link JsonDeserialized}.
 *
 * - Cast from with `as unknown as JsonDeserialized<T>` when "instance" will
 * be read.
 *
 * @sealed
 * @beta
 */
export declare class OpaqueJsonDeserialized<
	T,
	// These options are split from typical `JsonDeserializedOptions` as this type
	// requires correct variance per the two options and AllowExactly has special
	// variance and must be treated as invariant. In actuality, each member of the
	// AllowExactly tuple is invariant, but tuple as a set is covariant. This is not
	// expressible in TypeScript.
	in out Option_AllowExactly extends unknown[] = [],
	out Option_AllowExtensionOf = never,
> extends BrandedType<"JsonDeserialized"> {
	protected readonly JsonDeserialized: {
		Type: T;
		Options: {
			AllowExactly: Option_AllowExactly;
			AllowExtensionOf: Option_AllowExtensionOf;
		};
	};
	// Option_AllowExactly is covariant from above. This removes covariance, leaving only invariance.
	protected readonly Option_AllowExactly_Invariance: (
		Option_AllowExactly: Option_AllowExactly,
	) => void;
	private constructor();
}

/**
 * Placeholder for value that is known to be JSON because it will have been
 * serialized checked (`T` filtered through {@link JsonSerializable} before "created").
 *
 * @remarks
 * Usage:
 *
 * - Cast to with `as unknown as OpaqueJsonSerializable<T>` when value `T`
 * has been filtered through {@link JsonSerializable}.
 *
 * - Cast from with `as unknown as JsonSerializable<T>` or `as unknown as T`
 * when "instance" will be forwarded along.
 *
 * @sealed
 * @beta
 */
export declare class OpaqueJsonSerializable<
	T,
	// These options are split from typical `JsonSerializableOptions` as this type
	// requires correct variance per the two options and AllowExactly has special
	// variance and must be treated as invariant. In actuality, each member of the
	// AllowExactly tuple is invariant, but tuple as a set is covariant. This is not
	// expressible in TypeScript.
	in out Option_AllowExactly extends unknown[] = [],
	out Option_AllowExtensionOf = never,
	// JsonSerializableOptions.IgnoreInaccessibleMembers is ignored
> extends BrandedType<"JsonSerializable"> {
	protected readonly JsonSerializable: {
		Type: T;
		Options: {
			AllowExactly: Option_AllowExactly;
			AllowExtensionOf: Option_AllowExtensionOf;
		};
	};
	// Option_AllowExactly is covariant from above. This removes covariance, leaving only invariance.
	protected readonly Option_AllowExactly_Invariance: (
		Option_AllowExactly: Option_AllowExactly,
	) => void;
	private constructor();
}
