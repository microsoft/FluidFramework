/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class RunCounter {
	#runs = 0;
	#annotations: Record<string, unknown> = {};

	public get running(): boolean {
		return this.#runs !== 0;
	}

	public get runs(): number {
		return this.#runs;
	}

	public getAnnotations<T extends object>(): Partial<T> {
		return this.#annotations as Partial<T>;
	}

	public run<T>(act: () => T, annotations: Record<string, unknown> = {}): T {
		this.#runs++;
		const previousAnnotations = this.#annotations;
		this.#annotations = { ...this.#annotations, ...annotations };

		try {
			return act();
		} finally {
			this.#runs--;
			this.#annotations = previousAnnotations;
		}
	}
}
