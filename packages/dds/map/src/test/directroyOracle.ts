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

	private captureInitialSnapshot(dir: IDirectory, prefix = ""): void {
		// Capture all keys directly in this directory
		for (const [key, value] of dir.entries()) {
			const pathKey = prefix === "" ? key : `${prefix}/${key}`;
			this.model.set(pathKey, value);
		}

		// Recursively capture subdirectories
		for (const [subDirName, subDir] of dir.subdirectories()) {
			const subPrefix = prefix === "" ? subDirName : `${prefix}/${subDirName}`;
			this.model.set(`${subPrefix}/`, {});
			this.captureInitialSnapshot(subDir, subPrefix);
		}
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { path, key, previousValue } = change;
		const pathKey = `${path}/${key}`;
		const dir = this.sharedDir.getWorkingDirectory(path);
		if (!dir) return;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = dir.get(key);

		if (newValue === undefined) {
			this.model.delete(pathKey);
		} else {
			this.model.set(pathKey, newValue);
		}
	};

	private readonly onClear = () => {
		this.model.clear();
	};

	private readonly onSubDirCreated = (
		subdirName: string,
		local: boolean,
		target: ISharedDirectory,
	) => {
		const pathKey =
			target.absolutePath === "" ? subdirName : `${target.absolutePath}/${subdirName}`;
		if (!this.model.has(pathKey)) {
			this.model.set(`${pathKey}/`, {});
		}
	};

	private readonly onSubDirDeleted = (path: string) => {
		for (const key of [...this.model.keys()]) {
			if (key.startsWith(`${path}/`)) {
				this.model.delete(key);
			}
		}
	};

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	) => {
		const path = target.absolutePath;
		const pathKey = path === "" ? change.key : `${path}/${change.key}`;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(change.key);

		if (newValue === undefined) {
			this.model.delete(pathKey);
		} else {
			this.model.set(pathKey, newValue);
		}
	};

	public validate(): void {
		// Compare oracle with current shared directory via events
		for (const [key, value] of this.model.entries()) {
			const parts = key.split("/");
			assert(parts.length > 0, "Invalid path, cannot extract key");
			const leafKey = parts.pop();
			let dir: IDirectory | undefined = this.sharedDir;
			for (const part of parts) {
				dir = dir.getSubDirectory(part);
				if (!dir) break;
			}
			assert(leafKey !== undefined, "leaf key is undefined");
			assert.deepStrictEqual(
				dir?.get(leafKey),
				value,
				`SharedDirectoryOracle mismatch at path="${key}"`,
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
