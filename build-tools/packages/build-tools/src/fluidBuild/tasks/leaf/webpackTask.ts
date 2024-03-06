/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";
import * as fs from "fs";

import { globFn, loadModule, toPosixPath } from "../../../common/utils";
import { LeafWithDoneFileTask } from "./leafTask";
import { TscTask } from "./tscTask";

interface DoneFileContent {
	version: string;
	config: any;
	sources: { [srcFile: string]: string };
	dependencies: { [pkgName: string]: { [command: string]: any } };
}
export class WebpackTask extends LeafWithDoneFileTask {
	protected get taskWeight() {
		return 5; // generally expensive relative to other tasks
	}
	protected async getDoneFileContent() {
		try {
			const config = await loadModule(this.configFileFullPath, this.package.packageJson.type);
			const content: DoneFileContent = {
				version: await this.getVersion(),
				config: typeof config === "function" ? config(this.getEnvArguments()) : config,
				sources: {},
				dependencies: {},
			};

			const srcGlob = toPosixPath(this.node.pkg.directory) + "/src/**/*.*";
			const srcFiles = await globFn(srcGlob);
			for (const srcFile of srcFiles) {
				content.sources[srcFile] =
					await this.node.buildContext.fileHashCache.getFileHash(srcFile);
			}

			for (const dep of this.allDependentTasks) {
				if (dep.executable === "tsc") {
					if (!content.dependencies[dep.package.name]) {
						content.dependencies[dep.package.name] = {};
					}
					const tsBuildInfo = await (dep as TscTask).readTsBuildInfo();
					if (tsBuildInfo === undefined) {
						return undefined;
					}
					content.dependencies[dep.package.name][dep.command] = tsBuildInfo;
				}
			}

			return JSON.stringify(content);
		} catch (e) {
			this.traceError(`error generating done file content ${e}`);
			return undefined;
		}
	}

	private get configFileFullPath() {
		// TODO: parse the command line for real, split space for now.
		const args = this.command.split(" ");
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--config" && i + 1 < args.length) {
				return path.join(this.package.directory, args[i + 1]);
			}
		}

		return this.getDefaultConfigFile();
	}

	private getDefaultConfigFile() {
		const defaultConfigFileNames = [
			"webpack.config",
			".webpack/webpack.config",
			".webpack/webpackfile",
		];
		// TODO: webpack support more default config file extensions.  Just implement the ones that we use.
		const defaultConfigExtensions = [".js", ".cjs"];
		for (const name of defaultConfigFileNames) {
			for (const ext of defaultConfigExtensions) {
				const file = path.join(this.package.directory, `${name}${ext}`);
				if (fs.existsSync(file)) {
					return file;
				}
			}
		}
		// return webpack.config.cjs if nothing exist
		return path.join(this.package.directory, "webpack.config.cjs");
	}

	private getEnvArguments() {
		// TODO: parse the command line for real, split space for now.
		const args = this.command.split(" ");
		const env = {};
		// Ignore trailing --env
		for (let i = 1; i < args.length - 1; i++) {
			if (args[i] == "--env") {
				const value = args[++i].split("=");
				env[value[0]] = value.length === 1 ? true : value[1];
			}
		}
	}

	private async getVersion() {
		// TODO:  We can get webpack version with "webpack --version", but harder to get the plug-ins
		// For now we just use the big hammer of the monorepo lock file as are guard against version change
		return this.node.getLockFileHash();
	}
}
