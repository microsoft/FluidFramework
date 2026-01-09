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
	};

	// Model updated via containedValueChanged events (nested structure)
	private readonly modelFromContainedValueChanged: DirectoryNode = {
		keys: new Map(),
		subdirectories: new Map(),
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
		}
	};

	private readonly onCleared = (path: string, local: boolean): void => {
		// Clear keys; valueChanged events follow for keys with pending local operations
		const absPath = path.startsWith("/") ? path : `/${path}`;
		const dirNode1 = this.getDirNode(this.modelFromValueChanged, absPath);
		const dirNode2 = this.getDirNode(this.modelFromContainedValueChanged, absPath);

		if (dirNode1) {
			dirNode1.keys.clear();
		}
		if (dirNode2) {
			dirNode2.keys.clear();
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
		this.deleteSubDirectory(this.modelFromValueChanged, absPath);
		this.deleteSubDirectory(this.modelFromContainedValueChanged, absPath);
	};

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
		} else {
			dirNode.keys.set(key, newValue);
		}
	};

	private readonly onDisposed = (target: IDirectory): void => {
		const absPath = target.absolutePath;

		if (absPath === "/") {
			this.modelFromValueChanged.keys.clear();
			this.modelFromValueChanged.subdirectories.clear();
			this.modelFromContainedValueChanged.keys.clear();
			this.modelFromContainedValueChanged.subdirectories.clear();
		} else {
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

		for (const dir of this.attachedDirectories) {
			dir.off("containedValueChanged", this.onContainedValueChanged);
			dir.off("disposed", this.onDisposed);
			dir.off("undisposed", this.onUndisposed);
		}

		this.attachedDirectories.clear();
		this.modelFromValueChanged.keys.clear();
		this.modelFromValueChanged.subdirectories.clear();
		this.modelFromContainedValueChanged.keys.clear();
		this.modelFromContainedValueChanged.subdirectories.clear();
	}
}
