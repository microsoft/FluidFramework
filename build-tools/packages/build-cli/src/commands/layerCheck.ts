/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { Flags } from '@oclif/core';
import { LayerGraph, Timer, writeFileAsync } from "@fluidframework/build-tools";
import { BaseCommand } from "../base";

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
const packagesMdFileName: string = "PACKAGES.md";

export class LayerCheck extends BaseCommand {
  static description = 'description of this example command';

  static flags = {
    md: Flags.string({ required: false }),
    dot: Flags.file({ required: false }),
    info: Flags.string({ required: false }),
    ...super.flags,
  };

  async run() {
    const { flags } = await this.parse(LayerCheck);
    const timer = new Timer(flags.timer);

    const context = await this.getContext(true);
    const resolvedRoot = context.repo.resolvedRoot;

    // Load the package
    const packages = context.repo.packages;

    timer.time("Package scan completed");

    try {

        const layerGraph = LayerGraph.load(resolvedRoot, packages, flags.info);

        // Write human-readable package list organized by layer
        if (flags.md !== undefined) {
            const packagesMdFilePath: string = path.join(resolvedRoot, flags.md, packagesMdFileName);
            await writeFileAsync(packagesMdFilePath, layerGraph.generatePackageLayersMarkdown(resolvedRoot));
        }

        // Write machine-readable dot file used to render a dependency graph
        if (flags.dot !== undefined) {
            await writeFileAsync(flags.dot, layerGraph.generateDotGraph());
        }

        const success: boolean = layerGraph.verify();
        timer.time("Layer check completed");

        if (!success) {
            throw new Error("Layer check not succesful");
        }

        console.log(`Layer check passed (${packages.packages.length} packages)`)
    } catch (error_: unknown) {
        throw new Error(error_ as string);
    }
  }
}
