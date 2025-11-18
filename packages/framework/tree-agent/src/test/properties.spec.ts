/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree/internal";
import { z } from "zod";

import { exposePropertiesSymbol, type ExposedProperties } from "../propertyBinding.js";

const sf = new SchemaFactory("test");

// Raise compile errors if the property signatures do not match the implementation.
{
	// @ts-expect-error: Class is unused at runtime
	class C extends sf.object("C", { a: sf.string }) {
		public testProperty: string = "testProperty";

		// To check readonly compile time errors for getters and setters
		public set property(value: string) {
			this.testProperty = value;
		}
		public get property(): string {
			return this.testProperty;
		}
		public get getTestProperty(): string {
			return this.testProperty;
		}

		public testMethod(): void {}
		public static [exposePropertiesSymbol](properties: ExposedProperties): void {
			// existing public property
			properties.exposeProperty(C, "testProperty", { schema: z.string() });
			// field passed into the schema factory
			properties.exposeProperty(C, "a", { schema: z.string() });
			// getter and setter exists, so no readOnly flag required.
			properties.exposeProperty(C, "property", { schema: z.string() });
			// only getter exists, so readOnly flag is required
			properties.exposeProperty(C, "getTestProperty", { schema: z.string(), readOnly: true });

			// @ts-expect-error: incorrect spelling / not a key.
			properties.exposeProperty(C, "testPropertyyy", { schema: z.string() });
			// @ts-expect-error: incorrect type
			properties.exposeProperty(C, "testProperty", { schema: z.number() });
			// @ts-expect-error: incorrect readOnly flag for a writable property
			properties.exposeProperty(C, "testProperty", { schema: z.string(), readOnly: true });
			// @ts-expect-error: needs readOnly flag, since there is no setter.
			properties.exposeProperty(C, "getTestProperty", { schema: z.string() });
			// @ts-expect-error: method names are not exposable.
			properties.exposeProperty(C, "testMethod", { schema: z.string() });
		}
	}
}
