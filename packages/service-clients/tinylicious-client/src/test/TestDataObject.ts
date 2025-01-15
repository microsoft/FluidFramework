/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataObject,
	DataObjectFactory,
	type IDataObjectProps,
} from "@fluidframework/aqueduct/internal";
import { createDataObjectKind } from "@fluidframework/shared-object-base/internal";

/**
 * Mock {@link @fluidframework/aqueduct#DataObject} for use in tests.
 */
class TestDataObjectClass extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

	public static readonly factory = new DataObjectFactory(
		TestDataObjectClass.Name,
		TestDataObjectClass,
		[],
		{},
	);

	public constructor(props: IDataObjectProps) {
		super(props);
	}
}

/**
 * {@inheritDoc TestDataObjectClass}
 */
export const TestDataObject = createDataObjectKind(TestDataObjectClass);
/**
 * {@inheritDoc TestDataObjectClass}
 */
export type TestDataObject = TestDataObjectClass;
