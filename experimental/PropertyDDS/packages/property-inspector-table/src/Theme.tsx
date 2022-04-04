/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "@hig/fonts/build/ArtifaktElement.css";
import { createTheme } from "@material-ui/core/styles";
import { ToggleButtonClassKey } from "@material-ui/lab/ToggleButton";

declare module "@material-ui/core/styles/overrides" {
  // tslint:disable-next-line
  interface ComponentNameToClassKey {
    MuiToggleButton: ToggleButtonClassKey;
  }
}

export const theme = createTheme({

  overrides: {
    MuiButton: {
      root: {
        borderRadius: "2px",
      },
    },
    MuiToggleButton: {
      root: {
        "&:not(:first-child)": {
          borderLeft: "auto",
          marginLeft: "auto",
        },
      },
    },
  },
  palette: {
    primary: {
      contrastText: "#fff",
      main: "#0696d7",
    },
  },

  props: {
    // The ripple effect is exclusively coming from the BaseButton component
    // You can disable the ripple effect globally by providing the following in your theme:
    // Name of the component
    MuiButtonBase: {
      disableRipple: true, // No more ripple, on the whole application!
    },
  },
  // You can disable transitions globally by providing the following in your theme:
  transitions: {
    // So we have `transition: none;` everywhere
    create: () => "none",
  },
  typography: {
    button: {
      textTransform: "none",
    },
    fontFamily: "ArtifaktElement, Helvetica, Arial",
    // useNextVariants: true,
  },
});
