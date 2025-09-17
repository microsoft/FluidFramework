/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { strict as assert } from "node:assert";

import type {
	IDirectory,
	IDirectoryValueChanged,
	ISharedDirectory,
	IValueChanged,
} from "../interfaces.js";

/**
 * Oracle for directory
 * @internal
 */
export class SharedDirectoryOracle {
	private readonly model = new Map<string, unknown>();

	public constructor(private readonly sharedDir: ISharedDirectory) {
		this.sharedDir.on("valueChanged", this.onValueChanged);
		this.sharedDir.on("clear", this.onClear);
		this.sharedDir.on("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.on("subDirectoryDeleted", this.onSubDirDeleted);
		this.sharedDir.on("containedValueChanged", this.onContainedValueChanged);

		this.captureInitialSnapshot(sharedDir);
	}

	private captureInitialSnapshot(dir: IDirectory): void {
		// Capture keys
		for (const [key, value] of dir.entries()) {
			this.model.set(`${dir.absolutePath}/${key}`, value);
		}

		for (const [, subDir] of dir.subdirectories()) {
			// Just recurse to capture keys inside the subdir
			this.captureInitialSnapshot(subDir);
		}
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged) => {
		const { key } = change;
		const path = change.path ?? "";
		const fuzzDir = this.sharedDir.getWorkingDirectory(path);
		if (!fuzzDir) return;

		if (fuzzDir.has(key)) {
			this.model.set(`${path}/${key}`, fuzzDir.get(key));
		} else {
			this.model.delete(`${path}/${key}`);
		}
	};

	private readonly onClear = (local: boolean) => {
		this.model.clear();
	};

	private readonly onSubDirCreated = (
		subdirName: string,
		local: boolean,
		target: ISharedDirectory,
	) => {
		if (!this.model.has(`${target.absolutePath}${subdirName}`)) {
			this.model.set(`${target.absolutePath}${subdirName}`, undefined);
		}
	};

	private readonly onSubDirDeleted = (path: string) => {
		const absPath = path.startsWith("/") ? path : `/${path}`;
		for (const key of [...this.model.keys()]) {
			if (key.startsWith(absPath)) {
				const deleted = this.model.delete(key);
				if (!deleted) {
					assert("not deleted");
				}
			}
		}
	};

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(change.key);

		if (newValue === undefined) {
			this.model.delete(`${target.absolutePath}${change.key}`);
		} else {
			this.model.set(`${target.absolutePath}${change.key}`, newValue);
		}
	};

	public validate(): void {
		for (const [pathKey, value] of this.model.entries()) {
			const parts = pathKey.split("/").filter((p) => p.length > 0);
			assert(parts.length > 0, "Invalid path, cannot extract key");

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const leafKey = parts.pop()!; // The actual key
			let dir: IDirectory | undefined = this.sharedDir;

			for (const part of parts) {
				dir = dir.getSubDirectory(part);
				if (!dir) break;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const actual = dir?.get(leafKey);
			assert.deepStrictEqual(
				actual,
				value,
				`SharedDirectoryOracle mismatch at path="${pathKey}" with actual value = ${actual} and oracle value = ${value}}`,
			);
		}
	}

	public dispose(): void {
		this.sharedDir.off("valueChanged", this.onValueChanged);
		this.sharedDir.off("clear", this.onClear);
		this.sharedDir.off("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.off("subDirectoryDeleted", this.onSubDirDeleted);
		this.sharedDir.off("containedValueChanged", this.onContainedValueChanged);
		this.model.clear();
	}
}
