/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypeData, toTypeString } from "./typeData";

export interface TestCaseTypeData extends TypeData {
	prefix: "old" | "current";
	removed: boolean;
}

export function buildTestCase(
	getAsType: TestCaseTypeData,
	useType: TestCaseTypeData,
	isCompatible: boolean,
) {
	if (!isCompatible && (getAsType.removed || useType.removed)) {
		return "";
	}

	const getSig = `get_${getAsType.prefix}_${getFullTypeName(getAsType).replace(".", "_")}`;
	const useSig = `use_${useType.prefix}_${getFullTypeName(useType).replace(".", "_")}`;
	const expectErrorString = "    // @ts-expect-error compatibility expected to be broken";
	const testString: string[] = [];

	testString.push(`declare function ${getSig}():`);
	testString.push(`    ${toTypeString(getAsType.prefix, getAsType)};`);
	testString.push(`declare function ${useSig}(`);
	testString.push(`    use: ${toTypeString(useType.prefix, useType)}): void;`);
	testString.push(`${useSig}(`);
	if (!isCompatible) {
		testString.push(expectErrorString);
	}
	testString.push(`    ${getSig}());`);
	return testString;
}

function getFullTypeName(typeData: TypeData) {
	return `${typeData.kind}_${typeData.name}`;
}
