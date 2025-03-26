/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class RunCounter {
	#runs = 0;

	public get running(): boolean {
		return this.#runs !== 0;
	}

	public get runs(): number {
		return this.#runs;
	}

	public run<T>(act: () => T): T {
		this.#runs++;
		try {
			return act();
		} finally {
			this.#runs--;
		}
	}
}
