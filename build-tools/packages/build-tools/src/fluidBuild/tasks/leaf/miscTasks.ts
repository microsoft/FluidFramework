/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { defaultLogger } from "../../../common/logging";
import { globFn, readFileAsync, statAsync, toPosixPath, unquote } from "../../../common/utils";
import { BuildPackage } from "../../buildGraph";
import { LeafTask, LeafWithDoneFileTask, LeafWithFileStatDoneFileTask } from "./leafTask";

/* eslint-disable @typescript-eslint/no-empty-function */

const { verbose } = defaultLogger;

export class EchoTask extends LeafTask {
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	protected async checkLeafIsUpToDate() {
		return true;
	}
}

export class LesscTask extends LeafTask {
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	protected async checkLeafIsUpToDate() {
		// TODO: assume lessc <src> <dst>
		const args = this.command.split(" ");
		if (args.length !== 3) {
			return false;
		}
		const srcPath = unquote(args[1]);
		const dstPath = unquote(args[2]);
		try {
			const srcTimeP = statAsync(path.join(this.node.pkg.directory, srcPath));
			const dstTimeP = statAsync(path.join(this.node.pkg.directory, dstPath));
			const [srcTime, dstTime] = await Promise.all([srcTimeP, dstTimeP]);
			const result = srcTime <= dstTime;
			if (!result) {
				this.traceNotUpToDate();
			}
			return result;
		} catch (e: any) {
			verbose(`${this.node.pkg.nameColored}: ${e.message}`);
			this.traceTrigger("failed to get file stats");
			return false;
		}
	}
}

export class CopyfilesTask extends LeafWithFileStatDoneFileTask {
	private parsed: boolean = false;
	private readonly upLevel: number = 0;
	private readonly copySrcArg: string = "";
	private readonly copyDstArg: string = "";

	constructor(node: BuildPackage, command: string, taskName: string | undefined) {
		super(node, command, taskName);

		// TODO: something better
		const args = this.command.split(" ");

		for (let i = 1; i < args.length; i++) {
			// Only handle -u arg
			if (args[i] === "-u" || args[i] === "--up") {
				if (i + 1 >= args.length) {
					return;
				}
				this.upLevel = parseInt(args[i + 1]);
				i++;
				continue;
			}
			if (this.copySrcArg === "") {
				this.copySrcArg = unquote(args[i]);
			} else if (this.copyDstArg === "") {
				this.copyDstArg = unquote(args[i]);
			} else {
				return;
			}
		}

		this.parsed = true;
	}

	private _srcFiles: string[] | undefined;
	private _dstFiles: string[] | undefined;

	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	protected async getInputFiles() {
		if (!this.parsed) {
			// If we can't parse the argument, we don't know what we are doing.
			throw new Error("error parsing command line");
		}
		if (!this._srcFiles) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const srcGlob = path.join(this.node.pkg.directory, this.copySrcArg!);
			this._srcFiles = await globFn(srcGlob, { nodir: true });
		}
		return this._srcFiles;
	}

	protected async getOutputFiles() {
		if (!this.parsed) {
			// If we can't parse the argument, we don't know what we are doing.
			throw new Error("error parsing command line");
		}
		if (!this._dstFiles) {
			const directory = toPosixPath(this.node.pkg.directory);
			const dstPath = directory + "/" + this.copyDstArg;
			const srcFiles = await this.getInputFiles();
			this._dstFiles = srcFiles.map((match) => {
				const relPath = path.relative(directory, match);
				let currRelPath = relPath;
				for (let i = 0; i < this.upLevel; i++) {
					const index = currRelPath.indexOf(path.sep);
					if (index === -1) {
						break;
					}
					currRelPath = currRelPath.substring(index + 1);
				}

				return path.join(dstPath, currRelPath);
			});
		}

		return this._dstFiles;
	}
}

export class GenVerTask extends LeafTask {
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	protected async checkLeafIsUpToDate() {
		const file = path.join(this.node.pkg.directory, "src/packageVersion.ts");
		try {
			const content = await readFileAsync(file, "utf8");
			const match = content.match(
				/.*\nexport const pkgName = "(.*)";[\n\r]*export const pkgVersion = "([0-9A-Za-z.+-]+)";.*/m,
			);
			if (match === null) {
				this.traceTrigger("src/packageVersion.ts content not matched");
				return false;
			}
			if (this.node.pkg.name !== match[1]) {
				this.traceTrigger("package name in src/packageVersion.ts not matched");
				return false;
			}
			if (this.node.pkg.version !== match[2]) {
				this.traceTrigger("package version in src/packageVersion.ts not matched");
				return false;
			}
			return true;
		} catch {
			this.traceTrigger(`failed to read src/packageVersion.ts`);
			return false;
		}
	}
}

export class TypeValidationTask extends LeafWithDoneFileTask {
	protected async getDoneFileContent(): Promise<string | undefined> {
		return JSON.stringify(this.package.packageJson);
	}
}

export class GoodFence extends LeafWithFileStatDoneFileTask {
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	private inputFiles: string[] | undefined;
	protected async getInputFiles(): Promise<string[]> {
		if (!this.inputFiles) {
			const fenceGlob = path.join(this.node.pkg.directory, "**/fence.json");
			const fenceFiles = await globFn(fenceGlob, { nodir: true });
			const tsFileSet = new Set<string>();
			const fencedTsFilesP = fenceFiles.map((fenceFile) => {
				const dir = path.dirname(fenceFile);
				return globFn(path.join(dir, "**/*.ts"));
			});
			const fencedTsFiles = await Promise.all(fencedTsFilesP);
			fencedTsFiles.forEach((tsFiles) => {
				tsFiles.forEach((file) => {
					tsFileSet.add(file);
				});
			});

			this.inputFiles = new Array(...tsFileSet.keys());
		}
		return this.inputFiles;
	}
	protected async getOutputFiles(): Promise<string[]> {
		return [];
	}
}
