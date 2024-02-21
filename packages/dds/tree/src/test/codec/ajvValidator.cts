/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Static, TSchema } from "@sinclair/typebox";
import { FluidSerializer } from "@fluidframework/shared-object-base";
import { IFluidHandleContext, IRequest } from "@fluidframework/core-interfaces";
import { create404Response } from "@fluidframework/runtime-utils";
import { MockHandle } from "@fluidframework/test-runtime-utils";
import type { JsonValidator } from "@fluidframework/tree/internal";

// See: https://github.com/sinclairzx81/typebox#ajv
const ajv = addFormats(new Ajv({ strict: false, allErrors: true }), [
	"date-time",
	"time",
	"date",
	"email",
	"hostname",
	"ipv4",
	"ipv6",
	"uri",
	"uri-reference",
	"uuid",
	"uri-template",
	"json-pointer",
	"relative-json-pointer",
	"regex",
]);

class MockHandleContext implements IFluidHandleContext {
	public isAttached = false;
	public get IFluidHandleContext() {
		return this;
	}

	public constructor(
		public readonly absolutePath = "",
		public readonly routeContext?: IFluidHandleContext,
	) {}

	public attachGraph() {
		throw new Error("Method not implemented.");
	}

	public async resolveHandle(request: IRequest) {
		return create404Response(request);
	}
}

const serializer = new FluidSerializer(new MockHandleContext(), () => {});

/**
 * A {@link JsonValidator} implementation which uses Ajv's JSON schema validator.
 *
 * This validator is useful for debugging issues with formats, as the error messages it produces
 * contain information about why the data is out of schema.
 */
export const ajvValidator: JsonValidator = {
	compile: <Schema extends TSchema>(schema: Schema) => {
		const validate = ajv.compile(schema);
		return {
			check: (data): data is Static<Schema> => {
				const valid = validate(data);
				if (!valid) {
					throw new Error(
						`Invalid JSON.\n\nData: ${serializer.stringify(
							data,
							new MockHandle(""),
						)}\n\nErrors: ${JSON.stringify(validate.errors)}`,
					);
				}
				return true;
			},
		};
	},
};
