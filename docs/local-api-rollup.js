/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Copies local _api-extractor-temp/doc-models to docs/doc-models/local
 * This is for running local doc builds to see api changes immediately in the docs.
 */

import fs from "fs-extra";
import path from "path";

const sourceDir = "../_api-extractor-temp/doc-models";
const destinationDir = "./_doc-models/local";

async function copyDocModels(files) {
	// Create the destination directory if it doesn't exist
	if (!fs.existsSync(destinationDir)) {
		fs.mkdirSync(destinationDir, { recursive: true });
	} else {
		// Delete existing documentation output
		await fs.ensureDir(destinationDir);
		await fs.emptyDir(destinationDir);
	}

	// Copy each file from the source directory to the destination directory
	files.forEach((file) => {
		const sourcePath = path.join(sourceDir, file);
		const destinationPath = path.join(destinationDir, file);

		fs.copyFile(sourcePath, destinationPath, (err) => {
			if (err) {
				console.error(`Error copying file ${file}:`, err);
			} else {
				console.log(`Copied file ${file} to ${destinationDir}`);
			}
		});
	});
}

// Get the list of files in the source directory
fs.readdir(sourceDir, (err, files) => {
	if (err) {
		console.error("Error reading source directory:", err);
		return;
	} else {
		copyDocModels(files);
	}
});
