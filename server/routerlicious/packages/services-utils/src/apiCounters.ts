/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export interface IApiCounters {
	initializeCounter(apiName: string): void;
	initializeCounters(apiNames: string[]): void;
	incrementCounter(apiName: string, incrementBy?: number): void;
	decrementCounter(apiName: string, decrementBy?: number): void;
	resetAllCounters(): void;
	getCounter(apiName: string): number | undefined;
	getCounters(): Record<string, number>;
	countersAreActive: boolean;
}

/**
 * @internal
 */
export class InMemoryApiCounters implements IApiCounters {
	private readonly apiCounters = new Map<string, number>();
	constructor(apiNames?: string[]) {
		if (apiNames && apiNames.length > 0) {
			this.initializeCounters(apiNames);
		}
	}

	public initializeCounter(apiName: string): void {
		this.apiCounters.set(apiName, 0);
	}

	public initializeCounters(apiNames: string[]): void {
		apiNames.forEach((apiName) => this.apiCounters.set(apiName, 0));
	}

	public incrementCounter(apiName: string, incrementBy = 1): void {
		if (incrementBy < 1) {
			return;
		}
		const currentValue = this.apiCounters.get(apiName) ?? 0;
		this.apiCounters.set(apiName, currentValue + incrementBy);
	}

	public decrementCounter(apiName: string, decrementBy = 1): void {
		if (decrementBy < 1) {
			return;
		}
		const currentValue = this.apiCounters.get(apiName) ?? 0;
		const tentativeUpdate = currentValue - decrementBy;
		// If the decrement would result in a negative number, reset it to 0.
		const updatedValue = tentativeUpdate > 0 ? tentativeUpdate : 0;
		this.apiCounters.set(apiName, updatedValue);
	}

	public resetAllCounters(): void {
		this.apiCounters.forEach((_: number, key) => this.apiCounters.set(key, 0));
	}

	public getCounter(apiName: string): number | undefined {
		return this.apiCounters.get(apiName);
	}

	public getCounters(): Record<string, number> {
		return Object.fromEntries(this.apiCounters);
	}

	get countersAreActive(): boolean {
		for (const v of this.apiCounters.values()) {
			if (v > 0) {
				return true;
			}
		}
		return false;
	}
}
