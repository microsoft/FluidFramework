/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IDirectory } from "@fluidframework/map";

export class Directory implements Map<string, any> {
	private readonly map: Map<string, any> = new Map();
	private readonly subDirectoryMap: Map<string, Directory> = new Map();
	constructor(sharedDirectory?: IDirectory) {
		if (sharedDirectory === undefined) return;

		this.map = new Map(sharedDirectory.entries());
		for (const [key, subDirectory] of sharedDirectory.subdirectories()) {
			assert(!this.subDirectoryMap.has(key), "sub directory should not exist yet");
			const directory = new Directory(subDirectory);
			this.subDirectoryMap.set(key, directory);
		}
	}
	get<T = any>(key: string): T | undefined {
		return this.map.get(key) as T;
	}
	set<T = unknown>(key: string, value: T): this {
		this.map.set(key, value);
		return this;
	}
	countSubDirectory(): number {
		return this.subDirectoryMap.size;
	}
	createSubDirectory(subdirName: string): Directory {
		assert(!this.subDirectoryMap.has(subdirName), "sub directory should not exist yet");
		const newDirectory = new Directory();
		this.subDirectoryMap.set(subdirName, newDirectory);
		return newDirectory;
	}
	getSubDirectory(subdirName: string): Directory | undefined {
		return this.subDirectoryMap.get(subdirName);
	}
	hasSubDirectory(subdirName: string): boolean {
		return this.subDirectoryMap.has(subdirName);
	}
	deleteSubDirectory(subdirName: string): boolean {
		return this.subDirectoryMap.delete(subdirName);
	}
	subdirectories(): IterableIterator<[string, Directory]> {
		return this.subDirectoryMap.entries();
	}
	clear(): void {
		this.map.clear();
		this.subDirectoryMap.clear();
	}
	delete(key: string): boolean {
		return this.map.delete(key);
	}
	forEach(
		callbackfn: (value: any, key: string, map: Map<string, any>) => void,
		thisArg?: any,
	): void {
		this.map.forEach(callbackfn, thisArg);
	}
	has(key: string): boolean {
		return this.map.has(key);
	}
	get size(): number {
		return this.map.size;
	}
	entries(): IterableIterator<[string, any]> {
		return this.map.entries();
	}
	keys(): IterableIterator<string> {
		return this.map.keys();
	}
	values(): IterableIterator<any> {
		return this.map.values();
	}
	[Symbol.iterator](): IterableIterator<[string, any]> {
		return this.map[Symbol.iterator]();
	}
	public [Symbol.toStringTag]: string = "Directory";
}
