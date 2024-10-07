/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GitRepo } from "../../../common/gitRepo";
import { sha256 } from "../../hash";
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

	protected async getDoneFileContent(): Promise<string | undefined> {
		const resourceGroup = this.getReleaseGroup();
		if (resourceGroup === undefined) {
			return undefined;
		}
		const packages = Array.from(this.node.context.repoPackageMap.values()).filter(
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
		return existsSync(infoFilePath) ? readFile(infoFilePath) : undefined;
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		const layerInfoFile = await this.getLayerInfoFile();
		return layerInfoFile
			? JSON.stringify({
					layerInfo: layerInfoFile,
					packageJson: Array.from(this.node.context.repoPackageMap.values()).map(
						(pkg) => pkg.packageJson,
					),
				})
			: undefined;
	}
}

export class FlubCheckPolicyTask extends LeafWithDoneFileTask {
	protected async getDoneFileContent(): Promise<string | undefined> {
		// We are using the "commit" (for HEAD) as a summary of the state of unchanged files to speed this up.
		const gitRepo = new GitRepo(this.node.pkg.directory);

		// Cover all the changes (including adding and removing of files, regardless of their staged state) relative to HEAD.
		const diff = await gitRepo.exec("diff HEAD", "diff HEAD");
		const modificationHash = sha256(Buffer.from(diff));

		return JSON.stringify({
			commit: await gitRepo.getCurrentSha(),
			modifications: modificationHash,
		});
	}
}
