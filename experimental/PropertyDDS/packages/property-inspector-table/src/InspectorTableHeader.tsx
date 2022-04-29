/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { makeStyles } from "@material-ui/styles";
import { IInspectorTableProps } from "./InspectorTableTypes";

import { SearchBox } from "./SearchBox";

const useStyles = makeStyles({
  buttonGroup: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-end",
  },
  root: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-end",
    width: "100%",
  },
}, { name: "InspectorTableHeader" });

export const InspectorTableHeader: React.FunctionComponent<Partial<IInspectorTableProps>> = ({ searchBoxProps }) => {
  const classes = useStyles();
  return (
    <div className={classes.root} >
      <div className={classes.buttonGroup}>
        <SearchBox {...searchBoxProps} />
      </div>
    </div>
  );
};
