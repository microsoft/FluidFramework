/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerProperty } from "@fluid-experimental/property-properties";
import TextField, { TextFieldProps } from "@material-ui/core/TextField";
import * as React from "react";
import { IEditableValueCellProps } from "../EditableValueCell";
import { getPropertyValue } from "../utils";

type StringProps = (IEditableValueCellProps & {
  onSubmit: (val: string, props: IEditableValueCellProps) => void;
  TextFieldProps: TextFieldProps;
  classes: Record<"container" | "tooltip" | "info" | "input" | "textField", string>;
});

type HandleKeyDownType = (
  event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  props: StringProps,
) => void;

const handleKeyDown: HandleKeyDownType = (event, props) => {
  if (event.keyCode === 13) {
    props.onSubmit(event.currentTarget.value, props);
  }
};

export const StringView: React.FunctionComponent<StringProps> = (props) => {
  const {
    followReferences,
    TextFieldProps: textFieldProps,
    rowData,
    onBlur = (event) => { onSubmit(event.currentTarget.value, props); },
    onKeyDown = ((event) => { handleKeyDown(event, props); }),
    onSubmit,
    classes,
    readOnly,
  } = props;

  const value = getPropertyValue(rowData.parent as ContainerProperty, rowData.name, rowData.context, rowData.typeid,
    followReferences);

  return (
    <TextField
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
