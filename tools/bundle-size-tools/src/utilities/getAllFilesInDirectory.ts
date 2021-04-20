/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fsPromises } from 'fs';
import { join } from 'path';
/**
 * Gets the relative path of all files in this directory
 * @param sourceFolder - The path of the directory to scan
 * @param partialPathPrefix - The partial path built up as we recurse through directories. External callers probably don't want to set this.
 */
export async function getAllFilesInDirectory(sourceFolder: string, partialPathPrefix: string = ''): Promise<string[]> {
  const result: string[] = [];
  for (const file of await fsPromises.readdir(sourceFolder)) {
    const fullPath = join(sourceFolder, file);
    if ((await fsPromises.stat(fullPath)).isFile()) {
      result.push(join(partialPathPrefix, file));
    } else {
      result.push(...(await getAllFilesInDirectory(join(sourceFolder, file), join(partialPathPrefix, file))));
    }
  }
  return result;
}
