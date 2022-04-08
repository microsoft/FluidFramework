/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyProxy, ProxifiedMapProperty } from "@fluid-experimental/property-proxy";
import { SetProperty, ContainerProperty } from "@fluid-experimental/property-properties";
import * as React from "react";
import { IEditableValueCellProps } from "./EditableValueCell";
import { BooleanView } from "./PropertyViews/Boolean";
import { EnumView } from "./PropertyViews/Enum";
import { NumberView } from "./PropertyViews/Number";
import { StringView } from "./PropertyViews/String";
import { Utils } from "./typeUtils";

function onInlineEditEnd(val: string | number | boolean, props: IEditableValueCellProps) {
    const { rowData } = props;
    // Convert to number if it is possible and the type is not an integer with 64 bits.
    if (rowData.typeid !== "Uint64" && rowData.typeid !== "Int64" && rowData.typeid !== "String") {
        val = !isNaN(+val) ? +val : val;
    }

    const proxiedParent = PropertyProxy.proxify(rowData.parent!);
    const parentContext = rowData.parent!.getContext();
    try {
        if (parentContext === "single" || parentContext === "array") {
            // TODO: Temporary workaround, as enum arrays currently are not considered primitive.
            if (Utils.isEnumArrayProperty(rowData.parent!)) {
                (rowData.parent! as any).set(parseInt(rowData.name, 10), val);
            } else {
                proxiedParent[rowData.name] = val;
            }
        } else if (parentContext === "map") {
            // This is safe since we know the input property in PropertyProxy.proxify was of type MapProperty
            // since the parents context was of type "map"
            (proxiedParent as unknown as ProxifiedMapProperty).set(rowData.name, val);
        } else if (parentContext === "set") {
            (rowData.parent! as SetProperty).get(rowData.name)!.value = val;
        }
        rowData.parent!.getRoot().getWorkspace()!.commit();
    } catch (error) {
        console.error(error);
    }
}

const typeToViewMap = {
    Bool: BooleanView,
    String: StringView,
    enum: EnumView,

    Float32: NumberView,
    Float64: NumberView,
    Int16: NumberView,
    Int32: NumberView,
    Int64: NumberView,
    Int8: NumberView,
    Uint16: NumberView,
    Uint32: NumberView,
    Uint64: NumberView,
    Uint8: NumberView,
};

export const Field: React.FunctionComponent<IEditableValueCellProps> = ({ rowData, ...restProps }) => {
    const parent = rowData.parent!;
    let typeid = rowData.typeid;
    let property;

    try {
        property = (rowData.parent! as ContainerProperty).get(rowData.name);
    } catch {
        typeid = "Reference";
    }
    if (Utils.isEnumProperty(property) || Utils.isEnumArrayProperty(parent!)) {
        typeid = "enum";
    }

    // eslint-disable-next-line no-prototype-builtins
    const ViewComponent: React.ComponentType<any> = typeToViewMap.hasOwnProperty(typeid)
        ? typeToViewMap[typeid]
        : StringView;

    return (
        <ViewComponent
            onSubmit={onInlineEditEnd}
            rowData={rowData}
            {...restProps}
        />
    );
};
