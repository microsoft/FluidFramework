/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base branded type which can be used to annotate other type.
 *
 * @remarks
 * To use derive another class declaration and ideally add additional private
 * properties to further distinguish the type.
 *
 * Since branded types are not real value types, they will always need to be
 * created using `as` syntax and very often `as unknown` first.
 *
 * This class should never exist at runtime, so it is only declared.
 *
 * @sealed
 * @internal
 */
export declare class BrandedType<out Brand> {
	/**
	 * Compile time only marker to make type checking more strict.
	 * This method will not exist at runtime and accessing it is invalid.
	 *
	 * @privateRemarks
	 * `Brand` is used as the return type of a method rather than a simple
	 * readonly property as this allows types with two brands to be
	 * intersected without getting `never`.
	 * The method takes in `never` to help emphasize that it's not callable.
	 */
	protected readonly brand: (dummy: never) => Brand;

	protected constructor();

	/**
	 * Since this class is a compile time only type brand, `instanceof` will
	 * never work with it. * This `Symbol.hasInstance` implementation ensures
	 * that `instanceof` will error if used, and in TypeScript 5.3 and newer
	 * will produce a compile time error if used.
	 */
	public static [Symbol.hasInstance](value: never): value is never;
}
