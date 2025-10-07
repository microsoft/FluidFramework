/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree/internal";
import { z } from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";

const sf = new SchemaFactory("test");

describe("Methods", () => {
	// Raise compile errors if the method signatures do not match the implementation.
	{
		// @ts-expect-error: Class is unused at runtime
		class C extends sf.object("C", { a: sf.string }) {
			public method(_n: number): boolean {
				return false;
			}

			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				// @ts-expect-error: Method name is mispelled.
				methods.expose(C, "methodd", buildFunc({ returns: z.boolean() }, ["n", z.number()]));
				// @ts-expect-error: Method has incorrect parameter type.
				methods.expose(C, "method", buildFunc({ returns: z.boolean() }, ["n", z.string()]));
				// @ts-expect-error: Method has incorrect return type.
				methods.expose(C, "method", buildFunc({ returns: z.number() }, ["n", z.number()]));
			}
		}
	}
});
