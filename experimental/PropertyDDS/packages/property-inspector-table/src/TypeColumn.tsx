/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";
import * as React from "react";
import { CustomChip } from "./CustomChip";
import { IInspectorRow } from "./InspectorTableTypes";

const useStyles = makeStyles({
  boolColor: {
    color: "#9FC966",
  },
  constAndContextColor: {
    color: "#6784A6",
    flex: "none",
  },
  defaultColor: {
    color: "#808080",
  },
  enumColor: {
    color: "#EC4A41",
    flex: "none",
  },
  numberColor: {
    color: "#32BCAD",
  },
  referenceColor: {
    color: "#6784A6",
  },
  stringColor: {
    color: "#0696D7",
  },
  tooltip: {
    backgroundColor: "black",
    maxWidth: "100vw",
    overflow: "hidden",
    padding: "4px 8px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typesBox: {
    display: "flex",
    width: "100%",
  },
}, { name: "TypeColumn" });

interface ITypeColumn {
  rowData: IInspectorRow;
}

export const TypeColumn: React.FunctionComponent<ITypeColumn> = ({ rowData }) => {
  const classes = useStyles();
  const mapTypeToColor = {
    Bool: classes.boolColor,
    Float32: classes.numberColor,
    Float64: classes.numberColor,
    Int16: classes.numberColor,
    Int32: classes.numberColor,
    Int64: classes.numberColor,
    Int8: classes.numberColor,
    String: classes.stringColor,
    Uint16: classes.numberColor,
    Uint32: classes.numberColor,
    Uint64: classes.numberColor,
    Uint8: classes.numberColor,
    enum: classes.enumColor,
  };

  let context = rowData.context;
  let typeid = rowData.typeid;
  let additionalType;
  if (context !== "single") {
    [context, typeid, additionalType] = rowData.typeid.split("<");
  } else {
    [typeid, additionalType] = rowData.typeid.split("<");
  }
  typeid = typeid.replace(/>/g, "");
  additionalType = additionalType && additionalType.replace(/>/g, "") !== "Enum" ?
    additionalType.replace(/>/g, "") : undefined;
  return (
    <Tooltip
      enterDelay={500}
      placement="top"
      classes={{ tooltip: classes.tooltip }}
      title={rowData.typeid}
    >
      <div className={classes.typesBox}>
        {rowData.isConstant ? <CustomChip label={"const"} className={classes.constAndContextColor} /> : null}
        {
          (context && context !== "single")
          ? <CustomChip label={context} className={classes.constAndContextColor} />
          : null
        }
        <CustomChip
          label={typeid}
          className={typeid in mapTypeToColor ? mapTypeToColor[typeid] : classes.defaultColor}
        />
        {additionalType ? <CustomChip label={additionalType} className={classes.defaultColor} /> : null}
        {rowData.isReference && typeid !== "Reference" ?
          <CustomChip label={"Reference"} className={classes.defaultColor} /> : null}
      </div>
    </Tooltip>
  );
};

export const useChipStyles = useStyles;
