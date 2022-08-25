/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { createStyles, withStyles, WithStyles } from "@material-ui/core/styles";
import classNames from "classnames";
import * as React from "react";
import { SvgIcon } from "./SVGIcon";

const styles = () => createStyles({
  centered: {
    marginBottom: "12px",
    textAlign: "center",
  },
  icon: {
    marginBottom: "16px",
  },
  large: {
    fontSize: "24px",
  },
  root: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
  },
});

interface IIconSize {
  /**
   * The height of the icon;
   */
  height: string;
  /**
   * The width of the icon;
   */
  width: string;
}

interface IEmptyProps {
  /**
   * A description/more detailed explanation of the message.
   */
  description: string | React.ReactNode;
  /**
   * The id of the icon to show.
   */
  iconId: string;
  /**
   * The size of the icon.
   */
  iconSize: IIconSize;
  /**
   * The message to be displayed.
   */
  message: string;
}

export const defaultIconSize: IIconSize = {
  height: "166px",
  width: "294px",
};

export const iconAspectRatio: number = parseFloat(defaultIconSize.width) /
  parseFloat(defaultIconSize.height);

export const computeIconSize = (width: number): IIconSize => (width * 0.5 >= parseFloat(defaultIconSize.width) ?
  defaultIconSize :
    {
      height: `${ (width * 0.5) / iconAspectRatio }px`,
      width: `${ width * 0.5 }px`,
    }
);

const Empty: React.FunctionComponent<IEmptyProps & WithStyles<typeof styles>> = (props) => {
  const { description, iconId, iconSize, message } = props;
  return (
    <div className={classNames(props.classes.root)}>
      <SvgIcon svgId={iconId} {...iconSize} className={props.classes.icon}/>
      <span className={classNames(props.classes.large, props.classes.centered)}>
        {message}
      </span>
      <div className={props.classes.centered}>
        {description}
      </div>
    </div>
  );
};

const StyledEmpty = withStyles(styles, { name: "Empty" })(Empty);
export { StyledEmpty as Empty };
