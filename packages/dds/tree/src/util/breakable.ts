/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	private rethrowCaught(brokenBy: unknown): never {
		if (brokenBy instanceof Error) {
			this.break(brokenBy);
		}
		this.break(
			new Error(`Non-error throw breaking ${this.name}. Thrown value: "${brokenBy}"`),
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
>(target: Target, context: ClassMethodDecoratorContext<This, Target>): Target {
	function replacementMethod(this: This, ...args: Args): Return {
		return this.breaker.run(() => {
			return target.call(this, ...args);
		});
	}

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

	return replacementMethod as Target;
}
