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
		// Validate all keys and subdirectories recursively
		this.validateDirectory(this.sharedDir, "/");
	}

	private validateDirectory(dir: IDirectory, path: string): void {
		// Validate keys (entries() returns key-value pairs, NOT subdirectories)
		for (const [key, value] of dir.entries()) {
			const fullPath = path === "/" ? `/${key}` : `${path}/${key}`;
			const oracleValue = this.model.get(fullPath);
			assert.deepStrictEqual(
				value,
				oracleValue,
				`SharedDirectoryOracle key mismatch at path="${fullPath}": actual value = ${JSON.stringify(value)}, oracle value = ${JSON.stringify(oracleValue)}`,
			);
		}

		// Validate subdirectories (subdirectories() returns subdirectory pairs)
		for (const [subdirName, subdir] of dir.subdirectories()) {
			const fullPath = path === "/" ? `/${subdirName}` : `${path}/${subdirName}`;
			assert(
				this.model.has(fullPath),
				`SharedDirectoryOracle missing subdirectory at path="${fullPath}"`,
			);
			// Recursively validate the subdirectory
			this.validateDirectory(subdir, fullPath);
		}

		// Also verify oracle doesn't have extra keys or subdirs that don't exist in the actual directory
		for (const [oraclePath] of this.model.entries()) {
			if (oraclePath.startsWith(path) && oraclePath !== path) {
				// Check if this is a direct child of the current path
				const relativePath =
					path === "/" ? oraclePath.slice(1) : oraclePath.slice(path.length + 1);
				if (!relativePath.includes("/")) {
					// This is a direct child - verify it exists
					const childValue = this.model.get(oraclePath);
					if (childValue === undefined) {
						// This is a subdirectory
						assert(
							dir.getSubDirectory(relativePath) !== undefined,
							`Actual directory missing subdirectory "${relativePath}" at path="${path}" that exists in oracle`,
						);
					} else {
						// This is a key
						assert(
							dir.has(relativePath),
							`Actual directory missing key "${relativePath}" at path="${path}" that exists in oracle`,
						);
					}
				}
			}
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
