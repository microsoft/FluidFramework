/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IReadinessCheck, IReadinessStatus, ICheck } from "@fluidframework/server-services-core";

export class TestCheck implements ICheck {
	private throwException = false;
	private isReady = false;

	public setThrowException() {
		this.throwException = true;
	}

	public setReady() {
		this.isReady = true;
	}

	public async doCheck(): Promise<void> {
		if (this.throwException || !this.isReady) {
			throw new Error("Test exception");
		}
	}
}

export class TestReadinessCheck implements IReadinessCheck {
	private readonly checks: ICheck[];

	constructor(checks: ICheck[]) {
		this.checks = checks;
	}

	public async isReady(): Promise<IReadinessStatus> {
		const checkTasks: Promise<void>[] = [];
		this.checks.forEach((check) => {
			checkTasks.push(check.doCheck());
		});
		await Promise.all(checkTasks);
		const readinessStatus: IReadinessStatus = { ready: true };
		return readinessStatus;
	}
}
