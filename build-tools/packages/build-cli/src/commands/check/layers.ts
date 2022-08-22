/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { Flags } from "@oclif/core";
import { LayerGraph, Timer, writeFileAsync } from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

const packagesMdFileName = "PACKAGES.md";

export class CheckLayers extends BaseCommand<typeof CheckLayers.flags> {
    static description =
        "Checks that the dependencies between Fluid Framework packages are properly layered.";

    static flags = {
        md: Flags.string({
            description: `Generate ${packagesMdFileName} file at this path relative to repo root`,
            required: false,
            default: ".", // default is repo root (relative path to repo root)
        }),
        dot: Flags.file({
            description: "Generate *.dot for GraphViz",
            required: false,
        }),
        info: Flags.file({
            description: "Path to the layer graph json file",
            required: false,
        }),
        logtime: Flags.boolean({
            description: "Display the current time on every status message for logging",
            required: false,
        }),
        ...BaseCommand.flags,
    };

    async run() {
        const flags = this.processedFlags;
        const timer = new Timer(flags.timer);

        const context = await this.getContext();
        const resolvedRoot = context.repo.resolvedRoot;

        // Load the package
        const packages = context.repo.packages;

        timer.time("Package scan completed");

        const layerGraph = LayerGraph.load(resolvedRoot, packages, flags.info);

        // Write human-readable package list organized by layer
        if (flags.md !== undefined) {
            const packagesMdFilePath: string = path.join(
                resolvedRoot,
                flags.md,
                packagesMdFileName,
            );
            await writeFileAsync(
                packagesMdFilePath,
                layerGraph.generatePackageLayersMarkdown(resolvedRoot),
            );
        }

        // Write machine-readable dot file used to render a dependency graph
        if (flags.dot !== undefined) {
            await writeFileAsync(flags.dot, layerGraph.generateDotGraph());
        }

        const success: boolean = layerGraph.verify();
        timer.time("Layer check completed");

        if (!success) {
            this.error("Layer check not succesful");
        }

        this.log(`Layer check passed (${packages.packages.length} packages)`);
    }
}
