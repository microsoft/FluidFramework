/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IndependentDatastore,
	RoundTrippable,
	StateManager,
} from "./independentDirectory/independentDataStore";

// Brand to ensure value managers are given without revealing their internal details
declare class IndependentValueManagerBrand<T> {
	private readonly IndependentValueManager: IndependentValueManager<T>;
}

export type IndependentValueManager<T> = T & IndependentValueManagerBrand<T>;

interface LatestValueManager<T> {
	readonly value: RoundTrippable<T>;
}

class LatestValueManagerImpl<T> implements LatestValueManager<T>, StateManager<T> {
	public constructor(public readonly value: RoundTrippable<T>) {}

	connectToDatastore(directory: IndependentDatastore<{ [path: string]: T }>): void {
		throw new Error("Method not implemented.");
	}

	get state(): RoundTrippable<T> {
		throw new Error("Method not implemented.");
	}

	update(clientId: string, rev: number, value: RoundTrippable<T>): void {
		throw new Error("Method not implemented.");
	}
}
