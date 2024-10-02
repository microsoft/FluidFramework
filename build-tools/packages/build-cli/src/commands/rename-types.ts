/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { BaseCommand } from "../library/index.js";

function renameFilesInDir(dir: string, extension: string, newExtension: string): void {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const fileStat = fs.lstatSync(filePath);

		if (fileStat.isDirectory()) {
			renameFilesInDir(filePath, extension, newExtension); // recurse into directories
		} else if (filePath.endsWith(extension)) {
			const newFilePath = filePath.slice(0, filePath.length - extension.length) + newExtension;
			fs.renameSync(filePath, newFilePath);
		}
	}
}

/**
 * Renames all d.ts files in the lib/ folder to .d.mts.
 *
 * @remarks
 * This command is primarily used in our build system to rename type declarations in ESM builds.
 */
export default class RenameTypesCommand extends BaseCommand<typeof RenameTypesCommand> {
	static readonly description = `Renames type declaration files from .d.ts to .d.mts.`;
	public async run(): Promise<void> {
		renameFilesInDir("./lib", ".d.ts", ".d.mts");
	}
}
