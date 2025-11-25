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
 * Oracle for directory
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
		// Use internal clearInternal event to track which directory was cleared
		this.sharedDir.on("clearInternal", this.onClearInternal);
		this.sharedDir.on("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.on("subDirectoryDeleted", this.onSubDirDeleted);

		this.attachToAllDirectories(sharedDir);
	}

	/**
	 * Get or create a directory node at the given path in the model
	 */
	private getOrCreateDirNode(model: DirectoryNode, path: string): DirectoryNode {
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
	 * Get a directory node at the given path, or undefined if it doesn't exist
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
	 * Delete a subdirectory and all its contents from the model
	 */
	private deleteSubDirectory(model: DirectoryNode, path: string): void {
		if (path === "/" || path === "") {
			// Can't delete root
			return;
		}

		const parts = path.split("/").filter((p) => p.length > 0);
		if (parts.length === 0) {
			return;
		}

		// Navigate to parent directory
		const parentPath = parts.slice(0, -1).join("/");
		const dirName = parts[parts.length - 1];
		const parentNode = this.getDirNode(model, parentPath);

		if (parentNode) {
			// Deleting a subdirectory also recursively deletes all its nested subdirectories
			// This matches the actual directory behavior where deleting a parent disposes all children
			parentNode.subdirectories.delete(dirName);
		}
	}

	private attachToAllDirectories(dir: IDirectory): void {
		// Prevent attaching listeners multiple times for the same directory
		if (this.attachedDirectories.has(dir)) {
			return;
		}

		// Track this directory for cleanup
		this.attachedDirectories.add(dir);

		// Attach containedValueChanged listener to this directory
		dir.on("containedValueChanged", this.onContainedValueChanged);
		// Note: We do NOT listen to subDirectoryCreated or subDirectoryDeleted on individual directories.
		// The root-level listeners already handle ALL subdirectory operations in the tree with absolute
		// paths. Listening on individual directories would cause duplicate processing or confusion
		// between relative and absolute paths.
		// dir.on("clearInternal", this.onClearInternal);

		// Attach disposed/undisposed listeners for rollback support
		dir.on("disposed", this.onDisposed);
		dir.on("undisposed", this.onUndisposed);

		// Recurse into subdirectories
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
		if (!fuzzDir) return;

		const dirNode = this.getOrCreateDirNode(this.modelFromValueChanged, path);

		// Assert that previousValue matches what we had in the oracle.
		// For local operations, this should always match.
		// For remote operations, previousValue might differ from oracle when there are pending local
		// operations on the same key (oracle has optimistic value, event has sequenced value).
		if (local) {
			assert.deepStrictEqual(
				previousValue,
				dirNode.keys.get(key),
				`[valueChanged] previousValue mismatch for key "${key}" in directory "${path}": event.previousValue=${previousValue}, oracle=${dirNode.keys.get(key)}, local=${local}`,
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

	private readonly onClearInternal = (path: string, local: boolean): void => {
		// Clear keys at the specified path
		const absPath = path.startsWith("/") ? path : `/${path}`;
		const dirNode1 = this.getDirNode(this.modelFromValueChanged, absPath);
		const dirNode2 = this.getDirNode(this.modelFromContainedValueChanged, absPath);

		if (dirNode1) {
			dirNode1.keys.clear();
		}
		if (dirNode2) {
			dirNode2.keys.clear();
		}

		if (!local) {
			this.snapshotCurrentState(this.sharedDir, this.modelFromValueChanged);
			this.snapshotCurrentState(this.sharedDir, this.modelFromContainedValueChanged);
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

		// Check if the subdirectory actually exists before adding it to our models
		// If getWorkingDirectory returns undefined, it means the subdirectory doesn't exist
		// (it may have been deleted or disposed before we could access it)
		const newSubDir = this.sharedDir.getWorkingDirectory(path);
		if (!newSubDir) {
			// Subdirectory doesn't exist, don't add it to oracle models
			return;
		}

		// Create the subdirectory node in both models
		const subdirPath = path.startsWith("/") ? path : `/${path}`;
		this.getOrCreateDirNode(this.modelFromValueChanged, subdirPath);
		this.getOrCreateDirNode(this.modelFromContainedValueChanged, subdirPath);

		// Attach to the newly created subdirectory and all its nested subdirectories to listen for containedValueChanged events
		this.attachToAllDirectories(newSubDir);
	};

	private readonly onSubDirDeleted = (path: string): void => {
		const absPath = path.startsWith("/") ? path : `/${path}`;

		// Only delete if the subdirectory exists in our models
		// It may not exist if:
		// - It was created before the oracle was attached
		// - It was created and deleted in quick succession
		// - getWorkingDirectory returned undefined during creation (directory was pending/disposed)
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

		const dirNode = this.getOrCreateDirNode(this.modelFromContainedValueChanged, absolutePath);

		// Assert that previousValue matches what we had in the oracle.
		// For local operations, this should always match.
		// For remote operations, previousValue might differ from oracle when there are pending local
		// operations on the same key (oracle has optimistic value, event has sequenced value).
		if (local) {
			assert.deepStrictEqual(
				previousValue,
				dirNode.keys.get(key),
				`[containedValueChanged] previousValue mismatch for key "${key}" in directory "${absolutePath}": event.previousValue=${previousValue}, oracle=${dirNode.keys.get(key)}, local=${local}`,
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
		// When a subdirectory is disposed (during rollback), remove it from the oracle models
		const absPath = target.absolutePath;

		if (absPath === "/") {
			// Clear root directory - all keys and subdirectories
			this.modelFromValueChanged.keys.clear();
			this.modelFromValueChanged.subdirectories.clear();
			this.modelFromContainedValueChanged.keys.clear();
			this.modelFromContainedValueChanged.subdirectories.clear();
		} else {
			// Delete this subdirectory from parent
			this.deleteSubDirectory(this.modelFromValueChanged, absPath);
			this.deleteSubDirectory(this.modelFromContainedValueChanged, absPath);
		}
	};

	private readonly onUndisposed = (target: IDirectory): void => {
		// When a directory is undisposed (after rollback), we need to re-snapshot its state
		// because the rollback has restored it to its previous state, but our oracle was cleared
		// by the disposed event. Re-snapshotting ensures the oracle matches the restored state.
		this.snapshotCurrentState(target, this.modelFromValueChanged);
		this.snapshotCurrentState(target, this.modelFromContainedValueChanged);
	};

	private snapshotCurrentState(dir: IDirectory, model: DirectoryNode): void {
		const { absolutePath } = dir;
		const dirNode = this.getOrCreateDirNode(model, absolutePath);

		// Snapshot all keys in this directory
		for (const [key, value] of dir.entries()) {
			dirNode.keys.set(key, value);
		}

		// Recursively snapshot subdirectories
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
			// If the directory doesn't exist in the model, we haven't received events for it yet
			return;
		}

		// Check all keys in this directory
		for (const [key, value] of dir.entries()) {
			// Only validate keys that the oracle is tracking
			// (keys loaded from snapshots may not fire events)
			if (dirNode.keys.has(key)) {
				// Verify oracle has the correct value
				assert.deepStrictEqual(
					dirNode.keys.get(key),
					value,
					`[${modelName}] Value mismatch for key "${key}" in directory "${absolutePath}": oracle=${dirNode.keys.get(key)}, actual=${value}`,
				);
			}
		}

		// Recursively validate subdirectories
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

		// Get actual subdirectories from the directory
		const actualSubdirs = new Set<string>();
		for (const [name] of dir.subdirectories()) {
			actualSubdirs.add(name);
		}

		// Get subdirectories from the oracle model
		const modelSubdirs = new Set<string>(dirNode.subdirectories.keys());

		// Check for stale subdirectories in model (exist in model but not in actual directory)
		// Remove them from the oracle model since they no longer exist.
		// This handles cases where subDirectoryDeleted events are suppressed due to optimistic deletes:
		// When a local delete is pending and a remote delete arrives, the directory implementation
		// suppresses the subDirectoryDeleted event because from the optimistic view, the directory
		// was already deleted. The oracle needs to clean up these stale entries during validation.
		for (const modelSubdirName of modelSubdirs) {
			if (!actualSubdirs.has(modelSubdirName)) {
				// Stale subdirectory - remove it from the oracle model
				dirNode.subdirectories.delete(modelSubdirName);
			}
		}

		// Don't check for missing subdirectories - the oracle may have been attached after
		// subdirectories were created, so it's expected that some subdirectories in the actual
		// directory may not be tracked by the oracle

		// Recursively validate nested subdirectories that still exist
		for (const [name, subdir] of dir.subdirectories()) {
			// Only validate subdirectories that exist in the oracle model
			if (dirNode.subdirectories.has(name)) {
				this.validateSubdirectories(subdir, modelName, model);
			}
		}
	}

	public dispose(): void {
		// Remove listeners from root
		this.sharedDir.off("valueChanged", this.onValueChanged);
		this.sharedDir.off("clearInternal", this.onClearInternal);
		this.sharedDir.off("subDirectoryCreated", this.onSubDirCreated);
		this.sharedDir.off("subDirectoryDeleted", this.onSubDirDeleted);

		// Remove listeners from all directories (including root)
		for (const dir of this.attachedDirectories) {
			dir.off("containedValueChanged", this.onContainedValueChanged);
			// Note: subDirectoryCreated and subDirectoryDeleted were never attached to individual directories
			// dir.off("clearInternal", this.onClearInternal);
			dir.off("disposed", this.onDisposed);
			dir.off("undisposed", this.onUndisposed);
		}

		// Clear tracked state
		this.attachedDirectories.clear();
		this.modelFromValueChanged.keys.clear();
		this.modelFromValueChanged.subdirectories.clear();
		this.modelFromContainedValueChanged.keys.clear();
		this.modelFromContainedValueChanged.subdirectories.clear();
	}
}
