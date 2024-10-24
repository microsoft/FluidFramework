/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A deferred creates a promise and the ability to resolve or reject it
 * @legacy
 * @alpha
 */
export class Deferred<T> {
	private readonly p: Promise<T>;
	private res: ((value: T | PromiseLike<T>) => void) | undefined;
	private rej: ((reason?: unknown) => void) | undefined;
	private completed: boolean = false;

	public constructor() {
		this.p = new Promise<T>((resolve, reject) => {
			this.res = resolve;
			this.rej = reject;
		});
	}
	/**
	 * Returns whether the underlying promise has been completed
	 */
	public get isCompleted(): boolean {
		return this.completed;
	}

	/**
	 * Retrieves the underlying promise for the deferred
	 *
	 * @returns the underlying promise
	 */
	public get promise(): Promise<T> {
		return this.p;
	}

	/**
	 * Resolves the promise
	 *
	 * @param value - the value to resolve the promise with
	 */
	public resolve(value: T | PromiseLike<T>): void {
		if (this.res !== undefined) {
			this.completed = true;
			this.res(value);
		}
	}

	/**
	 * Rejects the promise
	 *
	 * @param value - the value to reject the promise with
	 */
	// TODO: Use `unknown` instead (API breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
	public reject(error: any): void {
		if (this.rej !== undefined) {
			this.completed = true;
			this.rej(error);
		}
	}
}
