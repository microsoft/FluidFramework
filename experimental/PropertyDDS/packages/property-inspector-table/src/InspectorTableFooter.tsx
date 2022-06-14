/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/styles";
import * as React from "react";
import {
  icon24,
  iconBaseColor,
  iconHoverColor,
} from "./constants";

import { SvgIcon } from "./SVGIcon";

import { IInspectorTableProps } from "./InspectorTableTypes";

const useStyles = makeStyles((theme) => ({
  footer: {
    alignItems: "center",
    display: "flex",
    fontFamily: "ArtifaktElement, Helvetica, Arial",
    fontSize: "12px",
    height: "100%",
    justifyContent: "space-between",
    paddingLeft: "23px",
    paddingRight: "16px",
  },
  footerButtonContainer: {
    "&:hover": {
      color: iconHoverColor,
      fill: iconHoverColor,
      stroke: iconHoverColor,
    },
    "alignItems": "center",
    "color": iconBaseColor,
    "cursor": "pointer",
    "display": "flex",
    "fill": iconBaseColor,
    "stroke": iconBaseColor,
  },
  label: {
    display: "inline-flex",
  },
  svg: {
    margin: "8px",
  },
  svgFooterContainer: {
    alignItems: "center",
    display: "flex",
  },
}), { name: "InspectorTableFooter" });

interface IInspectorTableFooterProps {
  handleExpandAll: (IInspectorTableProps) => void;
  handleCollapseAll: () => void;
  parentProps: IInspectorTableProps;
  path?: string;
}

export const InspectorTableFooter: React.FunctionComponent<IInspectorTableFooterProps> = (props) => {
  const { handleExpandAll, handleCollapseAll, parentProps, path } = props;
  const classes = useStyles();
  return (
    <div className={classes.footer}>
      <div>
        {path}
      </div>
      <div className={classes.svgFooterContainer}>
        <div
          className={classes.footerButtonContainer}
          onClick={() => { handleExpandAll(parentProps); }}
        >
          <span>Expand All</span>
          <div
            id="expandAllButton"
            className={classes.svg}
          >
            <SvgIcon
              svgId={"expand-all"}
              activeClassName={classes.footerButtonContainer}
              width={icon24}
              height={icon24}
              hoverable
            />
          </div>
        </div>
        <div
          className={classes.footerButtonContainer}
          onClick={() => { handleCollapseAll(); }}
        >
          <span>Collapse All</span>
          <div
            id="collapseAllButton"
            className={classes.svg}
          >
            <SvgIcon
              svgId={"collapse-all"}
              activeClassName={classes.footerButtonContainer}
              width={icon24}
              height={icon24}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

InspectorTableFooter.defaultProps = {
  path: "",
};
