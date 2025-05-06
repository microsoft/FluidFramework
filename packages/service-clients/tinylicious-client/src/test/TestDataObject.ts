/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataObject,
	DataObjectFactory,
	createDataObjectKind,
	type IDataObjectProps,
} from "@fluidframework/aqueduct/internal";

/**
 * Mock {@link @fluidframework/aqueduct#DataObject} for use in tests.
 */
class TestDataObjectClass extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

	public static readonly factory = new DataObjectFactory({
		type: TestDataObjectClass.Name,
		ctor: TestDataObjectClass,
		sharedObjects: [],
		optionalProviders: {},
	});

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
