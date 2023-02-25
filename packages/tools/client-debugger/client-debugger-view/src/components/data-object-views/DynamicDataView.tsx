/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	IFluidHandle,
	IFluidLoadable,
	IProvideFluidHandle,
	IProvideFluidLoadable,
} from "@fluidframework/core-interfaces";

import { SharedObjectRenderOptions } from "../../RendererOptions";
import { FluidObjectView } from "./FluidObjectView";
import { RecordDataView } from "./RecordView";

// TODOs:
// - UI for copying raw data elements to the clipboard

/**
 * {@link DynamicDataView} input props.
 */
export interface DynamicDataViewProps {
	/**
	 * The data to render.
	 */
	data: unknown;

	/**
	 * {@inheritDoc SharedObjectRenderOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * Renders arbitrary data in via the following policy:
 *
 * - If the data is a primitive: simply display its raw value.
 *
 * - If the data is a {@link @fluidframework/core-interfaces#IFluidHandle}: dispatch to the appropriate data
 * rendering policy (see {@link DynamicDataViewProps.renderOptions }).
 *
 * - Else: the data is assumed to be an object with serializable traits; recurse on each of those traits.
 */
export function DynamicDataView(props: DynamicDataViewProps): React.ReactElement {
	const { data, renderOptions } = props;

	// Render primitives and falsy types via their string representation
	if (typeof data !== "object") {
		return <>{data}</>;
	}

	if ((data as IProvideFluidLoadable)?.IFluidLoadable !== undefined) {
		const handle = (data as IFluidLoadable).handle;
		return <FluidObjectView fluidObjectHandle={handle} renderOptions={renderOptions} />;
	}

	if ((data as IProvideFluidHandle)?.IFluidHandle !== undefined) {
		const handle = data as IFluidHandle;
		return <FluidObjectView fluidObjectHandle={handle} renderOptions={renderOptions} />;
	}

	if (data === null) {
		return <div>NULL</div>;
	}

	// If the underlying data was not a primitive, and it wasn't a Fluid handle, we may assume that
	// it is a serializable record.
	// Note: this is only valid because the debugger's containerData strictly takes in DDS handles,
	// and DDS children must be either serializable or a fluid handle.
	return <RecordDataView data={data as Record<string, unknown>} renderOptions={renderOptions} />;
}
