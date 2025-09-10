/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SharedDirectory } from "../directoryFactory.js";
import type { IDirectory, IDirectoryValueChanged, ISharedDirectory } from "../interfaces.js";

/**
 * Oracle for directroy
 * @internal
 */
export class SharedDirectoryOracle {
	private readonly model = new Map<string, unknown>();

	public constructor(private readonly shared: SharedDirectory) {
		// Snapshot
		this.snapshotDirectory(shared, "");

		// Subscribe
		this.shared.on("valueChanged", this.onValueChanged);
		this.shared.on("subDirectoryCreated", this.onSubDirCreated);
		this.shared.on("subDirectoryDeleted", this.onSubDirDeleted);
	}

	private snapshotDirectory(dir: IDirectory, prefix: string): void {
		for (const [key, value] of dir.entries()) {
			this.model.set(`${prefix}${key}`, value);
		}
		for (const [subName, subDir] of dir.subdirectories()) {
			this.snapshotDirectory(subDir, `${prefix}${subName}/`);
		}
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged): void => {
		const pathKey = `${change.path}/${change.key}`;
		if (this.shared.has(pathKey)) {
			this.model.set(pathKey, this.shared.get(pathKey));
		} else {
			this.model.delete(pathKey);
		}
	};

	private readonly onSubDirCreated = (subDir: ISharedDirectory, path: string): void => {
		this.snapshotDirectory(subDir, `${path}/`);
	};

	private readonly onSubDirDeleted = (path: string): void => {
		for (const key of [...this.model.keys()]) {
			if (key.startsWith(`${path}/`)) {
				this.model.delete(key);
			}
		}
	};

	public validate(): void {
		// Rebuild snapshot
		const actualMap = new Map<string, unknown>();
		this.snapshotDirectory(this.shared, "");

		assert.strictEqual(
			actualMap.size,
			this.model.size,
			`SharedDirectoryOracle mismatch: expected size=${this.model.size}, actual=${actualMap.size}`,
		);

		for (const [key, expectedValue] of this.model.entries()) {
			const actualValue = actualMap.get(key);
			assert.deepStrictEqual(
				expectedValue,
				actualValue,
				`SharedDirectoryOracle mismatch at path="${key}"`,
			);
		}
	}

	public dispose(): void {
		this.shared.off("valueChanged", this.onValueChanged);
		this.shared.off("subDirectoryCreated", this.onSubDirCreated);
		this.shared.off("subDirectoryDeleted", this.onSubDirDeleted);
	}
}
