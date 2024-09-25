/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IReadinessCheck } from "./healthCheckEndpoints";

export class TestReadinessCheck implements IReadinessCheck {
	private ready = false;

	public setReady() {
		this.ready = true;
	}

	public async isReady(): Promise<boolean> {
		return Promise.resolve(this.ready);
	}
}
