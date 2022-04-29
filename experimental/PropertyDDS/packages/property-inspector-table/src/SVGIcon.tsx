/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/core";
import classNames from "classnames";
import * as React from "react";

import { iconBaseColor, iconHoverColor, iconSelectColor } from "./constants";

const useStyles = makeStyles({
  svgIcon: (props: ISvgIconProps) => ({
    "&.hoverableSvgIcon": {
      "cursor": "pointer",
      "pointer-events": "auto",
    },
    "&:hover:not(.activeSvgIcon)": {
      fill: iconHoverColor,
    },
    "fill": props.fill ? props.fill : (props.active ? iconSelectColor : iconBaseColor),
    "pointer-events": "none",
    "vertical-align": "middle",
  }),
}, { name: "SvgIcon" });

export interface ISvgIconProps extends React.SVGAttributes<any> {
  /**
   * A flag that indicates whether the svg is active (i.e. selected but not hovered).
   * The default style (e.g. fill color) can be customized by specifying 'activeClassName'.
   */
  active?: boolean;
  /**
   * The style of the svg icon when 'active' is `true`.
   */
  activeClassName?: string;
  /**
   * A flag that indicates whether the svg should be hoverable.
   * The default style (e.g. fill color) can be customized by providing an `&:hover:not(.activeSvgIcon)` section in the
   * class passed to 'className'.
   */
  hoverable?: boolean;
  /**
   * An svg id which corresponds to an svg file in the SVGStore
   */
  svgId: string;
}

/**
 * A svg icon component which relies on svg file that exits in the SVGStore component
 */
export const SvgIcon: React.FunctionComponent<ISvgIconProps> = (props) => {
  const classes = useStyles(props);
  const { active, activeClassName, className, hoverable = false, svgId, transform, width = "16px", height = "16px",
    ...otherProps } = props;
  const cx = classNames(classes.svgIcon, { hoverableSvgIcon: hoverable }, { activeSvgIcon: active },
    { [activeClassName!]: active }, className);

  return (
    <svg {...otherProps} className={cx} width={width} height={height}>
      <use xlinkHref={`#${ svgId }`} transform={transform} />
    </svg>
  );
};
