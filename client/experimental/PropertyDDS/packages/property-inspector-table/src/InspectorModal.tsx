/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import Dialog from "@material-ui/core/Dialog";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import { makeStyles } from "@material-ui/core/styles";
import classNames from "classnames";
import * as React from "react";
import { ModalConsumer } from "./ModalManager";
import { SvgIcon } from "./SVGIcon";

const useStyles = makeStyles({
  closeButton: {
    "&:hover": {
      backgroundColor: "transparent",
    },
  },
  dialogBody: {
    overflow: "hidden",
  },
  dividerStyle: {
    "margin-left": "-24px",
    "margin-right": "-24px",
  },
  modaleHeader: {
    background: "#FFFFFF !important",
  },
  modaleTitle: {
    fontWeight: "bold",
  },
  root: {
    "font-family": "ArtifaktElement, Helvetica, Arial",
    "z-index": 10000, // must be that high as the hig TopNav component has a 'powerlevel' over 9000!
  },
  subtitleText: {
    "font-size": "17px",
    "opacity": 0.5,
  },
  truncatedText: {
    "align-items": "center",
    "color": "#3C3C3C",
    "display": "flex",
    "font-size": "20px",
    "justify-content": "space-between",
    "line-height": "26px",
    "margin-bottom": "8px",
    "overflow": "hidden",
    "text-overflow": "ellipsis",
  },
}, { name: "InspectorModal" });

export interface IInspectorModalProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The title of the item to be shared.
   */
  title: string;
  subtitle?: string;
  bodyClassName?: string;
}

/**
 * This function is a workaround to set the style of the div that wraps whatever one
 * passes to the `title` prop of the `SimpleModal`. If the text in the title is too long
 * wrapping div expands beyond the flex container. To prevent this min-width must be set to 0.
 * @param element - The element this ref callback is passed to.
 */
const setStyleOfTitleParentDiv = (element) => {
  if (element) {
    element.parentElement.style.minWidth = "0px";
  }
};

/**
 * The base for modals used in the UDP Inspector App.
 */
export const InspectorModal: React.FunctionComponent<IInspectorModalProps> = (props) => {
  const classes = useStyles();
  const { title, children, subtitle, className } = props;
  return (
    <ModalConsumer>
      {({ hideModal }) => (
        <Dialog
          fullWidth={true}
          maxWidth={"sm"}
          className={classNames(classes.root, className)}
          open={true}
          onClose={hideModal}
        >
          <DialogTitle className={classes.modaleHeader}>
            <div
              title={title}
              ref={setStyleOfTitleParentDiv}
              className={classes.truncatedText}
            >
              <div className={classes.modaleTitle}>{title}</div>
              {hideModal ? (
                <IconButton key="close" onClick={hideModal} className={classes.closeButton}>
                  <SvgIcon height={26} width={26} svgId={"clear-24"} hoverable />
                </IconButton>
              ) : null}
            </div>
            {subtitle ? (
              <div className={classes.subtitleText}>
                {subtitle}
              </div>) : null}
            <Divider variant="middle" className={classes.dividerStyle} />
          </DialogTitle>
          <DialogContent className={classNames(classes.dialogBody, props.bodyClassName)}>
            {children}
          </DialogContent>
        </Dialog>
      )}
    </ModalConsumer>
  );
};
