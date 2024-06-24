/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { create404Response } from "@fluidframework/runtime-utils/internal";
import { FluidSerializer } from "@fluidframework/shared-object-base/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";
import type { Static, TSchema } from "@sinclair/typebox";
// Based on ESM workaround from https://github.com/ajv-validator/ajv/issues/2047#issuecomment-1241470041 .
// In ESM, this gets the module, in cjs, it gets the default export which is the Ajv class.
import ajvModuleOrClass from "ajv";
import formats from "ajv-formats";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

import type { JsonValidator } from "../../codec/index.js";

// See: https://github.com/sinclairzx81/typebox#ajv
const ajv = formats.default(new Ajv({ strict: false, allErrors: true }), [
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

const serializer = new FluidSerializer(new MockHandleContext());

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
