/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { globFn, toPosixPath } from "../../../common/utils";
import { LeafWithDoneFileTask } from "./leafTask";
import { TscTask } from "./tscTask";

interface DoneFileContent {
	config: { [configFile: string]: string };
	sources: { [srcFile: string]: string };
	dependencies: { [pkgName: string]: { [command: string]: any } };
}
export class WebpackTask extends LeafWithDoneFileTask {
	protected get taskWeight() {
		return 5; // generally expensive relative to other tasks
	}
	protected async getDoneFileContent() {
		try {
			const content: DoneFileContent = {
				config: {},
				sources: {},
				dependencies: {},
			};
			const srcGlob = toPosixPath(this.node.pkg.directory) + "/src/**/*.*";
			const srcFiles = await globFn(srcGlob);
			for (const srcFile of srcFiles) {
				content.sources[srcFile] = await this.node.buildContext.fileHashCache.getFileHash(
					srcFile,
				);
			}

			const configFiles = await globFn(
				toPosixPath(this.node.pkg.directory) + "/webpack.*.js",
			);
			configFiles.push(this.configFileFullPath);
			for (const configFile of configFiles) {
				content.config[configFile] = await this.node.buildContext.fileHashCache.getFileHash(
					configFile,
				);
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
		} catch {
			return undefined;
		}
	}

	private get configFileFullPath() {
		// TODO: parse the command line for real, split space for now.
		const args = this.command.split(" ");
		let configFile = "webpack.config.js";
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--config" && i + 1 < args.length) {
				configFile = args[i + 1];
				break;
			}
		}

		return path.join(this.package.directory, configFile);
	}
}
