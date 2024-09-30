/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Adding a duplicate of the IReadinessCheck interface from server-services-shared
 * to prevent a cyclic dependency between server-services-shared and test-utils
 */
export interface IReadinessStatus {
	ready: boolean;
	exception?: any;
}

export interface IReadinessCheck {
	isReady(): Promise<IReadinessStatus>;
}

export class TestReadinessCheck implements IReadinessCheck {
	private ready = false;
	private throwException = false;

	public setReady() {
		this.ready = true;
	}

	public setThrowException() {
		this.throwException = true;
	}

	public async isReady(): Promise<IReadinessStatus> {
		let readinessStatus: IReadinessStatus;
		if (this.throwException) {
			readinessStatus = { ready: false, exception: new Error("Test exception") };
			return Promise.reject(readinessStatus);
		}
		readinessStatus = { ready: this.ready };
		return Promise.resolve(readinessStatus);
	}
}
