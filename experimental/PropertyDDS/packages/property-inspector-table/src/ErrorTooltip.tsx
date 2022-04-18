/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { makeStyles } from "@material-ui/core/styles";
import Tooltip, { TooltipProps } from "@material-ui/core/Tooltip";
import React from "react";
import { colorBlack } from "./constants";

const useArrowStyles = makeStyles({
  arrow: {
    "&::before": {
      borderStyle: "solid",
      content: '""',
      display: "block",
      height: 0,
      margin: "auto",
      width: 0,
    },
    "fontSize": 6,
    "height": "3em",
    "position": "absolute",
    "width": "3em",
  },
  popper: generateArrow(colorBlack),
  tooltip: {
    backgroundColor: colorBlack,
    position: "relative",
  },
  tooltipPlacementBottom: {
    margin: "8px 0",
  },
  tooltipPlacementLeft: {
    margin: "0 8px",
  },
  tooltipPlacementRight: {
    margin: "0 8px",
  },
  tooltipPlacementTop: {
    margin: "16px 0",
  },
}, { name: "ErrorTooltip" });

function generateArrow(color: string) {
  return {
    '&[x-placement*="bottom"] $arrow': {
      "&::before": {
        borderColor: `transparent transparent ${color} transparent`,
        borderWidth: "0 1em 1em 1em",
      },
      "height": "1em",
      "left": 0,
      "marginTop": "-0.95em",
      "top": 0,
      "width": "3em",
    },
    '&[x-placement*="left"] $arrow': {
      "&::before": {
        borderColor: `transparent transparent transparent ${color}`,
        borderWidth: "1em 0 1em 1em",
      },
      "height": "3em",
      "marginRight": "-0.95em",
      "right": 0,
      "width": "1em",
    },
    '&[x-placement*="right"] $arrow': {
      "&::before": {
        borderColor: `transparent ${color} transparent transparent`,
        borderWidth: "1em 1em 1em 0",
      },
      "height": "3em",
      "left": 0,
      "marginLeft": "-0.95em",
      "width": "1em",
    },
    '&[x-placement*="top"] $arrow': {
      "&::before": {
        borderColor: `${color} transparent transparent transparent`,
        borderWidth: "1em 1em 0 1em",
      },
      "bottom": 0,
      "height": "1em",
      "left": 0,
      "marginBottom": "-0.95em",
      "width": "3em",
    },
  };
}

export const ErrorTooltip: React.FunctionComponent<TooltipProps> = (props) => {
  const { arrow, ...classes } = useArrowStyles();
  const [arrowRef, setArrowRef] = React.useState<HTMLSpanElement | null>(null);

  return (
    <Tooltip
      classes={classes}
      PopperProps={{
        popperOptions: {
          modifiers: {
            arrow: {
              element: arrowRef,
              enabled: Boolean(arrowRef),
            },
          },
        },
      }}
      {...props}
      title={
        <React.Fragment>
          {props.title}
          <span className={arrow} ref={setArrowRef} />
        </React.Fragment>
      }
    />
  );
};
