/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { globFn, readFileAsync, statAsync, toPosixPath, unquote } from "../../../common/utils";
import { BuildPackage } from "../../buildGraph";
import { LeafTask, LeafWithDoneFileTask, LeafWithFileStatDoneFileTask } from "./leafTask";
import picomatch from "picomatch";
import { readdir, stat } from "fs/promises";

export class EchoTask extends LeafTask {
	protected get isIncremental() {
		return true;
	}
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
	protected async checkLeafIsUpToDate() {
		return true;
	}
}

export class LesscTask extends LeafTask {
	protected get isIncremental() {
		return true;
	}
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
		} catch (e) {
			this.traceError(`stat error: ${(e as Error).message}`);
			this.traceTrigger("failed to get file stats");
			return false;
		}
	}
}

export class CopyfilesTask extends LeafWithFileStatDoneFileTask {
	private parsed: boolean = false;
	private readonly up: number = 0;
	private readonly copySrcArg: string[] = [];
	private readonly ignore: string = "";
	private readonly all: boolean = false;
	private readonly follow: boolean = false;
	private readonly flat: boolean = false;
	private readonly copyDstArg: string = "";

	constructor(node: BuildPackage, command: string, taskName: string | undefined) {
		super(node, command, taskName);

		// TODO: something better
		const args = this.command.split(" ");

		const input: string[] = [];
		for (let i = 1; i < args.length; i++) {
			// Only handle -u arg
			if (args[i] === "-u" || args[i] === "--up") {
				if (i + 1 >= args.length) {
					return;
				}
				this.up = parseInt(args[i + 1]);
				i++;
				continue;
			}
			if (args[i] === "-e") {
				if (i + 1 >= args.length) {
					return;
				}
				this.ignore = args[i + 1];
				i++;
				continue;
			}
			if (args[i] === "-f") {
				this.flat = true;
				continue;
			}
			if (args[i] === "-F") {
				this.follow = true;
				continue;
			}
			if (args[i] === "-a") {
				this.all = true;
				continue;
			}
			if (args[i].startsWith("-") || args[i].startsWith("--")) {
				// copyfiles ignores flags it doesn't know as well.
				continue;
			}

			const unquoted = unquote(args[i]);
			if (unquoted.includes("**") && unquoted === args[i]) {
				// Shell expansion of glob star may be different than the glob library.
				console.warn(
					`${this.nameColored}: warning: copyfiles glob pattern '${args[i]}' should be quoted. May have different behavior in different shell and OS.`,
				);
			}
			input.push(unquote(args[i]));
		}

		if (input.length < 2) {
			// Not enough arguments
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.copyDstArg = input.pop()!;
		this.copySrcArg = input;

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
			const srcFilesP = this.copySrcArg.map(async (srcArg) => {
				const srcGlob = path.resolve(this.node.pkg.directory, srcArg);
				return globFn(srcGlob, {
					nodir: true,
					dot: this.all,
					follow: this.follow,
					ignore: this.ignore,
				});
			});
			this._srcFiles = (await Promise.all(srcFilesP)).flat();
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
			const dstPath = path.resolve(directory, this.copyDstArg);
			const srcFiles = await this.getInputFiles();
			this._dstFiles = srcFiles.map((match) => {
				if (this.flat) {
					return path.join(dstPath, path.basename(match));
				}
				const relPath = path.relative(directory, match);
				if (this.up === 0) {
					return path.join(dstPath, relPath);
				}

				const paths = relPath.split(path.sep);
				if (paths.length - 1 < this.up) {
					throw new Error("Cannot go up that far");
				}

				return path.join(dstPath, ...paths.slice(this.up));
			});
		}

		return this._dstFiles;
	}
}

export class GenVerTask extends LeafTask {
	protected get isIncremental() {
		return true;
	}
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

export class DepCruiseTask extends LeafWithFileStatDoneFileTask {
	private inputFiles: string[] | undefined;
	protected async getInputFiles(): Promise<string[]> {
		if (this.inputFiles === undefined) {
			const argv = this.command.split(" ");
			const fileOrDir: string[] = [];
			for (let i = 1; i < argv.length; i++) {
				if (argv[i].startsWith("--")) {
					i++;
					continue;
				}
				fileOrDir.push(argv[i]);
			}

			const inputFiles: string[] = [];

			for (const file of fileOrDir) {
				const scan = picomatch.scan(file);
				if (scan.isGlob) {
					const match = picomatch(scan.glob);
					const fullPath = path.join(this.node.pkg.directory, scan.base);
					const files = await readdir(fullPath, { recursive: true });
					inputFiles.push(
						...files
							.filter((file) => match(file))
							.map((file) => path.join(fullPath, file)),
					);
				} else {
					const fullPath = path.resolve(this.node.pkg.directory, file);
					const info = await stat(fullPath);
					if (info.isDirectory()) {
						const files = await readdir(fullPath, { recursive: true });
						inputFiles.push(...files.map((file) => path.join(fullPath, file)));
					} else {
						inputFiles.push(fullPath);
					}
				}
			}
			// Currently,
			// - We don't read the config files to filter with includeOnly, exclude and doNotFollow
			// - We don't filter out extensions that depcruise doesn't scan.
			// So incremental detection will be conservative.
			this.inputFiles = inputFiles;
		}
		return this.inputFiles;
	}

	protected async getOutputFiles(): Promise<string[]> {
		// No output file
		return [];
	}
}
