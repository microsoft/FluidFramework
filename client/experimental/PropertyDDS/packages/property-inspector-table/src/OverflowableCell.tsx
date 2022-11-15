/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles, Tooltip } from "@material-ui/core";
import * as React from "react";

const useStyles = makeStyles({
  tooltip: {
    overflowWrap: "break-word",
    wordWrap: "break-word",
  },
  wrappedCell: {
    flexGrow: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "1px", /* flexGrow overrides the width. Need this to not exceed the vailable space */
  },
}, { name: "OverflowableCell" });

interface IOverflowCellProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * text content of the cell
   */
  cellContent: string;
}

export const OverflowableCell: React.FunctionComponent<IOverflowCellProps> = (props) => {
  const [allowTooltip, setAllowTooltip] = React.useState(false);
  const divRef = React.createRef<HTMLDivElement>();
  const classes = useStyles();

  React.useEffect(() => {
    if (!allowTooltip && divRef.current && divRef.current.scrollWidth > divRef.current.clientWidth) {
      setAllowTooltip(true);
    } else if (allowTooltip
      && divRef.current
      && divRef.current.scrollWidth <= divRef.current.clientWidth) {
      setAllowTooltip(false);
    }
  });

  if (allowTooltip) {
    return (
      <Tooltip title={props.cellContent} enterDelay={800} classes={{ tooltip: classes.tooltip }}>
        <div id="overflowableDiv" ref={divRef} className={classes.wrappedCell}>
          {props.cellContent}
        </div>
      </Tooltip>
    );
  }
  return (
    <div id="overflowableDiv" ref={divRef} className={classes.wrappedCell}>
      {props.cellContent}
    </div>
  );
};
