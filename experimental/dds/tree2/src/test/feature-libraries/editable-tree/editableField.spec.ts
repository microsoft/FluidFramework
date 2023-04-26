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
			const descriptor = Object.getOwnPropertyDescriptor(nameField, proxyTargetSymbol);
			assert(descriptor?.value instanceof FieldProxyTarget);
			const expected = {
				configurable: true,
				enumerable: false,
				value: Reflect.get(nameField, proxyTargetSymbol),
				writable: false,
			};
			assert.deepEqual(descriptor, expected);
		}

		{
			const descriptor = Object.getOwnPropertyDescriptor(nameField, Symbol.iterator);
			assert(typeof descriptor?.value === "function");
			delete descriptor.value;
			const expected = {
				configurable: true,
				enumerable: false,
				writable: false,
			};
			assert.deepEqual(descriptor, expected);
		}
	});
});
