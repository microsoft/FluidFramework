/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypeData, toTypeString } from "./typeData.js";

export interface TestCaseTypeData extends TypeData {
	prefix: "old" | "current";
	removed: boolean;
}

export function buildTestCase(
	getAsType: TestCaseTypeData,
	useType: TestCaseTypeData,
	isCompatible: boolean,
	typePreprocessor: string,
): string[] {
	if (!isCompatible && (getAsType.removed || useType.removed)) {
		return [];
	}

	const expectErrorString = "// @ts-expect-error compatibility expected to be broken";
	const testString: string[] = [];

	if (!isCompatible) {
		testString.push(expectErrorString);
	}
	testString.push(
		`declare type ${getAsType.prefix}_as_${useType.prefix}_for_${
			getAsType.testCaseName
		} = requireAssignableTo<${toTypeString(
			getAsType.prefix,
			getAsType,
			typePreprocessor,
		)}, ${toTypeString(useType.prefix, useType, typePreprocessor)}>`,
	);
	return testString;
}
