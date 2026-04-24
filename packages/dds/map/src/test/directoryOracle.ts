/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDirectory,
	IDirectorySortKeyChanged,
	IDirectorySubDirectorySortKeyChanged,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISortKeyChanged,
	ISubDirectorySortKeyChanged,
	IValueChanged,
} from "../interfaces.js";

/**
 * Represents a directory node in the oracle's model
 * @internal
 */
interface DirectoryNode {
	/**
	 * Keys directly contained in this directory
	 */
	keys: Map<string, unknown>;
	/**
	 * Subdirectories of this directory
	 */
	subdirectories: Map<string, DirectoryNode>;
	/**
	 * Sort keys for keys directly contained in this directory.
	 * Only populated for entries with a sort key set; absence = unkeyed.
	 */
	sortKeys: Map<string, string>;
	/**
	 * Sort keys for child subdirectories of this directory.
	 */
	subdirectorySortKeys: Map<string, string>;
}

/**
 * Oracle for validating ISharedDirectory event correctness and API contracts.
 * @internal
 */
export class SharedDirectoryOracle {
	// Model updated via valueChanged events (nested structure)
	private readonly modelFromValueChanged: DirectoryNode = {
		keys: new Map(),
		subdirectories: new Map(),
		sortKeys: new Map(),
		subdirectorySortKeys: new Map(),
	};

	// Model updated via containedValueChanged events (nested structure)
	private readonly modelFromContainedValueChanged: DirectoryNode = {
		keys: new Map(),
		subdirectories: new Map(),
		sortKeys: new Map(),
		subdirectorySortKeys: new Map(),
	};

	// Track all directories we've attached listeners to for proper cleanup
	private readonly attachedDirectories = new Set<IDirectory>();

