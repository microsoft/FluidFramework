/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as axe from "axe-core";

/**
 * Represents an accessibility violation found by axe
 */
interface AxeViolation {
	id: string;
	impact: string;
	description: string;
}
/**
 * Asserts that there are no accessibility violations in the container
 * @param container - The container being checked for accessibility violations
 */
export async function assertNoAccessibilityViolations(container: HTMLElement): Promise<void> {
	const results = await axe.run(container);

	if (results.violations.length > 0) {
		const violations = results.violations as AxeViolation[];
		console.error("Accessibility violations:");
		for (const violation of violations) {
			console.error(`ID: ${violation.id}`);
			console.error(`Impact: ${violation.impact}`);
			console.error(`Description: ${violation.description}`);
		}
	}

	expect(results.violations).toStrictEqual([]);
}
