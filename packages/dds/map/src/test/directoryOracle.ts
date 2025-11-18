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
		// Capture initial state BEFORE attaching event listeners
		// to avoid double-counting any events that might fire during initialization
		this.captureInitialSnapshot(sharedDir);

		// Now attach event listeners for future changes
		this.sharedDir.on("valueChanged", this.onValueChanged);
		this.sharedDir.on("clear", this.onClear);
		this.sharedDir.on("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.on("subDirectoryDeleted", this.onSubDirDeleted);
		this.sharedDir.on("containedValueChanged", this.onContainedValueChanged);
	}

	private captureInitialSnapshot(dir: IDirectory): void {
		const { absolutePath } = dir;

		// Capture keys
		for (const [key, value] of dir.entries()) {
			const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;
			this.model.set(pathKey, value);
		}

		// Recurse into subdirectories to capture their keys
		for (const [, subDir] of dir.subdirectories()) {
			this.captureInitialSnapshot(subDir);
		}
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged) => {
		const { key } = change;
		const path = change.path ?? "";

		const pathKey = path === "/" ? `/${key}` : `${path}/${key}`;

		const fuzzDir = this.sharedDir.getWorkingDirectory(path);
		if (!fuzzDir) return;

		if (fuzzDir.has(key)) {
			this.model.set(pathKey, fuzzDir.get(key));
		} else {
			this.model.delete(pathKey);
		}
	};

	private readonly onClear = (local: boolean) => {
		// Clear only root-level keys, not subdirectories or their contents
		for (const key of [...this.model.keys()]) {
			const parts = key.split("/").filter((p) => p.length > 0);
			if (parts.length === 1) {
				// Root-level key like "/key1"
				this.model.delete(key);
			}
		}
	};

	private readonly onSubDirCreated = (
		path: string,
		local: boolean,
		target: ISharedDirectory,
	) => {
		// path is relative from root, e.g., "dir1" or "dir1/dir2"
		const subdirPath = path.startsWith("/") ? path : `/${path}`;
		if (!this.model.has(subdirPath)) {
			this.model.set(subdirPath, undefined);
		}
	};

	private readonly onSubDirDeleted = (path: string) => {
		const absPath = path.startsWith("/") ? path : `/${path}`;
		const prefix = `${absPath}/`;

		for (const key of [...this.model.keys()]) {
			// Delete all keys under the deleted subdirectory
			if (key.startsWith(prefix)) {
				this.model.delete(key);
			}
		}
	};

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	) => {
		const { key } = change;
		const { absolutePath } = target;

		const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(key);

		if (newValue === undefined) {
			this.model.delete(pathKey);
		} else {
			this.model.set(pathKey, newValue);
		}
	};

	public validate(): void {
		this.validateDirectory(this.sharedDir);
	}

	private validateDirectory(dir: IDirectory): void {
		const { absolutePath } = dir;

		// Check all keys in this directory
		for (const [key, value] of dir.entries()) {
			const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;

			// Only validate keys that the oracle is tracking
			// (keys loaded from snapshots may not fire events)
			if (this.model.has(pathKey)) {
				// Verify oracle has the correct value
				assert.deepStrictEqual(
					this.model.get(pathKey),
					value,
					`Value mismatch for key "${pathKey}": oracle=${this.model.get(pathKey)}, actual=${value}`,
				);
			}
		}

		// Recursively validate subdirectories
		for (const [, subdir] of dir.subdirectories()) {
			this.validateDirectory(subdir);
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
