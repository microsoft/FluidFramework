/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerProperty } from "@fluid-experimental/property-properties";
import TextField, { TextFieldProps } from "@material-ui/core/TextField";
import * as React from "react";
import { IEditableValueCellProps } from "../EditableValueCell";
import { IInspectorRow } from "../InspectorTableTypes";
import { getPropertyValue } from "../utils";

type NumberProps = (IEditableValueCellProps & {
  onSubmit: (val: number, props: IEditableValueCellProps) => void;
  rowData: IInspectorRow & { value: number; };
  TextFieldProps: TextFieldProps;
  classes: Record<"container" | "tooltip" | "info" | "input" | "textField", string>;
});

type HandleKeyDownType = (
  event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  props: NumberProps,
) => void;

const handleKeyDown: HandleKeyDownType = (event, props) => {
  if (event.keyCode === 13) {
    props.onSubmit(parseFloat(event.currentTarget.value), props);
  }
};

export const NumberView: React.FunctionComponent<NumberProps> = (props) => {
  const {
    iconRenderer,
    followReferences,
    TextFieldProps: textFieldProps,
    rowData,
    onBlur = (event) => { onSubmit(event.currentTarget.value as any, props); },
    onKeyDown = ((event) => { handleKeyDown(event, props); }),
    onSubmit,
    classes,
    readOnly,
    ...restProps // tslint:disable-line:trailing-comma
  } = props;

  const value = getPropertyValue(rowData.parent as ContainerProperty, rowData.name, rowData.context, rowData.typeid,
    followReferences);

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    <TextField
      {...restProps}
      type="number"
      key={`${rowData.id}${value}`}
      onBlur={onBlur}
      defaultValue={value}
      className={classes.textField}
      disabled={rowData.isConstant || rowData.parentIsConstant || readOnly}
      InputProps={{
        onKeyDown,
        style: {
          alignItems: "center",
          fontSize: "13px",
        },
      }}
      {...textFieldProps}
    />
  );
};
