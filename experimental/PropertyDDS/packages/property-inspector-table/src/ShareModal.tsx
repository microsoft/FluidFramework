/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WithStyles } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";
import * as React from "react";
import { FloatingLabelTextField } from "./FloatingLabelTextField";
import { InspectorModal } from "./InspectorModal";
import { ErrorPopup } from "./ErrorPopup";
import { SvgIcon } from "./SVGIcon";

const styles = () => ({
  contentContainer: {
    "display": "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
  },
  copyLinkButton: {
    "&:hover": {
      background: "transparent",
    },
    "margin-left": "10px",
  },
  floatingLabelTextField: {
    "flex-grow": 1,
  },
  horizontalContainer: {
    "align-items": "center",
    "display": "flex",
    "justify-content": "space-between",
  },
  info: {
    "flex-grow": 1,
  },
  infoContainer: {
    "display": "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
  },
  infoIcon: {
    padding: "12px 24px 12px 0px",
  },
  popper: {
    "z-index": 10500,
    // must be that high as the InspectorModal component has a 'powerlevel' over 10000! (due to TopNav)
  },
  shareButton: {
    "&:hover": {
      background: "transparent",
      cursor: "pointer",
    },
    "align-self": "flex-end",
    "padding-bottom": "12px",
  },
  spacer: {
    "flex-basis": "3vh",
  },
  tooltip: {
    "background-color": "black",
  },
});

export interface IShareModalState {
  /**
   * action in progress
   */
  progress: boolean;
  /**
   * A list of user ids with their permissions on this item.
   */
  sharedWith: { [userId: string]: string[]; };
  toolTipsIsOpen: {
    copy: boolean;
  };

}

export interface IShareOptions {
  /**
   * The handler that is invoked if the user decides to share.
   */
  shareHandler: (userIds: string[], groupIds: string[]) => Promise<any>;
  /**
   * The handler that is invoked if the user decides to unshare.
   */
  unshareHandler: (userIds: string[], groupIds: string[]) => Promise<any>;
  /**
   * A list of user ids with their permissions on this item.
   */
  sharedWith: { [userId: string]: string[]; };
}

export interface IShareModalProps {
  /**
   * The options required for handling the sharing
   */
  options: IShareOptions;
  /**
   * The title of the item to be shared.
   */
  title: string;
  /**
   * The urn of the item to be shared.
   */
  urn: string;
}

/**
 * A sharing modal.
 */
class ShareModal extends React.Component<IShareModalProps & WithStyles<typeof styles>, IShareModalState> {
  private _ismounted: boolean;

  constructor(props) {
    super(props);
    this.state = {
      progress: false,
      sharedWith: props.options.sharedWith,
      toolTipsIsOpen: {
        copy: false,
      },
    };
    this._ismounted = false;
  }

  public render() {
    const { title, urn, classes } = this.props;
    return (
      <InspectorModal title={`Share ${title}`}>
        <div className={classes.contentContainer}>
          <div className={classes.horizontalContainer}>
            {this.renderPublicSharingStatus()}
            {this.renderShareButton()}
          </div>
          <div className={classes.spacer} />
          <div className={classes!.horizontalContainer}>
            <FloatingLabelTextField
              id="shareModalUrnTextField"
              label={"Link"}
              value={urn}
              className={classes.floatingLabelTextField}
            />
            <Tooltip
              title="Link Copied"
              placement="top"
              open={this.state.toolTipsIsOpen.copy}
              onClose={() => {
                this.setState({ toolTipsIsOpen: { copy: false } });
              }}
              classes={{
                popper: classes.popper,
                tooltip: classes.tooltip,
              }}
            >
              <Button
                color="primary"
                className={classes.copyLinkButton}
                onClick={this.onCopyLink}
              >
                Copy Link
              </Button>
            </Tooltip>
          </div>
        </div>
      </InspectorModal>
    );
  }

  public componentDidMount() {
    this._ismounted = true;
  }

  public componentWillUnmount() {
    this._ismounted = false;
  }

  private get isPublic() {
    if (this.state.sharedWith) {
      // for now, we don't verify * permission, because we can only
      // give or remove them all at the same time
      return "*" in this.state.sharedWith;
    }
    return false;
  }

  private readonly renderShareButton = () => {
    const { classes } = this.props;

    return this.isPublic
        ? (
            <Button
            color="primary"
            className={classes.shareButton}
            onClick={this.disablePublicSharing}
            disabled={this.state.progress}
            >
            Disable Public Access
            </Button>
        ) : (
            <Button
            color="primary"
            className={classes.shareButton}
            onClick={this.enablePublicSharing}
            disabled={this.state.progress || this.isPublic}
            >
            Enable Public Access
            </Button>
        );
  };

  private renderPublicSharingStatus() {
    const { classes } = this.props;
    return (
      <div className={classes.infoContainer}>
        <div className={classes.info}>
          <SvgIcon className={classes.infoIcon} svgId={this.isPublic ? "visible-16" : "hidden-16"} />
          Public access is <b>{this.isPublic ? "enabled" : "disabled"}</b>
        </div>
      </div>
    );
  }

  private readonly onCopyLink = () => {
    const el = document.getElementById("shareModalUrnTextField") as HTMLInputElement;
    el!.select();
    document.execCommand("copy");
    this.setState({ toolTipsIsOpen: { copy: true } });
  };

  private readonly disablePublicSharing = () => {
    this.updateSharing(async () =>
      ErrorPopup(this.props.options.unshareHandler!.bind(this, ["*"], [], { actions: ["read", "write", "delete"] }))
        .then(() => {
          // In the future, we will update sharedWith with result of unshareHandler
          // For now, because we care only about * permission, we remove it
          this.setState({ sharedWith: {} });
        }),
    );
  };

  private readonly enablePublicSharing = () => {
    this.updateSharing(async () =>
      ErrorPopup(this.props.options.shareHandler.bind(this, ["*"], [], { actions: ["read", "write", "delete"] }))
        .then(() => {
          // In the future, we will update sharedWith with result of shareHandler
          // For now, because we care only about * permission, we add it
          this.setState({ sharedWith: { "*": ["read", "write", "delete"] } });
        }),
    );
  };

  private readonly updateSharing = (handler) => {
    this.setState({ progress: true });
    handler()
      .catch((e) => console.error(e))
      .finally(() => {
        if (this._ismounted) {
          this.setState({ progress: false });
        }
      });
  };
}

const StyledShareModal = withStyles(styles, { name: "ShareModal" })(ShareModal);
export { StyledShareModal as ShareModal };
