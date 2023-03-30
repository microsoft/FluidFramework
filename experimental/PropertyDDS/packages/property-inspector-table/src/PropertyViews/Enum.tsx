/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ContainerProperty, EnumArrayProperty } from "@fluid-experimental/property-properties";
import MenuItem from "@material-ui/core/MenuItem";
import Select, { SelectProps } from "@material-ui/core/Select";
import * as React from "react";
import { IEditableValueCellProps, IInspectorRow, isEditableTreeRow } from "../InspectorTableTypes";
import { Utils } from "../typeUtils";
import { getPropertyValue } from "../propertyInspectorUtils";

type ValType = string | number | boolean;

type EnumProps = IEditableValueCellProps & {
	onSubmit: (val: ValType, props: IEditableValueCellProps) => void;
	SelectProps: SelectProps;
	classes: Record<"container" | "tooltip" | "info" | "input" | "textField", string>;
};

type GetOptionsType = (rowData: IInspectorRow) => string[];

const getOptions: GetOptionsType = (rowData) => {
	const enumObj: EnumArrayProperty = Utils.isEnumArrayProperty(rowData.parent!)
		? rowData.parent
		: (rowData.parent! as ContainerProperty).get(rowData.name)!;

	return Object.keys((enumObj as any)._enumDictionary.enumEntriesById);
};

export const EnumView: React.FunctionComponent<EnumProps> = (props) => {
	const {
		followReferences,
		SelectProps: selectProps,
		rowData,
		onSubmit,
		classes,
		readOnly,
	} = props;

	assert(!isEditableTreeRow(rowData), `"Enums" are currently not supported by the SharedTree`);

	const options = getOptions(rowData);
	const value = getPropertyValue(
		rowData.parent as ContainerProperty,
		rowData.name,
		rowData.context,
		rowData.typeid,
		followReferences,
	);

	return (
		<Select
			key={`${rowData.id}${value}`}
			onChange={(event) => onSubmit(event.target.value as ValType, props)}
			value={value}
			disabled={rowData.isConstant || rowData.parentIsConstant || readOnly}
			className={classes.textField}
			{...selectProps}
		>
			{options.map((option, index) => (
				<MenuItem key={index} value={option}>
					{option}
				</MenuItem>
			))}
		</Select>
	);
};
