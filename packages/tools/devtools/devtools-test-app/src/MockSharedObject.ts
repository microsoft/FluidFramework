/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";
import type {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	ISharedObject,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

/**
 * Mocks the necessary subset of {@link ISharedObject} required by this library's tests.
 *
 * @remarks If additional functionality is needed for new tests, please feel free to add them.
 */
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
class MockSharedObject extends TypedEventEmitter<ISharedObjectEvents> {
	public readonly id: string;

	public readonly attributes: IChannelAttributes;

	public constructor(id: string) {
		super();

		this.id = id;
		this.attributes = { type: "mock-shared-object-type" } as unknown as IChannelAttributes;
	}

	public get handle(): IFluidHandle {
		return new MockHandle(this);
	}
}

/**
 * Creates a mock {@link ISharedObject} for use in tests.
 */
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
export function createMockSharedObject(id: string): ISharedObject {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	return new MockSharedObject(id) as unknown as ISharedObject;
}
