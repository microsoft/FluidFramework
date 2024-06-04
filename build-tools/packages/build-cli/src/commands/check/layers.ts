/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { Timer } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";

import { BaseCommand, LayerGraph } from "../../library/index.js";

const packagesMdFileName = "PACKAGES.md";

export class CheckLayers extends BaseCommand<typeof CheckLayers> {
	static readonly description =
		"Checks that the dependencies between Fluid Framework packages are properly layered.";

	static readonly flags = {
		md: Flags.string({
			description: `Generate ${packagesMdFileName} file at this path relative to repo root`,
			required: false,
		}),
		dot: Flags.file({
			description: "Generate *.dot for GraphViz",
			required: false,
		}),
		info: Flags.file({
			description: "Path to the layer graph json file",
			required: true,
			exists: true,
		}),
		logtime: Flags.boolean({
			description: "Display the current time on every status message for logging",
			required: false,
		}),
		...BaseCommand.flags,
	} as const;

	async run(): Promise<void> {
		const { flags } = this;
		const timer = new Timer(flags.timer);

		const context = await this.getContext();
		const { packages, resolvedRoot } = context.repo;

		timer.time("Package scan completed");

		const layerGraph = LayerGraph.load(resolvedRoot, packages.packages, flags.info);

		// Write human-readable package list organized by layer
		if (flags.md !== undefined) {
			const packagesMdFilePath: string = path.join(resolvedRoot, flags.md, packagesMdFileName);
			await writeFile(
				packagesMdFilePath,
				layerGraph.generatePackageLayersMarkdown(resolvedRoot),
			);
		}

		// Write machine-readable dot file used to render a dependency graph
		if (flags.dot !== undefined) {
			await writeFile(flags.dot, layerGraph.generateDotGraph());
		}

		const success: boolean = layerGraph.verify();
		timer.time("Layer check completed");

		if (!success) {
			this.error("Layer check not succesful");
		}

		this.log(`Layer check passed (${packages.packages.length} packages)`);
	}
}
