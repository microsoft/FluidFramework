/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/core/styles";
import classNames from "classnames";
import React from "react";
import { iconHeight, iconMarginRight, iconWidth, unit } from "./constants";
import * as TableIcons from "./icons";

const useStyles = makeStyles({
  svgIcon: {
    flexShrink: 0,
    height: iconHeight,
    marginLeft: "10px",
    marginRight: `${iconMarginRight}${unit}`,
    width: iconWidth,
  },
}, { name: "TypeIcon" });

export const TypeIcon: React.FunctionComponent<{ typeId: string }> = ({ typeId }) => {
  const classes = useStyles();
  return (
    <div className={classNames(classes.svgIcon)}>
      {TableIcons.getIconFromTypeId(typeId)}
    </div>
  );
};
