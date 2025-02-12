/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * An object which can enter a "broken" state where trying to use it is a UsageError.
 */
export class Breakable {
	private brokenBy?: Error;

	public constructor(private readonly name: string) {}

	/**
	 * Throws if the object is in the broken state.
	 * @remarks
	 * Can use {@link throwIfBroken} to apply this to a method.
	 */
	public use(): void {
		if (this.brokenBy !== undefined) {
			throw new UsageError(
				`Invalid use of ${this.name} after it was put into an invalid state by another error.\nOriginal Error:\n${this.brokenBy}`,
			);
		}
	}

	/**
	 * Puts this object into the broken state, and throws an error.
	 *
	 * @throws If already broken by a different error, throws a UsageError, otherwise throws `brokenBy`.
	 */
	public break(brokenBy: Error): never {
		// If already broken by this error, let it bubble up without rethrowing a modified version.
		// This prevents internal errors like asserts getting rethrown as different errors when wrapped with multiple call to `{@link Breakable.run}` or `{@link breakingMethod}`.
		if (this.brokenBy !== brokenBy) {
			this.use();
			this.brokenBy = brokenBy;
		}
		throw brokenBy;
	}

	/**
	 * {@link Breakable.break}, except tolerates `unknown` to be more easily used by catch blocks.
	 * @privateRemarks
	 * If there is a use-case, this should be made public.
	 */
	public rethrowCaught(brokenBy: unknown): never {
		if (brokenBy instanceof Error) {
			this.break(brokenBy);
		}
		this.break(
			new Error(`Non-error thrown breaking ${this.name}. Thrown value: "${brokenBy}"`),
		);
	}

	/**
	 * Runs code which should break the object if it throws.
	 * @remarks
	 * This also throws if already broken like {@link Breakable.use}.
	 * Any exceptions this catches are re-thrown.
	 * Can use {@link breakingMethod} to apply this to a method.
	 */
	public run<TResult>(breaker: () => TResult): TResult {
		this.use();
		try {
			return breaker();
		} catch (error: unknown) {
			this.rethrowCaught(error);
		}
	}

	/**
	 * Clears the existing broken state.
	 * @remarks
	 * This is rarely safe to to: it is only ok when all objects using this breaker are known to not have been left in an invalid state.
	 * This is pretty much only safe in tests which just were checking a specific error was thrown, and which know that error closepath is actually exception safe.
	 */
	public clearError(): void {
		assert(this.brokenBy !== undefined, 0x9b6 /* No error to clear */);
		this.brokenBy = undefined;
	}
}

/**
 * Marks an object as being able to be in a broken state (unknown/unspecified/broken state due to unhandled exception).
 * @remarks
 * See decorators {@link breakingMethod} and {@link throwIfBroken} for ease of use.
 */
export interface WithBreakable {
	readonly breaker: Breakable;
}

/**
 * Decorator for methods which should break the object when they throw.
 * @remarks
 * This also throws if already broken like {@link throwIfBroken}.
 * See {@link Breakable.run} for details.
 *
 * This should be used on methods which modify data that could result in an unsupported/broken state if an exception is thrown while modifying.
 * It is ok for breakingMethods to call each-other.
 * @privateRemarks
 * Explicitly capturing the full `Target` type is necessary to make this work with generic methods with unknown numbers of type parameters.
 */
export function breakingMethod<
	Target extends ((...args: any[]) => unknown) & ((this: This, ...args: Args) => Return),
	This extends WithBreakable,
	Args extends never[],
	Return,
>(target: Target, context?: ClassMethodDecoratorContext<This, Target>): Target {
	function replacementMethod(this: This, ...args: Args): Return {
		if (this.breaker === undefined) {
			// This case is necessary for when wrapping methods which are invoked inside the constructor of the base class before `breaker` is set.
			// Since the constructor throwing does not return an object, failing to put it into a broken state is not too bad.
			// However when more than just the constructed object should be broken, this can result in missing a break.
			return target.call(this, ...args);
		}
		return this.breaker.run(() => {
			return target.call(this, ...args);
		});
	}
	markBreaker(replacementMethod);
	nameFunctionFrom(replacementMethod, target);
	return replacementMethod as Target;
}

/**
 * Decorator for methods which should throw if the object is in a broken state.
 * @remarks
 * This should be used on methods which read data that could be invalid when the object is broken.
 * @privateRemarks
 * Explicitly capturing the full `Target` type is necessary to make this work with generic methods with unknown numbers of type parameters.
 */
export function throwIfBroken<
	Target extends ((...args: any[]) => unknown) & ((this: This, ...args: Args) => Return),
	This extends WithBreakable,
	Args extends never[],
	Return,
>(target: Target, context: ClassMethodDecoratorContext<This, Target>): Target {
	function replacementMethod(this: This, ...args: Args): Return {
		this.breaker.use();
		return target.call(this, ...args);
	}
	markBreaker(replacementMethod);
	nameFunctionFrom(replacementMethod, target);
	return replacementMethod as Target;
}

// eslint-disable-next-line @typescript-eslint/ban-types
type PossiblyNamedFunction = Function & { displayName?: undefined | string };

// eslint-disable-next-line @typescript-eslint/ban-types
function nameFunctionFrom(toName: Function, nameFrom: Function): void {
	(toName as PossiblyNamedFunction).displayName =
		(nameFrom as PossiblyNamedFunction).displayName ?? nameFrom.name;
}

const isBreakerSymbol: unique symbol = Symbol("isBreaker");

// Accepting any function like value is desired and safe here as this does not call the provided function.
// eslint-disable-next-line @typescript-eslint/ban-types
function markBreaker(f: Function): void {
	(f as unknown as Record<typeof isBreakerSymbol, true>)[isBreakerSymbol] = true;
}

// Accepting any function like value is desired and safe here as this does not call the provided function.
// eslint-disable-next-line @typescript-eslint/ban-types
function isBreaker(f: Function): boolean {
	return isBreakerSymbol in (f as unknown as Record<typeof isBreakerSymbol, true>);
}

/**
 * Decorator for classes which should break when their methods throw.
 * @remarks
 * Applies {@link breakingMethod} to all methods declared directly by class or its base classes.
 * Does not include those on derived classes.
 * Does not include getters or setters, or value properties.
 * Methods already marked as {@link breakingMethod} or {@link throwIfBroken} are unaffected.
 */
export function breakingClass<Target extends abstract new (...args: any[]) => WithBreakable>(
	target: Target,
	context: ClassDecoratorContext<Target>,
): Target {
	abstract class DecoratedBreakable extends target {}

	// Keep track of what keys we have seen,
	// since we visit most derived properties first and need to avoid wrapping base properties overriding more derived ones.
	const overriddenKeys: Set<string | symbol> = new Set();

	let prototype: object | null = target.prototype;
	while (prototype !== null) {
		for (const key of Reflect.ownKeys(prototype)) {
			if (!overriddenKeys.has(key)) {
				overriddenKeys.add(key);
				const descriptor = Reflect.getOwnPropertyDescriptor(prototype, key);
				if (descriptor !== undefined) {
					// Method
					if (typeof descriptor.value === "function") {
						if (!isBreaker(descriptor.value)) {
							// This does not affect the original class, see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor
							descriptor.value = breakingMethod(descriptor.value);
							Object.defineProperty(DecoratedBreakable.prototype, key, descriptor);
						}
					}
				}
			}
		}
		prototype = Reflect.getPrototypeOf(prototype);
	}

	return DecoratedBreakable;
}
