/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { brand } from "../../../util";
import { proxyTargetSymbol, isUnwrappedNode, getField } from "../../../feature-libraries";

import {
	FieldProxyTarget,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/editable-tree/editableField";

import { buildTestPerson } from "./mockData";

describe("editableField", () => {
	it("can use `getOwnPropertyDescriptor` for symbols of EditableField", () => {
		const [, proxy] = buildTestPerson();
		assert(isUnwrappedNode(proxy));
		const nameField = proxy[getField](brand("name"));

		{
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const descriptor = Object.getOwnPropertyDescriptor(nameField, proxyTargetSymbol)!;

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const actualValue = Reflect.apply(descriptor.get!, nameField, []);
			assert(actualValue instanceof FieldProxyTarget);

			delete descriptor.get;

			assert.deepEqual(descriptor, {
				set: undefined,
				configurable: true,
				enumerable: false,
			});
		}

		{
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const descriptor = Object.getOwnPropertyDescriptor(nameField, Symbol.iterator)!;

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const actualValue = [...Reflect.apply(descriptor.get!, nameField, [])()];
			const expectedValue = [...nameField[Symbol.iterator]()];
			assert.deepEqual(actualValue, expectedValue);

			delete descriptor.get;

			assert.deepEqual(descriptor, {
				set: undefined,
				configurable: true,
				enumerable: false,
			});
		}
	});
});
