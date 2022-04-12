/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { makeStyles } from "@material-ui/core/styles";
import * as React from "react";

const useStyles = makeStyles({
  chip: (props: IChipProps) => ({
    border: "1px solid",
    borderColor: "inherit",
    borderRadius: 10,
    height: props.height || 20,
    marginRight: "10px",
    overflow: "hidden",
    paddingLeft: 8,
    paddingRight: 8,
    textOverflow: "ellipsis",
  }),
}, { name: "CustomChip" });

interface IChipProps {
  height?: number;
  label: string;
  className: string;
}

export const CustomChip: React.FunctionComponent<IChipProps> = (props) => {
  const classes = useStyles(props);
  return (
    <span className={`${classes.chip} ${props.className}`}>
      {props.label}
    </span>
  );
};
