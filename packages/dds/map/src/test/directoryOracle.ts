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

		this.takeSnapshot(sharedDir);
	}

	private takeSnapshot(dir: ISharedDirectory | IDirectory): void {
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

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newVal = this.sharedDir.get(fullPath);

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
		target: IEventThisPlaceHolder,
	): void => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { key, previousValue } = changed;

		if (this.model.has(key)) {
			const prevVal = this.model.get(key);
			assert.strictEqual(
				prevVal,
				previousValue,
				`contained previous value mismatch at ${key}: expected: ${prevVal}, actual: ${previousValue}`,
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const newVal = this.sharedDir.get(key);
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
