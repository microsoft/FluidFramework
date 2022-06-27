/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import IconButton from "@material-ui/core/IconButton";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import { makeStyles } from "@material-ui/styles";
import * as React from "react";
import { ModalConsumer } from "./ModalManager";
import { SvgIcon } from "./SVGIcon";
import { DeleteModal, IDeleteOptions } from "./DeleteModal";
import { IDeleteModalTextParameters } from "./DeleteModalTextParameters";
import { IShareOptions, ShareModal } from "./ShareModal";

export interface ICopyOptions {
  /**
   * The handler that is invoked if the user deciders to delete.
   */
  handler: (ref: React.MutableRefObject<HTMLTextAreaElement>) => void;
}

export interface IEditOptions {
  /**
   * The handler that is invoked if the user edits a reference path.
   */
  handler: () => void;
}

export interface IItemMenuOptions {
  share?: IShareOptions;
  delete?: IDeleteOptions;
  copy?: ICopyOptions;
  edit?: IEditOptions;
}

export interface IItemMenuProps {
  /**
   * The name of the item to be shared.
   */
  name: string;
  /**
   * The urn of the item to be shared.
   */
  urn?: string;
  /**
   * The options for the ItemMenu
   */
  options: IItemMenuOptions;
  /**
   * A callback that is executed when the menu is opened.
   */
  openHandler?: () => void;
  /**
   * A callback that is executed when the menu is closed.
   */
  closeHandler?: () => void;
  modalTextParameters: IDeleteModalTextParameters;
}

const useStyles = makeStyles({
  hiddenTextArea: {
    left: "-999em",
    position: "absolute",
  },
  iconButton: {
    "&:hover": {
      background: "transparent",
      color: "#0696d7",
    },
  },
  meatballIcon: {
    height: 32,
    width: 32,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItem: {
    fontSize: 14,
  },
  styledMenu: {
    border: "1px solid #d3d4d5",
    marginTop: "4px",
  },
}, { name: "ItemMenu" });

/**
 * A menu item that requires it's handlers to be passed through the props.
 */
export const ItemMenu: React.FunctionComponent<IItemMenuProps> =
  ({ openHandler, closeHandler, name, urn, options, modalTextParameters, ...restProps }) => {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const ref = React.useRef<HTMLTextAreaElement>(null);
    const classes = useStyles();

    function handleClick(event: React.MouseEvent<HTMLElement>) {
      if (openHandler) {
        openHandler();
      }
      setAnchorEl(event.currentTarget);
    }

    function handleClose() {
      if (closeHandler) {
        closeHandler();
      }
      setAnchorEl(null);
    }

    function handleContextMenuItemClick(
      action: string, menuOptions: any, menuName: string, urnAddress: string | undefined,
      showModal: any, hideModal: any = null) {
      setAnchorEl(null);
      if (action === "share") {
        showModal(ShareModal,
          {
            options: menuOptions.share!,
            title: menuName,
            urn: urnAddress,
          },
          closeHandler,
        );
      }
      if (action === "delete") {
        showModal(DeleteModal,
          {
            modalTextParameters,
            onClosed: () => {
              hideModal();
            },
            options: menuOptions.delete!,
            title: menuName,
          },
          closeHandler,
        );
      }
      if (action === "edit") {
        menuOptions.edit.handler();
        closeHandler!();
      }
      if (action === "copy") {
        menuOptions.copy.handler(ref);
        closeHandler!();
      }
    }

    return (
      <div>
        <IconButton
          onClick={handleClick}
          className={classes.iconButton}
        >
          <SvgIcon svgId="meatball-menu-32" className={classes.meatballIcon} hoverable />
        </IconButton>
        <ModalConsumer>
          {({ showModal, hideModal }) => (
            <Menu
              getContentAnchorEl={null}
              anchorOrigin={{
                horizontal: "center",
                vertical: "center",
              }}
              transformOrigin={{
                horizontal: "center",
                vertical: "top",
              }}
              MenuListProps={{
                disablePadding: true,
              }}
              classes={{ paper: classes.styledMenu }}
              id="customized-menu"
              anchorEl={anchorEl}
              keepMounted={true}
              open={Boolean(anchorEl)}
              onClose={handleClose}
              {...restProps}
            >
              {options.copy !== undefined &&
                <MenuItem
                  className={classes.menuItem}
                  onClick={() => handleContextMenuItemClick("copy", options, name, urn, showModal)}
                >
                  <SvgIcon svgId="copy-16" className={classes.menuIcon} />
                  Copy Path
                  <textarea ref={ref} className={classes.hiddenTextArea} />
                </MenuItem>}
              {options.edit !== undefined &&
                <MenuItem
                  className={classes.menuItem}
                  onClick={() => handleContextMenuItemClick("edit", options, name, urn, showModal, hideModal)}
                >
                  <SvgIcon svgId="edit-16" className={classes.menuIcon} />
                  Edit Reference Path
                </MenuItem>}
              {options.share !== undefined &&
                <MenuItem
                  className={classes.menuItem}
                  onClick={() => handleContextMenuItemClick("share", options, name, urn, showModal)}
                >
                  <SvgIcon svgId="share-16" className={classes.menuIcon} />
                  Share
                </MenuItem>
              }
              {options.delete !== undefined &&
                <MenuItem
                  className={classes.menuItem}
                  onClick={() => handleContextMenuItemClick("delete", options, name, urn, showModal, hideModal)}
                >
                  <SvgIcon svgId="delete-trash-16" className={classes.menuIcon} />
                  Delete
                </MenuItem>}
            </Menu>
          )}
        </ModalConsumer>
      </div>
    );
  };
