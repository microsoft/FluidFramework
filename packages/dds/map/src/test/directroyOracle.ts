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
		const { path, key } = change;
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

		// if (!local) {
		// 	this.captureInitialSnapshot(this.sharedDir);
		// }
	};

	private readonly onSubDirCreated = (
		subdirName: string,
		local: boolean,
		target: ISharedDirectory,
	) => {
		const pathKey =
			target.absolutePath === "" ? subdirName : `${target.absolutePath}/${subdirName}`;
		if (!this.model.has(pathKey)) {
			this.model.set(`${pathKey}/`, undefined);
		}
	};

	private readonly onSubDirDeleted = (path: string) => {
		for (const key of [...this.model.keys()]) {
			if (key.startsWith(`${path}/`)) {
				this.model.delete(`${path}/${key}`);
			}
		}
	};

	private readonly onContainedValueChanged = (
		change: IValueChanged,
		local: boolean,
		target: IDirectory,
	) => {
		const pathKey =
			target.absolutePath === "" ? change.key : `${target.absolutePath}/${change.key}`;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(change.key);

		if (newValue === undefined) {
			this.model.delete(pathKey);
		} else {
			this.model.set(pathKey, newValue);
		}
	};

	public validate(): void {
		for (const [pathKey, value] of this.model.entries()) {
			const parts = pathKey.split("/").filter((p) => p.length > 0);
			assert(parts.length > 0, "Invalid path, cannot extract key");

			const leafKey = parts.pop();
			let dir: IDirectory | undefined = this.sharedDir;
			for (const part of parts) {
				dir = dir.getSubDirectory(part);
				if (!dir) break;
			}

			assert(leafKey !== undefined && leafKey.length > 0, "Leaf key is undefined");
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
