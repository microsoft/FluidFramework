/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { SvgIcon } from "./SVGIcon";
import { iconHeight, iconWidth } from "./constants";
import { IInspectorRow } from "./InspectorTableTypes";

const typeIdToColor = {
  Bool: "#9FC966",
  Default: "#6784A6",
  Enum: "#EC4A41",
  Float32: "#32BCAD",
  Float64: "#32BCAD",
  Int16: "#32BCAD",
  Int32: "#32BCAD",
  Int64: "#32BCAD",
  Int8: "#32BCAD",
  String: "#0696D7",
  Uint16: "#32BCAD",
  Uint32: "#32BCAD",
  Uint64: "#32BCAD",
  Uint8: "#32BCAD",
  array: "#B385F2",
  enum: "#EC4A41",
  map: "#FAA21B",
  set: "#4679B9",
};

export const typeidToIconMap = {
  Array: <SvgIcon svgId={"array-24"} height={iconHeight} width={iconWidth} />,
  Bool: <SvgIcon svgId={"boolean-24"} height={iconHeight} width={iconWidth} />,
  Enum: <SvgIcon svgId={"enum-24"} height={iconHeight} width={iconWidth} />,
  Float32: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Float64: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Int16: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Int32: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Int64: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Int8: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Map: <SvgIcon svgId={"map-24"} height={iconHeight} width={iconWidth} />,
  Reference: <SvgIcon svgId={"reference-24"} height={iconHeight} width={iconWidth} fill={typeIdToColor.Default}/>,
  Set: <SvgIcon svgId={"set-24"} height={iconHeight} width={iconWidth} />,
  Single: <SvgIcon svgId={"singleproperty-24"} height={iconHeight} width={iconWidth} />,
  String: <SvgIcon svgId={"string-24"} height={iconHeight} width={iconWidth} />,
  Uint16: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Uint32: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Uint64: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
  Uint8: <SvgIcon svgId={"number-24"} height={iconHeight} width={iconWidth} />,
};

/**
 * returns the icon corresponding to a typeid
 * @param inTypeid - the property typeid
 * @return the Svg Icon corresponding to the typeid in the map
 */
export const getIconFromTypeId = (inTypeid): React.ReactNode => {
  if (inTypeid.includes("enum<")) {
    inTypeid = "Enum";
  }
  return typeidToIconMap[inTypeid] || <SvgIcon svgId={"propertyset-24"} height={iconHeight} width={iconWidth} />;
};

/**
 * Returns the default inspector table icon based on the row data.
 * @param rowData - The row data.
 */
export const getDefaultInspectorTableIcons = (rowData: IInspectorRow): React.ReactNode => {
  let icon;
  if (rowData.isReference) {
    let color = typeIdToColor.Default;
    if (rowData.context !== "single") {
      color = typeIdToColor[rowData.context];
    } else if (rowData.typeid.includes("enum<")) {
      color = typeIdToColor.enum;
    } else if (rowData.typeid in typeIdToColor) {
      color = typeIdToColor[rowData.typeid];
    }
    icon = <SvgIcon svgId={"reference-24"} height={iconHeight} width={iconWidth} fill={color} />;
  } else {
    switch (rowData.context) {
      case "array":
        icon = typeidToIconMap.Array;
        break;
      case "map":
        icon = typeidToIconMap.Map;
        break;
      case "set":
        icon = typeidToIconMap.Set;
        break;
      default:
        icon = getIconFromTypeId(rowData.typeid);
        break;
    }
  }
  return icon as React.ReactNode;
};
