/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createStyles, withStyles, WithStyles } from "@material-ui/core/styles";
import classNames from "classnames";

import * as React from "react";
import { SvgIcon } from "./SVGIcon";

import { iconHeight, iconMarginRight, iconWidth, unit } from "./constants";

const styles = () => createStyles({
  row: {
    alignItems: "center",
    display: "flex",
    marginBottom: "5px",
  },
  svgIcon: {
    marginRight: `${iconMarginRight}${unit}`,
  },
});

export interface INewDataRowProps {
  /**
   * The data type to be added: Asset, Component or Property
   */
  dataType: string;
  /**
   * Callback that is invoked if the row is clicked.
   */
  onClick: () => void;
}

class NewDataRow extends React.Component<INewDataRowProps & WithStyles<typeof styles>> {
  public render() {
    const { classes } = this.props;
    return (
      <div className={classNames(classes.row)} onClick={this.props.onClick}>
        <SvgIcon
          svgId={"plus-24"}
          height={iconHeight}
          width={iconWidth}
          className={classNames(classes.svgIcon)}
        />
        New {this.props.dataType}...
      </div>);
  }
}

const styledNewDataRow = withStyles(styles, { name: "NewDataRow" })(NewDataRow);
export { styledNewDataRow as NewDataRow };
