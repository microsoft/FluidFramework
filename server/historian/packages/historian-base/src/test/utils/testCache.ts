/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ActivateSummaryAccessResult,
	ICache,
	IEphemeralSummaryAccessRecord,
	IEphemeralSummaryAccessStore,
} from "../../services";

export class TestCache implements ICache, IEphemeralSummaryAccessStore {
	private readonly dictionary = new Map<string, any>();
	private readonly summaryAccess = new Map<string, IEphemeralSummaryAccessRecord>();

	async get<T>(key: string): Promise<T> {
		return Promise.resolve(this.dictionary.get(key));
	}
	async set<T>(key: string, value: T): Promise<void> {
		this.dictionary.set(key, value);
		return Promise.resolve();
	}
	async delete(key: string): Promise<boolean> {
		return Promise.resolve(this.dictionary.delete(key));
	}

	async readSummaryAccess(
		tenantId: string,
		documentId: string,
	): Promise<IEphemeralSummaryAccessRecord | undefined> {
		return this.summaryAccess.get(this.getSummaryAccessKey(tenantId, documentId));
	}

	async activateSummaryAccessIfNotDeleted(
		tenantId: string,
		documentId: string,
		createTime: number,
		_expiresAt: number,
	): Promise<ActivateSummaryAccessResult> {
		const key = this.getSummaryAccessKey(tenantId, documentId);
		if (this.summaryAccess.get(key)?.state === "deleted") {
			return "deleted";
		}
		if (this.summaryAccess.has(key)) {
			return "alreadyActive";
		}
		this.summaryAccess.set(key, { version: 1, state: "active", createTime });
		return "created";
	}

	async markSummaryAccessDeleted(
		tenantId: string,
		documentId: string,
		createTime: number,
		_expiresAt: number,
	): Promise<void> {
		this.summaryAccess.set(this.getSummaryAccessKey(tenantId, documentId), {
			version: 1,
			state: "deleted",
			createTime,
		});
	}

	private getSummaryAccessKey(tenantId: string, documentId: string): string {
		return `${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`;
	}
}
