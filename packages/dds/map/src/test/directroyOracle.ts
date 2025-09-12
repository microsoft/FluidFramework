/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { strict as assert } from "node:assert";

import type { IDirectory, IDirectoryValueChanged, ISharedDirectory } from "../interfaces.js";

/**
 * Oracle for directory
 * @internal
 */
export class SharedDirectoryOracle {
	private readonly model = new Map<string, unknown>();

	public constructor(private readonly shared: ISharedDirectory) {
		this.shared.on("valueChanged", this.onValueChanged);
		this.shared.on("clear", this.onClear);
		this.shared.on("subDirectoryCreated", this.onSubDirCreated);
		this.shared.on("subDirectoryDeleted", this.onSubDirDeleted);
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged) => {
		const pathKey = `${change.path}/${change.key}`;
		const dir = this.shared.getWorkingDirectory(change.path);
		if (!dir) return;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = dir.get(change.key);

		if (newValue === undefined) {
			this.model.delete(pathKey);
		} else {
			this.model.set(pathKey, newValue);
		}
	};

	private readonly onClear = () => {
		this.model.clear();
	};

	private readonly onSubDirCreated = (path: string) => {
		// No need to recursively snapshot—subsequent events will populate keys
	};

	private readonly onSubDirDeleted = (path: string) => {
		for (const key of [...this.model.keys()]) {
			if (key.startsWith(`${path}/`)) {
				this.model.delete(key);
			}
		}
	};

	public validate(): void {
		// Compare oracle with current shared directory via events
		for (const [key, value] of this.model.entries()) {
			const parts = key.split("/");
			assert(parts.length === 0, "Invalid path, cannot extract key");
			const leafKey = parts.pop();
			let dir: IDirectory | undefined = this.shared;
			for (const part of parts) {
				dir = dir.getSubDirectory(part);
				if (!dir) break;
			}
			assert(leafKey !== undefined, "leaf key is undefined");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const actual = dir?.get(leafKey);
			assert.deepStrictEqual(actual, value, `SharedDirectoryOracle mismatch at path="${key}"`);
		}
	}

	public dispose(): void {
		this.shared.off("valueChanged", this.onValueChanged);
		this.shared.off("clear", this.onClear);
		this.shared.off("subDirectoryCreated", this.onSubDirCreated);
		this.shared.off("subDirectoryDeleted", this.onSubDirDeleted);
		this.model.clear();
	}
}
