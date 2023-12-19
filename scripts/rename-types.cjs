#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function renameFilesInDir(dir) {
	const files = fs.readdirSync(path.join(process.cwd(), dir));

	for (const file of files) {
		const filePath = path.join(dir, file);
		const fileStat = fs.lstatSync(filePath);

		if (fileStat.isDirectory()) {
			renameFilesInDir(filePath); // recurse into directories
		} else if (path.extname(filePath) === ".d.ts") {
			const newFilePath = path.join(dir, path.basename(file, ".d.ts") + ".d.mts");
			fs.renameSync(filePath, newFilePath);
		}
	}
}

renameFilesInDir("./lib");
