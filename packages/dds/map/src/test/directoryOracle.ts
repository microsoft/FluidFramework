/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	// Model updated via valueChanged events
	private readonly modelFromValueChanged = new Map<string, unknown>();

	// Model updated via containedValueChanged events
	private readonly modelFromContainedValueChanged = new Map<string, unknown>();

	public constructor(private readonly sharedDir: ISharedDirectory) {
		// valueChanged fires globally on the root for ALL changes anywhere in the tree
		// Only needs one listener on the root (includes 'path' field to indicate location)
		this.sharedDir.on("valueChanged", this.onValueChanged);
		this.sharedDir.on("clear", this.onClear);
		this.sharedDir.on("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.on("subDirectoryDeleted", this.onSubDirDeleted);

		// containedValueChanged fires locally on each directory for its own changes
		// Needs separate listeners on every subdirectory (no 'path' field, uses target.absolutePath)
		// disposed/undisposed events are also attached to subdirectories for rollback support
		this.attachToAllDirectories(sharedDir);
	}

	private attachToAllDirectories(dir: IDirectory): void {
		// Attach containedValueChanged listener to this directory
		dir.on("containedValueChanged", this.onContainedValueChanged);

		// Attach disposed/undisposed listeners for rollback support (only on subdirectories, not root)
		if (dir !== this.sharedDir) {
			dir.on("disposed", this.onDisposed);
			dir.on("undisposed", this.onUndisposed);
		}

		// Recurse into subdirectories
		for (const [, subDir] of dir.subdirectories()) {
			this.attachToAllDirectories(subDir);
		}
	}

	private readonly onValueChanged = (
		change: IDirectoryValueChanged,
		local: boolean,
		target: ISharedDirectory,
	): void => {
		assert(
			target === this.sharedDir,
			"valueChanged event should be emitted from root SharedDirectory",
		);

		const { key } = change;
		const path = change.path ?? "";

		const pathKey = path === "/" ? `/${key}` : `${path}/${key}`;

		const fuzzDir = this.sharedDir.getWorkingDirectory(path);
		if (!fuzzDir) return;

		if (fuzzDir.has(key)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const value = fuzzDir.get(key);
			this.modelFromValueChanged.set(pathKey, value);
		} else {
			this.modelFromValueChanged.delete(pathKey);
		}
	};

	private readonly onClear = (local: boolean): void => {
		for (const key of [...this.modelFromValueChanged.keys()]) {
			const parts = key.split("/").filter((p) => p.length > 0);
			if (parts.length === 1) {
				// Root-level key like "/key1"
				this.modelFromValueChanged.delete(key);
			}
		}
		for (const key of [...this.modelFromContainedValueChanged.keys()]) {
			const parts = key.split("/").filter((p) => p.length > 0);
			if (parts.length === 1) {
				this.modelFromContainedValueChanged.delete(key);
			}
		}
	};

	private readonly onSubDirCreated = (
		path: string,
		local: boolean,
		target: ISharedDirectory,
	): void => {
		assert(
			target === this.sharedDir,
			"subDirectoryCreated event should be emitted from root SharedDirectory",
		);

		// path is relative from root, e.g., "dir1" or "dir1/dir2"
		const subdirPath = path.startsWith("/") ? path : `/${path}`;
		if (!this.modelFromValueChanged.has(subdirPath)) {
			this.modelFromValueChanged.set(subdirPath, undefined);
		}
		if (!this.modelFromContainedValueChanged.has(subdirPath)) {
			this.modelFromContainedValueChanged.set(subdirPath, undefined);
		}

		// Attach to the newly created subdirectory and all its nested subdirectoriesto listen for containedValueChanged events
		const newSubDir = this.sharedDir.getWorkingDirectory(path);
		if (newSubDir) {
			this.attachToAllDirectories(newSubDir);
		}
	};

	private readonly onSubDirDeleted = (path: string): void => {
		const absPath = path.startsWith("/") ? path : `/${path}`;
		const prefix = `${absPath}/`;

		for (const key of [...this.modelFromValueChanged.keys()]) {
			// Delete the subdirectory itself and all keys under it
			// Use exact match for the directory, or prefix match with "/" separator
			if (key === absPath || key.startsWith(prefix)) {
				this.modelFromValueChanged.delete(key);
			}
		}
		for (const key of [...this.modelFromContainedValueChanged.keys()]) {
			if (key === absPath || key.startsWith(prefix)) {
				this.modelFromContainedValueChanged.delete(key);
			}
		}
	};

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	): void => {
		const { key } = change;
		const { absolutePath } = target;

		const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(key);

		if (newValue === undefined) {
			this.modelFromContainedValueChanged.delete(pathKey);
		} else {
			this.modelFromContainedValueChanged.set(pathKey, newValue);
		}
	};

	private readonly onDisposed = (target: IDirectory): void => {
		// When a subdirectory is disposed (during rollback), clear all keys under it from oracle
		const absPath = target.absolutePath;
		const prefix = `${absPath}/`;

		for (const key of [...this.modelFromValueChanged.keys()]) {
			if (key.startsWith(prefix)) {
				this.modelFromValueChanged.delete(key);
			}
		}
		for (const key of [...this.modelFromContainedValueChanged.keys()]) {
			if (key.startsWith(prefix)) {
				this.modelFromContainedValueChanged.delete(key);
			}
		}
	};

	private readonly onUndisposed = (target: IDirectory): void => {
		this.attachToAllDirectories(target);

		// Snapshot current values in this directory to re-sync oracle
		const { absolutePath } = target;
		for (const [key, value] of target.entries()) {
			const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;
			this.modelFromValueChanged.set(pathKey, value);
			this.modelFromContainedValueChanged.set(pathKey, value);
		}
	};

	public validate(): void {
		// Validate both models against the actual directory to ensure both event work correctly
		this.validateDirectory(this.sharedDir, "valueChanged", this.modelFromValueChanged);
		this.validateDirectory(
			this.sharedDir,
			"containedValueChanged",
			this.modelFromContainedValueChanged,
		);
	}

	private validateDirectory(
		dir: IDirectory,
		modelName: string,
		model: Map<string, unknown>,
	): void {
		const { absolutePath } = dir;

		// Check all keys in this directory
		for (const [key, value] of dir.entries()) {
			const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;

			// Only validate keys that the oracle is tracking
			// (keys loaded from snapshots may not fire events)
			if (model.has(pathKey)) {
				// Verify oracle has the correct value
				assert.deepStrictEqual(
					model.get(pathKey),
					value,
					`[${modelName}] Value mismatch for key "${pathKey}": oracle=${model.get(pathKey)}, actual=${value}`,
				);
			}
		}

		// Recursively validate subdirectories
		for (const [, subdir] of dir.subdirectories()) {
			this.validateDirectory(subdir, modelName, model);
		}
	}

	public dispose(): void {
		this.sharedDir.off("valueChanged", this.onValueChanged);
		this.sharedDir.off("clear", this.onClear);
		this.sharedDir.off("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.off("subDirectoryDeleted", this.onSubDirDeleted);
		this.modelFromValueChanged.clear();
		this.modelFromContainedValueChanged.clear();
	}
}
