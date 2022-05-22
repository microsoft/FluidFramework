/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fsPromises } from 'fs';
import { getAllFilesInDirectory, decompressStatsFile } from '../utilities';
import { BundleBuddyConfig } from '../BundleBuddyTypes';
import { getBundleFilePathsFromFolder, BundleFileData } from './getBundleFilePathsFromFolder';
import { StatsCompilation } from 'webpack';

/**
 * Returns a list of all the files relevant to bundle buddy from the given folder
 * @param bundleReportPath - The path to the folder containing the bundle report
 */
export async function getBundlePathsFromFileSystem(bundleReportPath: string): Promise<BundleFileData[]> {
  const filePaths = await getAllFilesInDirectory(bundleReportPath);

  return getBundleFilePathsFromFolder(filePaths);
}

/**
 * Gets and parses a BundleBuddyConfig  file from the filesystem
 * @param path - the full path to the file in the filesystem
 */
export async function getBundleBuddyConfigFromFileSystem(path: string): Promise<BundleBuddyConfig> {
  const file = await fsPromises.readFile(path);

  return JSON.parse(file.toString());
}

/**
 * Gets a decompressed webpack stats file from the filesystem
 * @param path - the full path to the file in the filesystem
 */
export async function getStatsFileFromFileSystem(path: string): Promise<StatsCompilation> {
  const file = await fsPromises.readFile(path);

  return decompressStatsFile(file);
}
