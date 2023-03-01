/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Spinner, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedObject } from "@fluidframework/shared-object-base";

import { SharedObjectRenderOptions } from "../../RendererOptions";
import { DynamicDataView } from "./DynamicDataView";

/**
 * {@link FluidObjectView} input props.
 */
export interface FluidObjectViewProps {
	/**
	 * The handle to the Fluid object to be rendered.
	 */
	fluidObjectHandle: IFluidHandle;

	/**
	 * {@inheritDoc SharedObjectRenderOptions}
	 */
	renderOptions: SharedObjectRenderOptions;
}

/**
 * Queries the provided {@link FluidObjectViewProps.fluidObjectHandle} for its backing data.
 * Until that has resolved, displays a spinner. Once it has resolved, dispatches to the appropriate renderer
 * for the data type (see {@link FluidObjectViewProps.renderOptions}).
 */
export function FluidObjectView(props: FluidObjectViewProps): React.ReactElement {
	const { fluidObjectHandle, renderOptions } = props;

	// eslint-disable-next-line unicorn/no-useless-undefined
	const [resolvedData, setResolvedData] = React.useState<FluidObject | undefined>(undefined);

	React.useEffect(() => {
		fluidObjectHandle.get().then(setResolvedData, (error) => {
			throw error;
		});
	}, [fluidObjectHandle, setResolvedData]);

	if (resolvedData === undefined) {
		return <Spinner />;
	}

	const objectType = "Fluid Object";

	// TODO: is this the right type check for this?
	const sharedObject = resolvedData as ISharedObject;
	if (sharedObject?.attributes?.type !== undefined) {
		const dataObjectType = (resolvedData as ISharedObject).attributes.type;
		return renderOptions[dataObjectType] === undefined ? (
			<Stack>
				<StackItem>
					No renderer provided for shared object type &quot;{dataObjectType}&quot;
				</StackItem>
			</Stack>
		) : (
			renderOptions[dataObjectType](sharedObject, (data) => (
				<>
					<div>
						<span
							style={{
								color: "blue",
								opacity: 0.6,
								fontWeight: "lighter",
								fontSize: "small",
							}}
						>
							{objectType}
						</span>
					</div>
					<div>
						<DynamicDataView data={data} renderOptions={renderOptions} />{" "}
					</div>
				</>
			))
		);
	}

	return <Stack>Unrecognized kind of Fluid data: {resolvedData.toString()}</Stack>;
}
