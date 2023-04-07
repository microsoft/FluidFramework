/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fsPromises from "node:fs/promises";
import { Volume } from "memfs";
import {
	IFileSystemManager,
	IFileSystemManagerFactory,
	IFileSystemManagerParams,
	IFileSystemPromises,
} from "./definitions";

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return { promises: fsPromises };
	}
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
	public readonly volume = new Volume();
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return { promises: this.volume.promises as unknown as IFileSystemPromises };
	}
}

export const TransactionTrackerProxyFsPromises = (
	innerFsPromises: IFileSystemPromises,
): IFileSystemPromises & { flush: () => string[] } => {
	let transactions: string[] = [];
	// For whatever reason, TypeScript will not accept the ReturnType and Parameters types
	// as valid IFileSystemPromises property types.
	const fileSystemPromises = {
		readFile: async (
			...args: Parameters<IFileSystemPromises["readFile"]>
		): ReturnType<IFileSystemPromises["readFile"]> => {
			transactions.push("readFile");
			return innerFsPromises.readFile(...args);
		},
		writeFile: async (
			...args: Parameters<IFileSystemPromises["writeFile"]>
		): ReturnType<IFileSystemPromises["writeFile"]> => {
			transactions.push("writeFile");
			return innerFsPromises.writeFile(...args);
		},
		unlink: async (
			...args: Parameters<IFileSystemPromises["unlink"]>
		): ReturnType<IFileSystemPromises["unlink"]> => {
			transactions.push("unlink");
			return innerFsPromises.unlink(...args);
		},
		readdir: async (
			...args: Parameters<IFileSystemPromises["readdir"]>
		): ReturnType<IFileSystemPromises["readdir"]> => {
			transactions.push("readdir");
			return innerFsPromises.readdir(...args);
		},
		mkdir: async (
			...args: Parameters<IFileSystemPromises["mkdir"]>
		): ReturnType<IFileSystemPromises["mkdir"]> => {
			transactions.push("mkdir");
			return innerFsPromises.mkdir(...args);
		},
		rmdir: async (
			...args: Parameters<IFileSystemPromises["rmdir"]>
		): ReturnType<IFileSystemPromises["rmdir"]> => {
			transactions.push("rmdir");
			return innerFsPromises.rmdir(...args);
		},
		stat: async (
			...args: Parameters<IFileSystemPromises["stat"]>
		): ReturnType<IFileSystemPromises["stat"]> => {
			transactions.push("stat");
			return innerFsPromises.stat(...args);
		},
		lstat: async (
			...args: Parameters<IFileSystemPromises["lstat"]>
		): ReturnType<IFileSystemPromises["lstat"]> => {
			transactions.push("lstat");
			return innerFsPromises.lstat(...args);
		},
		readlink: async (
			...args: Parameters<IFileSystemPromises["readlink"]>
		): ReturnType<IFileSystemPromises["readlink"]> => {
			transactions.push("readlink");
			return innerFsPromises.readlink(...args);
		},
		symlink: async (
			...args: Parameters<IFileSystemPromises["symlink"]>
		): ReturnType<IFileSystemPromises["symlink"]> => {
			transactions.push("symlink");
			return innerFsPromises.symlink(...args);
		},
		chmod: async (
			...args: Parameters<IFileSystemPromises["chmod"]>
		): ReturnType<IFileSystemPromises["chmod"]> => {
			transactions.push("chmod");
			return innerFsPromises.chmod(...args);
		},
		rm: async (
			...args: Parameters<IFileSystemPromises["rm"]>
		): ReturnType<IFileSystemPromises["rm"]> => {
			transactions.push("rm");
			return innerFsPromises.rm(...args);
		},
	} as unknown as IFileSystemPromises;
	return {
		...fileSystemPromises,
		flush: (): string[] => {
			const result = [...transactions];
			transactions = [];
			return result;
		},
	};
};

export function isTransactionTrackerProxyFsPromises(
	obj: IFileSystemPromises,
): obj is ReturnType<typeof TransactionTrackerProxyFsPromises> {
	return (
		typeof (obj as ReturnType<typeof TransactionTrackerProxyFsPromises>).flush === "function"
	);
}

export class TransactionTrackerProxyFsManagerFactory implements IFileSystemManagerFactory {
	constructor(private readonly innerFsManagerFactory: IFileSystemManagerFactory) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		const innerFsManager = this.innerFsManagerFactory.create(params);
		const transactionTrackerProxyFsPromises = TransactionTrackerProxyFsPromises(
			innerFsManager.promises,
		);
		return { promises: transactionTrackerProxyFsPromises };
	}
}