	public constructor(private readonly sharedDir: ISharedDirectory) {
		this.snapshotCurrentState(this.sharedDir, this.modelFromValueChanged);
		this.snapshotCurrentState(this.sharedDir, this.modelFromContainedValueChanged);

		// valueChanged fires globally on the root for ALL changes anywhere in the tree
		// Only needs one listener on the root (includes 'path' field to indicate location)
		this.sharedDir.on("valueChanged", this.onValueChanged);
		this.sharedDir.on("cleared", this.onCleared);
		this.sharedDir.on("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.on("subDirectoryDeleted", this.onSubDirDeleted);
		this.sharedDir.on("sortKeyChanged", this.onSortKeyChanged);
		this.sharedDir.on("subDirectorySortKeyChanged", this.onSubDirectorySortKeyChanged);

		this.attachToAllDirectories(sharedDir);
	}

	/**
	 * Create directory node at path, creating parent directories as needed.
	 */
	private createDirNode(model: DirectoryNode, path: string): DirectoryNode {
		if (path === "/" || path === "") {
			return model;
		}

		const parts = path.split("/").filter((p) => p.length > 0);
		let current = model;

		for (const part of parts) {
			if (!current.subdirectories.has(part)) {
				current.subdirectories.set(part, {
					keys: new Map(),
					subdirectories: new Map(),
					sortKeys: new Map(),
					subdirectorySortKeys: new Map(),
				});
			}
			const next = current.subdirectories.get(part);
			assert(next !== undefined, "Subdirectory should exist after being created");
			current = next;
		}

		return current;
	}

	/**
	 * Get directory node at path, or undefined if it doesn't exist.
	 */
	private getDirNode(model: DirectoryNode, path: string): DirectoryNode | undefined {
		if (path === "/" || path === "") {
			return model;
		}

		const parts = path.split("/").filter((p) => p.length > 0);
		let current: DirectoryNode | undefined = model;

		for (const part of parts) {
			current = current.subdirectories.get(part);
			if (!current) {
				return undefined;
			}
		}

		return current;
	}

	/**
	 * Delete subdirectory and all its contents recursively.
	 */
	private deleteSubDirectory(model: DirectoryNode, path: string): void {
		if (path === "/" || path === "") {
			return;
		}

		const parts = path.split("/").filter((p) => p.length > 0);
		if (parts.length === 0) {
			return;
		}

		const parentPath = parts.slice(0, -1).join("/");
		const dirName = parts[parts.length - 1];
		const parentNode = this.getDirNode(model, parentPath);

		if (parentNode) {
			parentNode.subdirectories.delete(dirName);
		}
	}

	private attachToAllDirectories(dir: IDirectory): void {
		if (this.attachedDirectories.has(dir)) {
			return;
		}

		this.attachedDirectories.add(dir);
		dir.on("containedValueChanged", this.onContainedValueChanged);
		dir.on("containedSortKeyChanged", this.onContainedSortKeyChanged);
		dir.on("containedSubDirectorySortKeyChanged", this.onContainedSubDirectorySortKeyChanged);
		dir.on("disposed", this.onDisposed);
		dir.on("undisposed", this.onUndisposed);

		for (const [, subdir] of dir.subdirectories()) {
			this.attachToAllDirectories(subdir);
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

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;
		const path = change.path ?? "/";

		const fuzzDir = this.sharedDir.getWorkingDirectory(path);
		assert(fuzzDir !== undefined, `Directory at path "${path}" should exist in sharedDir`);

		const absPath = path.startsWith("/") ? path : `/${path}`;
		const dirNode = this.createDirNode(this.modelFromValueChanged, absPath);

		// Validate previousValue matches oracle, except:
		// - Post-clear events: previousValue from before clear, oracle already cleared
		// - Remote ops
		const oracleValue = dirNode.keys.get(key);
		const isPostClearEvent = previousValue !== undefined && oracleValue === undefined;
		if (local && !isPostClearEvent) {
			assert.deepStrictEqual(
				previousValue,
				oracleValue,
				`[valueChanged] previousValue mismatch for key "${key}" in directory "${path}": event.previousValue=${previousValue}, oracle=${oracleValue}, local=${local}`,
			);
		}

		if (fuzzDir.has(key)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const value = fuzzDir.get(key);
			dirNode.keys.set(key, value);
		} else {
			dirNode.keys.delete(key);
			// Deleting a key implicitly clears its sort key (no sortKeyChanged fires).
			dirNode.sortKeys.delete(key);
		}
	};

	private readonly onCleared = (path: string, local: boolean): void => {
		// Clear keys; valueChanged events follow for keys with pending local operations
		const absPath = path.startsWith("/") ? path : `/${path}`;
		const dirNode1 = this.getDirNode(this.modelFromValueChanged, absPath);
		const dirNode2 = this.getDirNode(this.modelFromContainedValueChanged, absPath);

		if (dirNode1) {
			dirNode1.keys.clear();
			dirNode1.sortKeys.clear();
		}
		if (dirNode2) {
			dirNode2.keys.clear();
			dirNode2.sortKeys.clear();
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

		const newSubDir = this.sharedDir.getWorkingDirectory(path);
		assert(newSubDir !== undefined, `Directory at path "${path}" should exist in sharedDir`);

		const subdirPath = path.startsWith("/") ? path : `/${path}`;
		this.createDirNode(this.modelFromValueChanged, subdirPath);
		this.createDirNode(this.modelFromContainedValueChanged, subdirPath);
		this.attachToAllDirectories(newSubDir);
	};

	private readonly onSubDirDeleted = (path: string): void => {
		const absPath = path.startsWith("/") ? path : `/${path}`;
		this.clearSubDirectorySortKeyOnParent(this.modelFromValueChanged, absPath);
		this.clearSubDirectorySortKeyOnParent(this.modelFromContainedValueChanged, absPath);
		this.deleteSubDirectory(this.modelFromValueChanged, absPath);
		this.deleteSubDirectory(this.modelFromContainedValueChanged, absPath);
	};

	/**
	 * When a subdirectory is deleted, its sort-key entry on the parent is implicitly
	 * cleared (no subDirectorySortKeyChanged event fires).
	 */
	private clearSubDirectorySortKeyOnParent(model: DirectoryNode, path: string): void {
		if (path === "/" || path === "") {
			return;
		}
		const parts = path.split("/").filter((p) => p.length > 0);
		if (parts.length === 0) {
			return;
		}
		const parentPath = parts.slice(0, -1).join("/");
		const dirName = parts[parts.length - 1];
		const parentNode = this.getDirNode(model, parentPath);
		parentNode?.subdirectorySortKeys.delete(dirName);
	}

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;
		const { absolutePath } = target;

		const dirNode = this.createDirNode(this.modelFromContainedValueChanged, absolutePath);

		// Validate previousValue matches oracle for local ops only
		const oracleValue = dirNode.keys.get(key);
		const isPostClearEvent = previousValue !== undefined && oracleValue === undefined;
		if (local && !isPostClearEvent) {
			assert.deepStrictEqual(
				previousValue,
				oracleValue,
				`[containedValueChanged] previousValue mismatch for key "${key}" in directory "${absolutePath}": event.previousValue=${previousValue}, oracle=${oracleValue}, local=${local}`,
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(key);

		if (newValue === undefined) {
			dirNode.keys.delete(key);
			dirNode.sortKeys.delete(key);
		} else {
			dirNode.keys.set(key, newValue);
		}
	};

	private readonly onSortKeyChanged = (
		change: IDirectorySortKeyChanged,
		local: boolean,
		target: ISharedDirectory,
	): void => {
		assert(
			target === this.sharedDir,
			"sortKeyChanged event should be emitted from root SharedDirectory",
		);

		const { key, sortKey } = change;
		const path = change.path ?? "/";
		const absPath = path.startsWith("/") ? path : `/${path}`;

		this.applySortKeyChange(this.modelFromValueChanged, absPath, key, sortKey);
	};

	private readonly onSubDirectorySortKeyChanged = (
		change: IDirectorySubDirectorySortKeyChanged,
		local: boolean,
		target: ISharedDirectory,
	): void => {
		assert(
			target === this.sharedDir,
			"subDirectorySortKeyChanged event should be emitted from root SharedDirectory",
		);

		const { subdirName, sortKey } = change;
		const path = change.path ?? "/";
		const absPath = path.startsWith("/") ? path : `/${path}`;

		this.applySubDirectorySortKeyChange(
			this.modelFromValueChanged,
			absPath,
			subdirName,
			sortKey,
		);
	};

	private readonly onContainedSortKeyChanged = (
		change: ISortKeyChanged,
		local: boolean,
		target: IDirectory,
	): void => {
		const { key, sortKey } = change;
		this.applySortKeyChange(
			this.modelFromContainedValueChanged,
			target.absolutePath,
			key,
			sortKey,
		);
	};

	private readonly onContainedSubDirectorySortKeyChanged = (
		change: ISubDirectorySortKeyChanged,
		local: boolean,
		target: IDirectory,
	): void => {
		const { subdirName, sortKey } = change;
		this.applySubDirectorySortKeyChange(
			this.modelFromContainedValueChanged,
			target.absolutePath,
			subdirName,
			sortKey,
		);
	};

	private applySortKeyChange(
		model: DirectoryNode,
		absPath: string,
		key: string,
		sortKey: string | undefined,
	): void {
		const dirNode = this.createDirNode(model, absPath);
		if (sortKey === undefined) {
			dirNode.sortKeys.delete(key);
		} else {
			dirNode.sortKeys.set(key, sortKey);
		}
	}

	private applySubDirectorySortKeyChange(
		model: DirectoryNode,
		absPath: string,
		subdirName: string,
		sortKey: string | undefined,
	): void {
		const dirNode = this.createDirNode(model, absPath);
		if (sortKey === undefined) {
			dirNode.subdirectorySortKeys.delete(subdirName);
		} else {
			dirNode.subdirectorySortKeys.set(subdirName, sortKey);
		}
	}

	private readonly onDisposed = (target: IDirectory): void => {
		const absPath = target.absolutePath;

		if (absPath === "/") {
			this.modelFromValueChanged.keys.clear();
			this.modelFromValueChanged.subdirectories.clear();
			this.modelFromValueChanged.sortKeys.clear();
			this.modelFromValueChanged.subdirectorySortKeys.clear();
			this.modelFromContainedValueChanged.keys.clear();
			this.modelFromContainedValueChanged.subdirectories.clear();
			this.modelFromContainedValueChanged.sortKeys.clear();
			this.modelFromContainedValueChanged.subdirectorySortKeys.clear();
		} else {
			this.clearSubDirectorySortKeyOnParent(this.modelFromValueChanged, absPath);
			this.clearSubDirectorySortKeyOnParent(this.modelFromContainedValueChanged, absPath);
			this.deleteSubDirectory(this.modelFromValueChanged, absPath);
			this.deleteSubDirectory(this.modelFromContainedValueChanged, absPath);
		}
	};

	private readonly onUndisposed = (target: IDirectory): void => {
		// Re-snapshot directory state after rollback
		this.snapshotCurrentState(target, this.modelFromValueChanged);
		this.snapshotCurrentState(target, this.modelFromContainedValueChanged);
	};

	private snapshotCurrentState(dir: IDirectory, model: DirectoryNode): void {
		const { absolutePath } = dir;
		const dirNode = this.createDirNode(model, absolutePath);

		for (const [key, value] of dir.entries()) {
			dirNode.keys.set(key, value);
		}

		for (const [, subdir] of dir.subdirectories()) {
			this.snapshotCurrentState(subdir, model);
		}
	}

	public validate(): void {
		this.validateDirectory(this.sharedDir, "valueChanged", this.modelFromValueChanged);
		this.validateSubdirectories(this.sharedDir, "valueChanged", this.modelFromValueChanged);

		this.validateDirectory(
			this.sharedDir,
			"containedValueChanged",
			this.modelFromContainedValueChanged,
		);
		this.validateSubdirectories(
			this.sharedDir,
			"containedValueChanged",
			this.modelFromContainedValueChanged,
		);
	}

	private validateDirectory(dir: IDirectory, modelName: string, model: DirectoryNode): void {
		const { absolutePath } = dir;
		const dirNode = this.getDirNode(model, absolutePath);

		if (!dirNode) {
			return;
		}

		for (const [key, value] of dir.entries()) {
			if (dirNode.keys.has(key)) {
				assert.deepStrictEqual(
					dirNode.keys.get(key),
					value,
					`[${modelName}] Value mismatch for key "${key}" in directory "${absolutePath}": oracle=${dirNode.keys.get(key)}, actual=${value}`,
				);
			}
		}

		for (const [, subdir] of dir.subdirectories()) {
			this.validateDirectory(subdir, modelName, model);
		}
	}

	private validateSubdirectories(
		dir: IDirectory,
		modelName: string,
		model: DirectoryNode,
	): void {
		const { absolutePath } = dir;
		const dirNode = this.getDirNode(model, absolutePath);

		if (!dirNode) {
			return;
		}

		const actualSubdirs = new Set<string>();
		for (const [name] of dir.subdirectories()) {
			actualSubdirs.add(name);
		}

		const modelSubdirs = new Set<string>(dirNode.subdirectories.keys());

		// Remove stale subdirectories (suppressed subDirectoryDeleted events due to optimistic deletes)
		for (const modelSubdirName of modelSubdirs) {
			if (!actualSubdirs.has(modelSubdirName)) {
				dirNode.subdirectories.delete(modelSubdirName);
			}
		}

		for (const [name, subdir] of dir.subdirectories()) {
			if (dirNode.subdirectories.has(name)) {
				this.validateSubdirectories(subdir, modelName, model);
			}
		}
	}

	public dispose(): void {
		this.sharedDir.off("valueChanged", this.onValueChanged);
		this.sharedDir.off("cleared", this.onCleared);
		this.sharedDir.off("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.off("subDirectoryDeleted", this.onSubDirDeleted);
		this.sharedDir.off("sortKeyChanged", this.onSortKeyChanged);
		this.sharedDir.off("subDirectorySortKeyChanged", this.onSubDirectorySortKeyChanged);

		for (const dir of this.attachedDirectories) {
			dir.off("containedValueChanged", this.onContainedValueChanged);
			dir.off("containedSortKeyChanged", this.onContainedSortKeyChanged);
			dir.off(
				"containedSubDirectorySortKeyChanged",
				this.onContainedSubDirectorySortKeyChanged,
			);
			dir.off("disposed", this.onDisposed);
			dir.off("undisposed", this.onUndisposed);
		}

		this.attachedDirectories.clear();
		this.modelFromValueChanged.keys.clear();
		this.modelFromValueChanged.subdirectories.clear();
		this.modelFromValueChanged.sortKeys.clear();
		this.modelFromValueChanged.subdirectorySortKeys.clear();
		this.modelFromContainedValueChanged.keys.clear();
		this.modelFromContainedValueChanged.subdirectories.clear();
		this.modelFromContainedValueChanged.sortKeys.clear();
		this.modelFromContainedValueChanged.subdirectorySortKeys.clear();
	}
}
