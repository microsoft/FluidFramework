/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IEventThisPlaceHolder } from "@fluidframework/core-interfaces";

import type {
	IDirectory,
	IDirectoryValueChanged,
	ISharedDirectory,
	IValueChanged,
} from "../interfaces.js";

interface OracleDir {
	keys: Map<string, unknown>;
	subdirs: Map<string, OracleDir>;
}

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

		this.takeSnapshot();
	}

	private takeSnapshot(): void {
		for (const [k, v] of this.sharedDir.entries()) {
			this.model.set(k, v);
		}
	}

	private readonly onValueChanged = (
		changed: IDirectoryValueChanged,
		local: boolean,
		target: IEventThisPlaceHolder,
	): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { path, key, previousValue } = changed;
		const fullPath = path === "/" ? `/${key}` : `${path}/${key}`;

		if (this.model.has(fullPath)) {
			const prevVal = this.model.get(fullPath);
			assert.strictEqual(
				prevVal,
				previousValue,
				`previous value mismatch at ${fullPath}: expected: ${prevVal}, actual: ${previousValue}`,
			);
		}

		const workingDir = this.sharedDir.getWorkingDirectory(fullPath);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newVal = workingDir?.get(key);

		if (newVal === undefined) {
			// deletion
			this.model.delete(fullPath);
		} else {
			this.model.set(fullPath, newVal);
		}
	};

	private readonly onClear = (local: boolean, target: IEventThisPlaceHolder): void => {
		this.model.clear();
	};

	private readonly onSubDirCreated = (
		path: string,
		local: boolean,
		target: IEventThisPlaceHolder,
	): void => {
		this.model.set(path, undefined);
	};

	private readonly onSubDirDeleted = (
		path: string,
		local: boolean,
		target: IEventThisPlaceHolder,
	): void => {
		this.model.delete(path);
	};

	private readonly onContainedValueChanged = (
		changed: IValueChanged,
		local: boolean,
		target,
	): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = changed;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		const newVal = target.get(key);
		if (newVal === undefined) {
			this.model.delete(key);
		} else {
			this.model.set(key, newVal);
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
				dir = dir.getWorkingDirectory(part);
				if (!dir) break;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const actual = dir?.get(leafKey);
			assert.deepStrictEqual(
				actual,
				value,
				`SharedDirectoryOracle mismatch at path="${pathKey}" with actual value = ${actual} and oracle value = ${value}}}`,
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
