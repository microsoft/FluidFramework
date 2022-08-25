/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Tooltip from "@material-ui/core/Tooltip";
import * as React from "react";
import { Field } from "./Field";
import { IEditableValueCellProps } from "./InspectorTableTypes";

export const TooltipedField: React.FunctionComponent<IEditableValueCellProps & {
  message: string;
  classes: Record<"container" | "tooltip" | "info" | "input" | "textField", string>;
}> = ({ message, ...props }) => {
  const { classes } = props;

  return (
    <Tooltip
      enterDelay={500}
      classes={{
        tooltip: classes.tooltip,
      }}
      placement="left"
      title={message}
    >
      <span style={{ width: "100%" }}>
        <Field {...props} />
      </span>
    </Tooltip>
  );
};
