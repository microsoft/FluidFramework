/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Button, { ButtonProps } from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import { makeStyles } from "@material-ui/core/styles";
import React, { useEffect, useState } from "react";

const useStyles = makeStyles({
  buttonProgress: {
    position: "absolute",
  },
  wrapper: {
    alignItems: "center",
    display: "inline-flex",
    justifyContent: "center",
    position: "relative",
  },
}, { name: "LoadingButton" });

interface ILoadingButtonProps extends ButtonProps {
  onClick: () => Promise<any>;
  forwardedRef?: any;
}

interface ILoadingButtonState {
  progress: boolean;
}

const LoadingButton: React.FunctionComponent<ILoadingButtonProps> =
  ({ children, disabled, forwardedRef, onClick, ...restProps }) => {
  let isMounted: boolean;
  const classes = useStyles();

  const [state, setState] = useState<ILoadingButtonState>({ progress: false });

  useEffect(() => {
    isMounted = true;
    return () => { isMounted = false; };
  }, []);

  const handleClick = () => {
    setState({ progress: true });
    onClick().finally(() => isMounted && setState({ progress: false }));
  };

  return (
    <div className={classes.wrapper}>
      <Button ref={forwardedRef} disabled={disabled || state.progress} onClick={handleClick} {...restProps} >
        {children}
      </Button>
      {state.progress && <CircularProgress size={24} className={classes.buttonProgress} />}
    </div>
  );
};

const ForwardedLoadingButton = React.forwardRef((props: ILoadingButtonProps, ref) => {
  return <LoadingButton {...props} forwardedRef={ref}/>;
});

export { ForwardedLoadingButton as LoadingButton };
