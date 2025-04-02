/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidSerializerBase } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * For serializing op contents during submit. Will encode handles before serializing.
 *
 * @internal
 */
export class OpContentsSerializer extends FluidSerializerBase {
	/**
	 * @param root - ContainerRuntime's root handle routing context.
	 */
	public constructor(root: IFluidHandleContext) {
		assert(root.routeContext === undefined, "Context provided should have been the root");
		super(root);
	}

	/**
	 * See {@link FluidSerializerBase.parse}
	 *
	 * @deprecated Not supported at this time
	 */
	public parse(input: string): unknown {
		// In general, we would be fine to parse serialized ops here, decoding the handles along the way,
		// However, there is a forever-back-compat case we cannot handle trivially: handles with a datastore-relative path.
		// These relative paths must be converted to absolute paths before creating the RemoteFluidObjectHandle,
		// and we don't have the context to do that here.
		// So for now, we will not parse ops in ContainerRuntime layer, but rather let the DDS do it still.
		throw new UsageError("parse is not supported in OpContentsSerializer");
	}

	/**
	 * See {@link FluidSerializerBase.decode}
	 *
	 * @deprecated Not supported at this time
	 */
	public decode(input: unknown): unknown {
		// In general, we would be fine to decode the handles here.
		// However, there is a forever-back-compat case we cannot handle trivially: handles with a datastore-relative path.
		// These relative paths must be converted to absolute paths before creating the RemoteFluidObjectHandle,
		// and we don't have the context to do that here.
		// So for now, we will not try to decode handles in the ContainerRuntime layer, but rather let the DDS do it still.
		throw new UsageError("decode is not supported in OpContentsSerializer");
	}
}
