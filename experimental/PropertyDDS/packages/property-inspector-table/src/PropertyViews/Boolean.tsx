/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerProperty } from "@fluid-experimental/property-properties";
import Switch, { SwitchProps } from "@material-ui/core/Switch";
import * as React from "react";
import {
	IEditableTreeRow,
	IEditableValueCellProps,
	IInspectorRow,
	isEditableTreeRow,
} from "../InspectorTableTypes";
import { getPropertyValue } from "../propertyInspectorUtils";

type BooleanProps = IEditableValueCellProps & {
	onSubmit: (val: boolean, props: IEditableValueCellProps) => void;
	SwitchProps: SwitchProps;
	rowData: (IInspectorRow | IEditableTreeRow) & { value: boolean };
};

export const BooleanView: React.FunctionComponent<BooleanProps> = (props) => {
	const { followReferences, onSubmit, SwitchProps: switchProps, rowData, readOnly } = props;

	const value = isEditableTreeRow(rowData)
		? rowData.value
		: getPropertyValue(
				rowData.parent as ContainerProperty,
				rowData.name,
				rowData.context,
				rowData.typeid,
				followReferences,
		  );

	return (
		<Switch
			color="primary"
			checked={value as boolean}
			onChange={(event) => onSubmit(event.target.checked, props)}
			value={rowData.name}
			disabled={readOnly}
			{...switchProps}
		/>
	);
};
