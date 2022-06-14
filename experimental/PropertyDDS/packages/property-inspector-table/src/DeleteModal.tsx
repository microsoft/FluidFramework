/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { WithStyles } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import { withStyles } from "@material-ui/core/styles";
import * as React from "react";
import { ErrorPopup } from "./ErrorPopup";
import { IDeleteModalTextParameters } from "./DeleteModalTextParameters";
import { InspectorModal } from "./InspectorModal";

const styles = () => ({
  cancelButton: {
    "margin-right": "12px",
  },
  contentContainer: {
    "display": "flex",
    "flex-direction": "column",
    "justify-content": "space-between",
  },
  horizontalButtonContainer: {
    "align-items": "center",
    "display": "flex",
    "justify-content": "flex-end",
    "margin-bottom": "16px",
  },
  spacer: {
    "flex-basis": "5vh",
  },
  truncatedText: {
    "overflow": "hidden",
    "text-overflow": "ellipsis",
  },
});

export interface IDeleteOptions {
  /**
   * The handler that is invoked if the user deciders to delete.
   */
  handler: () => Promise<any>;
}

export interface IDeleteModalProps {
  /**
   * The callback invoked after the modal is closed
   */
  onClosed: () => void;
  /**
   * The options required for handling the deletion
   */
  options: IDeleteOptions;
  /**
   * The title of the item to be deleted.
   */
  title: string;

  modalTextParameters: IDeleteModalTextParameters;
}

export interface IDeleteModalState {
  deleting: boolean;
}

/**
 * A deletion modal.
 */
class DeleteModal extends React.Component<IDeleteModalProps & WithStyles<typeof styles>, IDeleteModalState> {
  constructor(props) {
    super(props);

    this.state = {
      deleting: false,
    };
  }

  public render() {
    const textParameters = this.props.modalTextParameters;
    return (
      <InspectorModal title={textParameters.modalHeader}>
        <div className={this.props.classes!.contentContainer}>
          <div className={this.props.classes!.truncatedText}>
            {`You are about to delete the `}
            <span style={{ fontWeight: "bold" }}>{this.props.title}</span>
            {` ${textParameters.modalCallingSource}.`}
            <br />
            {`Are you sure you want to proceed?`}
          </div>
          <div className={this.props.classes!.spacer} />
          <div className={this.props.classes!.horizontalButtonContainer}>
            <Button
              color="primary"
              variant="outlined"
              disabled={this.state.deleting}
              className={this.props.classes!.cancelButton}
              onClick={this.props.onClosed}
            >
              Cancel
            </Button>
            <Button
              id="deletePropertyConfirm"
              onClick={this.deleteHandler}
              variant="contained"
              color="primary"
            >
              {this.state.deleting ? "Deleting" : `Yes, delete ${textParameters.modalCallingSource}`}
            </Button>
          </div>
        </div>
      </InspectorModal>
    );
  }

  private readonly deleteHandler = async () => {
    this.setState({ deleting: true });
    return ErrorPopup(this.props.options.handler, false).then(() => {
      this.props.onClosed();
    }).catch(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ErrorPopup(() => { throw new Error("The property was deleted by a remote collaborator!"); });
      this.setState({ deleting: false });
      this.props.onClosed();
    });
  };
}

const StyledDeleteModal = withStyles(styles, { name: "DeleteModal" })(DeleteModal);
export { StyledDeleteModal as DeleteModal };
