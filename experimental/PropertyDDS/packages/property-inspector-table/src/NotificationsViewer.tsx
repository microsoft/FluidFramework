/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import IconButton from "@material-ui/core/IconButton";
import Snackbar, { SnackbarProps } from "@material-ui/core/Snackbar";
import { createStyles, withStyles, WithStyles } from "@material-ui/core/styles";
import * as React from "react";
import { Omit } from "./constants";
import { SvgIcon } from "./SVGIcon";

const styles = (theme) => createStyles({
  close: {
    "&:hover": {
      backgroundColor: "transparent",
    },
    "padding": theme.spacing(0.5),
  },
  message: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  root: {
    backgroundColor: "rgb(255, 255, 255)",
    borderLeftColor: "rgb(6, 150, 215)",
    borderLeftStyle: "solid",
    borderLeftWidth: "3px",
    color: "rgb(60, 60, 60)",
    [theme.breakpoints.up("sm")]: {
      maxWidth: "568px",
    },
  },
});

export interface INotification {
  /**
   * Message to be displayed when a notification is pushed
   */
  message: string;
  /**
   * id to identify the children
   */
  id: string;
}

export interface INotificationContext {
  /**
   * The array of notifications available in the NotificationContext
   */
  notificationList: INotification[];
  /**
   * A method that removes a notification with a specific id from the notificationList
   * @param notificationId - The id pointing to the notification to be removed
   */
  removeNotification: (notificationId: string) => void;
  /**
   * A method that removes a notification with a specific index from the notificationList
   * @param notificationIndex - The id pointing to the notification to be removed
   */
  removeNotificationByIndex: (notificationIndex: number) => void;
  /**
   * A method that pushes the passed notification object to the notificationList
   * @param  notificationObject- -  The notification to be pushed
   */
  pushNotification: (notificationObject: Pick<INotification, "message">) => void;
}
const notificationList: INotification[] = [];
let idCounter = 0;
const generateNotificationId = () => (`${ idCounter++ }`);
export const notificationContext: INotificationContext = {
  notificationList,
  pushNotification: (notification) => { notificationList.push({ id: generateNotificationId(), ...notification }); },
  removeNotification: (id: string) => {
    const index = notificationList.findIndex((notification: INotification) => (notification.id === id));
    notificationList.splice(index, 1);
  },
  removeNotificationByIndex: (index) => { notificationList.splice(index, 1); },
};

notificationContext.pushNotification.bind(notificationContext);
notificationContext.removeNotification.bind(notificationContext);

class NotificationViewer extends React.Component<WithStyles<typeof styles> &
  Omit<SnackbarProps, "classes" | "open">,
  { open: boolean; messageInfo: string; } & Pick<INotificationContext, "notificationList">> {
  public static defaultProps = {
    autoHideDuration: 6000,
  };
  public state = { notificationList: notificationContext.notificationList, open: false, messageInfo: "" };

  public componentDidMount() {
    notificationContext.pushNotification = this.pushNotification;
    notificationContext.removeNotification = this.removeNotification;
    notificationContext.removeNotificationByIndex = this.removeNotificationByIndex;
  }

  public render() {
    const { classes, ...restProps } = this.props;
    const { open, messageInfo } = this.state;
    return (
      <Snackbar
        anchorOrigin={{
          horizontal: "right",
          vertical: "bottom",
        }}
        open={open}
        onClose={this.handleClose}
        onExited={this.handleExited}
        ContentProps={{
          "aria-describedby": "message-id",
          "classes": { root: classes.root, message: classes.message },
        }}
        message={<span id="message-id">{messageInfo}</span>}
        action={[
          <IconButton
            key="close"
            aria-label="Close"
            color="inherit"
            className={classes.close}
            onClick={this.handleClose}
          >
            <SvgIcon svgId={"clear-24"} hoverable/>
          </IconButton>,
        ]}
        {...restProps}
      />
    );
  }

  private readonly pushNotification: INotificationContext["pushNotification"] = (notificationObjToBePushed) => {
    let newArr;
    this.setState((prevState) => {
      let newState = {};
      if (!prevState.open && prevState.notificationList.length === 0) {
        newState = { open: true, messageInfo: notificationObjToBePushed.message };
      } else {
        newArr = prevState.notificationList.concat([{ id: generateNotificationId(), ...notificationObjToBePushed }]);
        newState = { notificationList: newArr, open: true };
      }
      return newState;
    });
  };

  private readonly removeNotification: INotificationContext["removeNotification"] = (id) => {
    this.setState((prevState) => {
      const index = prevState.notificationList.findIndex((notification: INotification) => (notification.id === id));
      prevState.notificationList.splice(index, 1);
      const newArr = prevState.notificationList.slice();
      return { notificationList: newArr, open: newArr.length > 0 };
    });
  };

  // eslint-disable-next-line max-len
  private readonly removeNotificationByIndex: INotificationContext["removeNotificationByIndex"] = (notificationIndex) => {
    this.removeNotification(this.state.notificationList[notificationIndex].id);
  };

  private readonly handleClose = (event, reason?) => {
    if (reason === "clickaway") {
      return;
    }
    this.setState({ open: false });
  };

  private readonly processQueue = () => {
    if (this.state.notificationList.length > 0) {
      this.setState((prevState) => {
        const notification = prevState.notificationList.shift()!;
        const newArr = prevState.notificationList.slice();
        return {
          messageInfo: notification.message,
          notificationList: newArr,
          open: true,
        };
      });
    }
  };

  private readonly handleExited = () => {
    this.processQueue();
  };
}

const StyledNotificationViewer = withStyles(styles, { name: "NotificationViewer" })(NotificationViewer);
export { StyledNotificationViewer as NotificationViewer };
