/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import Button from "@material-ui/core/Button";
import { makeStyles, Theme } from "@material-ui/core/styles";
import TextField from "@material-ui/core/TextField";
import classNames from "classnames";
import React from "react";
import { LoadingButton } from "./LoadingButton";
import { SvgIcon } from "./SVGIcon";
import { ErrorPopup } from "./ErrorPopup";
import { iconHeight, iconWidth } from "./constants";

const useStyles = makeStyles((theme: Theme) => ({
  bold: {
    fontWeight: theme.typography.fontWeightBold,
  },
  bottomMargin: {
    marginBottom: theme.spacing(1),
  },
  cancelButton: {
    marginRight: theme.spacing(1),
  },
  container: {
    backgroundColor: "#F5F5F5",
    border: "1px solid #EEEEEE",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    padding: theme.spacing(2),
  },
  horizontal: {
    alignItems: "center",
    display: "flex",
  },
  italic: {
    fontStyle: "italic",
  },
  root: {
    "& .MuiOutlinedInput-root": {
      "& input": {
        fontWeight: "normal",
        padding: "5px",
      },
    },
  },
  textField: {
    backgroundColor: theme.palette.background.default,
    flexGrow: 1,
    height: "100%",
    marginBottom: 0,
    marginRight: theme.spacing(2),
    marginTop: 0,
  },
  textFieldInput: {
    fontSize: "12px",
    height: "100%",
  },
}), { name: "EditReferencePath" });

interface IEditReferencePathProps {
  onCancel: () => void;
  onEdit: (newPath: string) => Promise<any>;
  name: string;
  path: string;
}

export const EditReferencePath: React.FunctionComponent<IEditReferencePathProps
  & React.HTMLAttributes<HTMLDivElement>> = ({ onCancel, onEdit, name, path, className, ...restProps }) => {
  const classes = useStyles();
  const [newPath, setNewPath] = React.useState(path);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
   setNewPath(event.target.value);
  };

  const handleEdit = async () => {
    return ErrorPopup(onEdit.bind(null, newPath));
  };

  React.useEffect(() => {
    if (inputRef && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <div className={classNames(classes.container, className)} {...restProps}>
      <div className={classNames(classes.horizontal, classes.bottomMargin)}>
        <SvgIcon
          width={iconWidth}
          height={iconHeight}
          svgId="reference-24"
        />
        <span className={classes.bold}>
          Modifying the reference path for <span className={classes.italic}>{name}</span>
        </span>
      </div>
      <div className={classes.horizontal}>
        <TextField
          inputRef={inputRef}
          classes={{ root: classes.root }}
          className={classes.textField}
          id="outlined-bare"
          onChange={handleInputChange}
          onKeyPress={(event) => {
            if (event.key === "Enter") {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              handleEdit();
            }
          }}
          placeholder={path}
          margin="normal"
          variant="outlined"
          InputProps={{
            className: classes.textFieldInput,
          }}
        />
        <Button
          color="primary"
          variant="outlined"
          className={classes.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <LoadingButton
          variant="contained"
          color="primary"
          onClick={handleEdit}
        >
          Edit
        </LoadingButton>
      </div>
    </div>
  );
};
