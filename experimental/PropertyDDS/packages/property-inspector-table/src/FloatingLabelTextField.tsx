/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { withStyles, WithStyles } from "@material-ui/core/styles";
import TextField, { StandardTextFieldProps } from "@material-ui/core/TextField";
import classNames from "classnames";
import React from "react";
import { SvgIcon } from "./SVGIcon";

const styles = (theme) => ({
  error: {
    color: `${theme.palette.text.secondary} !important`,
  },
  floatingFormControl: {
    flexGrow: 2,
    justifyContent: "center",
    marginRight: "10px",
  },
  horizontalContainer: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
  },
  warningIconContainer: {
    marginTop: 10,
  },
});

interface IFloatingLabelTextFieldProps extends StandardTextFieldProps {
  onChange?: (string) => void;
  helperTextVisible?: boolean;
}

const FloatingLabelTextField: React.FunctionComponent<IFloatingLabelTextFieldProps & WithStyles<typeof styles>> =
(props) => {
  const { classes, error, helperTextVisible, className, onChange,
    FormHelperTextProps, InputLabelProps, ...restProps } = props;

  const changeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange!(event.target.value);
  };

  return (
    <div className={classes.horizontalContainer}>
    <TextField
      onChange={changeHandler}
      margin="dense"
      className={classNames(classes.floatingFormControl, className)}
      FormHelperTextProps={{
        classes: { error: classes.error },
        style: { visibility: helperTextVisible ? "visible" : "hidden" },
        ...FormHelperTextProps,
      }}
      error={error}
      InputLabelProps={{ classes: { error: classes.error }, ...InputLabelProps }}
      {...restProps}
    />
    <div className={classes.warningIconContainer}>
      <SvgIcon
        style={{ visibility: error ? "visible" : "hidden" }}
        width="20px"
        height="20px"
        svgId="warning-16"
      />
    </div>
    </div>
  );
};

FloatingLabelTextField.defaultProps = {
  helperTextVisible: true,
};

const StyledFloatingLabelTextField = withStyles(styles, { name: "FloatingLabelTextField" })(FloatingLabelTextField);
export { StyledFloatingLabelTextField as FloatingLabelTextField };
