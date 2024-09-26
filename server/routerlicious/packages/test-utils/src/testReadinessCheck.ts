/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Adding a duplicate of the IReadinessCheck interface from server-services-shared
 * to prevent a cyclic dependency between server-services-shared and test-utils
 */
export interface IReadinessCheck {
	isReady(): Promise<boolean>;
}

export class TestReadinessCheck implements IReadinessCheck {
	private ready = false;

	public setReady() {
		this.ready = true;
	}

	public async isReady(): Promise<boolean> {
		return Promise.resolve(this.ready);
	}
}
