/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "fs";
import path from "path";
import { GitRepo } from "../../../common/gitRepo";
import { readFileAsync } from "../../../common/utils";
import { LeafWithDoneFileTask } from "./leafTask";

export class FlubListTask extends LeafWithDoneFileTask {
	private getReleaseGroup() {
		const split = this.command.split(" ");
		for (let i = 0; i < split.length; i++) {
			const arg = split[i];
			if (arg === "-g" || arg === "--releaseGroup") {
				return split[i + 1];
			}
		}

		// no release group flag, so assume the third argument is the release group.
		return split.length < 3 || split[2].startsWith("-") ? undefined : split[2];
	}

	public async getDoneFileContent(): Promise<string | undefined> {
		const resourceGroup = this.getReleaseGroup();
		if (resourceGroup === undefined) {
			return undefined;
		}
		const packages = Array.from(this.node.buildContext.repoPackageMap.values()).filter(
			(pkg) => pkg.monoRepo?.kind === resourceGroup,
		);
		if (packages.length === 0) {
			return undefined;
		}
		return JSON.stringify(packages.map((pkg) => [pkg.name, pkg.packageJson]));
	}
}

export class FlubCheckLayerTask extends LeafWithDoneFileTask {
	private async getLayerInfoFile() {
		const split = this.command.split(" ");
		const index = split.indexOf("--info");
		if (index < 0) {
			return undefined;
		}
		const infoFile = split[index + 1];
		if (infoFile === undefined) {
			return undefined;
		}
		const infoFilePath = path.join(this.node.pkg.directory, infoFile);
		return existsSync(infoFilePath) ? readFileAsync(infoFilePath) : undefined;
	}

	public async getDoneFileContent(): Promise<string | undefined> {
		const layerInfoFile = await this.getLayerInfoFile();
		return layerInfoFile
			? JSON.stringify({
					layerInfo: layerInfoFile,
					packageJson: Array.from(this.node.buildContext.repoPackageMap.values()).map(
						(pkg) => pkg.packageJson,
					),
				})
			: undefined;
	}
}

export class FlubCheckPolicyTask extends LeafWithDoneFileTask {
	public async getDoneFileContent(): Promise<string | undefined> {
		const gitRepo = new GitRepo(this.node.pkg.directory);
		const modifiedFiles = await gitRepo.getModifiedFiles();
		const fileHashP = Promise.all(
			modifiedFiles.map(async (file) => [
				file,
				await this.node.buildContext.fileHashCache.getFileHash(
					this.getPackageFileFullPath(file),
				),
			]),
		);
		// We are using the "commit" as a summary of the state of unchanged files to speed this up
		// However, that would mean that the task will activated when the commit is made or file
		// is staged, even when the file content didn't change.
		// We probably can do some more complicated but more precise if there are significant benefits.
		return JSON.stringify({
			commit: await gitRepo.getCurrentSha(),
			modifiedFiles: await fileHashP,
		});
	}
}
