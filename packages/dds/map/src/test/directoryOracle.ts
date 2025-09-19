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
			const pathKey = dir.absolutePath === "/" ? `/${key}` : `${dir.absolutePath}/${key}`;

			this.model.set(pathKey, value);
		}

		for (const [, subDir] of dir.subdirectories()) {
			// Just recurse to capture keys inside the subdir
			this.captureInitialSnapshot(subDir);
		}
	}

	private readonly onValueChanged = (change: IDirectoryValueChanged) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = change;
		const path = change.path ?? "";

		const pathKey = path === "/" ? `/${key}` : `${path}/${key}`;

		assert.strictEqual(
			previousValue,
			this.model.get(pathKey),
			`Mismatch on previous value for key="${key}"`,
		);

		const fuzzDir = this.sharedDir.getWorkingDirectory(path);
		if (!fuzzDir) return;

		if (fuzzDir.has(key)) {
			this.model.set(pathKey, fuzzDir.get(key));
		} else {
			this.model.delete(pathKey);
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
		const { absolutePath } = target;
		if (!this.model.has(`${absolutePath}${subdirName}`)) {
			this.model.set(`${absolutePath}${subdirName}`, undefined);
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
		const { key, previousValue } = change;
		const { absolutePath } = target;

		const pathKey = absolutePath === "/" ? `/${key}` : `${absolutePath}/${key}`;

		assert.strictEqual(
			previousValue,
			this.model.get(pathKey),
			`Mismatch on previous value for key="${key}"`,
		);

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newValue = target.get(key);

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
				`SharedDirectoryOracle mismatch at path="${pathKey}" with actual value = ${actual} and oracle value = ${value} with model entries = ${JSON.stringify(this.model.entries())}}`,
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
