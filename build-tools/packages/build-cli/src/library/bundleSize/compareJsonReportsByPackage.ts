/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareJsonReports } from "./compareJsonReports.js";
import type { AnalyzerJsonByPackage, PackageComparison } from "./types.js";

/**
 * Compare per-package `JsonReport`s for two snapshots and produce a
 * {@link PackageComparison}. Iterates the union of source packages so packages
 * present only on one side are represented (their `compareJsonReports` call
 * treats the absent side as empty).
 */
export function compareJsonReportsByPackage(
	base: AnalyzerJsonByPackage,
	compare: AnalyzerJsonByPackage,
): PackageComparison {
	const allPackages = new Set<string>([...base.keys(), ...compare.keys()]);
	const result: PackageComparison = {};
	for (const sourcePackage of allPackages) {
		result[sourcePackage] = compareJsonReports(
			base.get(sourcePackage),
			compare.get(sourcePackage),
		);
	}
	return result;
}
