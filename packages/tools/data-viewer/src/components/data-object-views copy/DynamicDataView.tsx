/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Spinner, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { FluidObject, IFluidHandle, IProvideFluidHandle } from "@fluidframework/core-interfaces";
import { SharedObjectCore } from "@fluidframework/shared-object-base";

import { SharedObjectRendererOptions } from "../../RendererOptions";

/**
 * {@link DynamicDataView} input props.
 */
export interface DynamicDataViewProps {
    /**
     * The data to render.
     */
    data: unknown;

    /**
     * {@inheritDoc RendererOptions}
     */
    sharedObjectRenderers: SharedObjectRendererOptions;
}

/**
 * Renders arbitrary data in via the following policy:
 *
 * - If the data is a primitive: simply display its raw value.
 *
 * - If the data is a {@link @fluidframework/core-interfaces#IFluidHandle}: dispatch to the appropriate data
 * rendering policy (see {@link DynamicDataViewProps.sharedObjectRenderers }).
 *
 * - Else: the data is assumed to be an object with serializable traits; recurse on each of those traits.
 */
export function DynamicDataView(props: DynamicDataViewProps): React.ReactElement {
    const { data, sharedObjectRenderers } = props;

    // Render primitives and falsy types via their string representation
    if (typeof data !== "object") {
        return <>{data}</>;
    }

    if ((data as IProvideFluidHandle)?.IFluidHandle !== undefined) {
        const handle = data as IFluidHandle;
        return (
            <FluidObjectView
                fluidObjectHandle={handle}
                sharedObjectRenderers={sharedObjectRenderers}
            />
        );
    }

    if (data === null) {
        return <div>NULL</div>;
    }

    // If the underlying data was not a primitive, and it wasn't a Fluid handle, it must be serializable data.
    // But that serializable data might contain Fluid handles as descendents, so we can't just
    // display json or something.
    const objectProperties = Object.entries(data);

    return (
        <Stack>
            {objectProperties.map(([key, value]) => (
                <StackItem key={key}>
                    <DynamicDataView
                        data={value as unknown}
                        sharedObjectRenderers={sharedObjectRenderers}
                    />
                </StackItem>
            ))}
        </Stack>
    );
}

/**
 * {@link FluidObjectView} input props.
 */
export interface FluidObjectViewProps {
    fluidObjectHandle: IFluidHandle;
    sharedObjectRenderers: SharedObjectRendererOptions;
}

export function FluidObjectView(props: FluidObjectViewProps): React.ReactElement {
    const { fluidObjectHandle, sharedObjectRenderers } = props;

    // eslint-disable-next-line unicorn/no-useless-undefined
    const [resolvedData, setResolvedData] = React.useState<FluidObject | undefined>(undefined);

    React.useEffect(() => {
        fluidObjectHandle.get().then(setResolvedData, (error) => {
            throw error;
        });
    }, [resolvedData]);

    if (resolvedData === undefined) {
        return <Spinner />;
    }

    // TODO: is this the right type check for this?
    if (resolvedData instanceof SharedObjectCore) {
        return sharedObjectRenderers[resolvedData.attributes.type] === undefined ? (
            <Stack>
                <StackItem>
                    No renderer provided for shared object type "{resolvedData.attributes.type}"
                </StackItem>
            </Stack>
        ) : (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            sharedObjectRenderers[resolvedData.attributes.type](resolvedData, (data) => (
                <DynamicDataView data={data} sharedObjectRenderers={sharedObjectRenderers} />
            ))
        );
    }

    return <Stack>Unrecognized kind of Fluid data: {resolvedData.toString()}</Stack>;
}

export interface RecordDataViewProps {
    data: Record<string, unknown>;
    sharedObjectRenderers: SharedObjectRendererOptions;
}

export function RecordDataView(props: RecordDataViewProps): React.ReactElement {
    const { data, sharedObjectRenderers } = props;

    const entries = Object.entries(data);
    return (
        <Stack>
            {entries.map(([key, value]) => (
                <StackItem key={key}>
                    <DynamicDataView data={value} sharedObjectRenderers={sharedObjectRenderers} />
                </StackItem>
            ))}
        </Stack>
    );
}
