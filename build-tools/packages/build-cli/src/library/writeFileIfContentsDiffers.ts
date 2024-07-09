import { readFile, writeFile } from "fs-extra";
import {type PathLike} from "node:fs";

/**
 * Writes to a file, but first reads the contents to check if it matches the desired content. If it does, the operation
 * is skipped.
 *
 * @param filePath - The path to the file to write.
 * @param contents - The contents to write to the file.
 * @returns True if the file was written; false otherwise.
 */
export async function writeFileIfContentsDiffers(
	filePath: PathLike,
	contents: string,
): Promise<boolean> {
	const fileContents = await readFile(filePath, {encoding:"utf8"});
	if(fileContents !== contents) {
		await writeFile(filePath, contents);
		return true;
	}
	return false;
}
