/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { IFluidSerializer } from "@fluidframework/shared-object-base/internal";

/**
 * Test serializer implementation for merge tree tests
 */
export class TestSerializer implements IFluidSerializer {
	public constructor() {}

	public get IFluidSerializer(): TestSerializer {
		return this;
	}

	public encode(input: unknown, bind: IFluidHandle): unknown {
		throw new Error("Method not implemented.");
	}

	public decode(input: unknown): unknown {
		throw new Error("Method not implemented.");
	}

	public stringify(value: unknown, bind: IFluidHandle): string {
		assert(bind === undefined, "Test serializer should not be called with bind handles");
		return JSON.stringify(value);
	}

	public parse(value: string): unknown {
		return JSON.parse(value);
	}
}
