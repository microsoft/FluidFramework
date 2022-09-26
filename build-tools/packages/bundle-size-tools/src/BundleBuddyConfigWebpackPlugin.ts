/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Compilation, Compiler, WebpackError } from 'webpack';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { BundleBuddyConfig } from './BundleBuddyTypes';

export interface BundleBuddyPluginConfig {
  outputFileName: string;

  bundleBuddyConfig: BundleBuddyConfig;
}

const pluginName = 'BundleBuddyConfigPlugin';

/**
 * Webpack plugin that enables package owners to define custom bundle buddy configurations to enable advanced bundle analysis.
 * This plugin simply takes in a bundle buddy configuration
 */
export class BundleBuddyConfigWebpackPlugin {
  private config: BundleBuddyPluginConfig;

  constructor(config: BundleBuddyPluginConfig) {
    if (typeof config.outputFileName !== 'string') {
      throw new Error(`${pluginName} requires the outputFileName parameter`);
    }

    this.config = config;
  }

  public apply(compiler: Compiler) {
    compiler.hooks.emit.tapAsync(pluginName, (compilation: Compilation, callback: () => void) => {
      // Set used to validate that all chunks specified in the bundle buddy config actually exist in the output
      const chunkNamesLeftToValidate = new Set(this.config.bundleBuddyConfig.chunksToAnalyze.map((c) => c.name));

      compilation.chunks.forEach((chunk) => {
        if (chunk.name !== undefined) {
          if (chunkNamesLeftToValidate.has(chunk.name)) {
            chunkNamesLeftToValidate.delete(chunk.name);
          }
        }
      });

      if (chunkNamesLeftToValidate.size > 0) {
        compilation.errors.push(
          new WebpackError(
            `Bundle buddy config specified the following chunk names which do not exist in this compilation: ${[
              ...chunkNamesLeftToValidate
            ].join(', ')}`
          )
        );
      }

      const outputDir = dirname(this.config.outputFileName);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Output the file with the output chunks
      writeFileSync(
        resolve(compiler.outputPath, this.config.outputFileName),
        JSON.stringify(this.config.bundleBuddyConfig)
      );

      callback();
    });
  }
}
