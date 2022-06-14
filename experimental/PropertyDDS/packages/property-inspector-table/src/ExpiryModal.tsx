/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ExpiryTimeType } from "@fluid-experimental/property-properties";
import Button from "@material-ui/core/Button";
import FormControl from "@material-ui/core/FormControl";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Radio from "@material-ui/core/Radio";
import RadioGroup from "@material-ui/core/RadioGroup";
import { makeStyles, Theme } from "@material-ui/core/styles";
import classNames from "classnames";
import React, { useEffect, useState } from "react";

import { IExpiryInfo, IExpiryState, IRepoExpiryGetter, IRepoExpirySetter } from "./CommonTypes";
import { LoadingButton } from "./LoadingButton";
import { CustomChip } from "./CustomChip";
import { ErrorPopup } from "./ErrorPopup";
import { backGroundGrayColor, textDarkColor } from "./constants";
import { InspectorModal } from "./InspectorModal";

const useStyles = makeStyles((theme: Theme) => ({
    annotation: {
        color: `${textDarkColor}b3`, // 8 digit hex code with alpha 0.7
        fontSize: "12px",
    },
    cancelButton: {
        "margin-right": theme.spacing(1.5),
    },
    contentContainer: {
        "color": textDarkColor,
        "display": "flex",
        "flex-direction": "column",
        "justify-content": "space-between",
    },
    deleteButton: {
        "&:hover": {
            background: "#C01010",
        },
        "background": "#DD2222",
        "color": backGroundGrayColor,
    },
    deleteLink: {
        color: "#FF2222",
    },
    expiryStateChip: {
        "&.expired": {
            background: "#FAA21B",
        },
        "&.live": {
            background: "#87B340",
        },
        "align-items": "center",
        "color": "white",
        "display": "inline-flex",
    },
    horizontalButtonContainer: {
        alignItems: "center",
        display: "flex",
        justifyContent: "flex-end",
        marginTop: "10px",
    },
    horizontalContainer: {
        alignItems: "center",
        display: "flex",
        justifyContent: "space-between",
        marginBottom: theme.spacing(2),
    },
    label: {
        fontWeight: "bold",
    },
    legend: {
        marginBottom: theme.spacing(2),
    },
    radioGroup: {
        "&>*": {
            marginBottom: theme.spacing(1.5),
        },
    },
    selectionLabel: {
        lineHeight: "1.2",
        paddingLeft: theme.spacing(2),
    },
    textButton: {
        "&:hover": {
            background: "transparent",
            cursor: "pointer",
            textDecorationLine: "underline",
        },
        "align-self": "flex-end",
        "padding-bottom": theme.spacing(1.5),
        "padding-right": "3px",
    },
}), { name: "ExpiryModal" });

interface IModalExpiryState {
    expiresIn: string;
    expiryState: IExpiryState;
}

interface IModalState {
    mode: "default" | "expirySelection" | "deletion";
}

interface IModalPolicyState {
    retentionStrategy: ExpiryTimeType;
    updating: boolean;
}

interface IModalDeletionState {
    deleting: boolean;
}

export interface IExpiryModalProps {
    deleteRepo: (repoUrn: string) => Promise<void>;
    getRepoExpiry: IRepoExpiryGetter;
    setRepoExpiry: IRepoExpirySetter;
    isV1Urn: boolean;
    repositoryUrn?: string;
    onClosed: () => void;
}

const retentionStrategyDescriptions: { [key in ExpiryTimeType]: string } = {
    persistent: "The repo does never expire",
    temporary: "The repo expires after 30 days",
    transient: "The repo expires after 24 hours",
};

const lifeCycleDescriptions: { [key in IExpiryState]: string } = {
    expired: "Expired State",
    live: "Live State",
};

const expiryPlaceHolder = "loading...";

/**
 * An info modal.
 */
export const ExpiryModal: React.FunctionComponent<IExpiryModalProps> = (props) => {
    const classes = useStyles();
    const { deleteRepo, getRepoExpiry, isV1Urn, onClosed, repositoryUrn, setRepoExpiry } = props;

    // ### Utilities and state management ###

    // NOTE: Setting multiple state variables independently will lead to multiple render passes unfortunately.
    // It is inevitable though, because handling all state in just one state object doesn't work if we update it several
    // times in nested promises (we'll end up with an inconsistent state because consecutive updates will not be merged
    // properly).
    const [modalState, setModalState] = useState<IModalState>({ mode: "default" });
    const [modalExpiryState, setModalExpiryState] = useState<IModalExpiryState>({
        expiresIn: expiryPlaceHolder, expiryState: "live",
    });
    const [deletionState, setDeletionState] = useState<IModalDeletionState>({ deleting: false });
    const [policyState, setPolicyState] =
        useState<IModalPolicyState>({ retentionStrategy: "temporary", updating: false });

    // Get a promise that resolves with the expiry information for the current repository.
    const getExpiryInfo = async (): Promise<IExpiryInfo | void> => {
        return ErrorPopup(getRepoExpiry.bind(null, repositoryUrn!));
    };

    /**
     * Transform expiry information to a state object.
     * @param expiryInfo - The expiry information object.
     */
    const expiryInfoToState = (expiryInfo: IExpiryInfo): IModalExpiryState => {
        const newState = {} as IModalExpiryState;
        newState.expiryState = expiryInfo.state;
        if (expiryInfo.when) {
            newState.expiresIn = new Date(expiryInfo.when).toLocaleString();
        } else {
            newState.expiresIn = "never";
        }
        return newState;
    };

    /**
     * Set the expiration state of this modal.
     * @param newState - If present, it will be set as the new state of the modal. Otherwise, {{getExpiryInfo}} will be
     *  called and its return values will be used to fill the state.
     */
    const setExpiryState = (newState?: IModalExpiryState) => {
        if (newState) {
            setModalExpiryState(newState);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            getExpiryInfo().then((expiryInfo) => {
                if (expiryInfo) {
                    newState = expiryInfoToState(expiryInfo);
                    setModalExpiryState(newState);
                }
            });
        }
    };

    /**
     * Set the expiry of the current repository to the provided retention policy
     * @param expiryTime - The new retention policy/expiry time.
     */
    const setExpiry = async (expiryTime: ExpiryTimeType): Promise<void> => {
        setPolicyState({ ...policyState, updating: true });
        setModalExpiryState({ ...modalExpiryState, expiresIn: expiryPlaceHolder });
        return ErrorPopup(setRepoExpiry.bind(null, repositoryUrn!, expiryTime)).then(() => {
            setModalState({ mode: "default" });
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            getExpiryInfo().then((expiryInfo) => {
                if (expiryInfo) {
                    const newState = expiryInfoToState(expiryInfo);
                    setModalExpiryState(newState);
                    setPolicyState({ ...policyState, updating: false });
                }
            });
        });
    };

    const setRetentionPolicy = (event) => {
        setPolicyState({ ...policyState, retentionStrategy: event.target.value });
    };

    const deleteRepository = async (repoUrn: string) => {
        setDeletionState({ deleting: true });
        setModalExpiryState({ ...modalExpiryState, expiresIn: expiryPlaceHolder });
        return ErrorPopup(deleteRepo.bind(null, repoUrn)).then(() => {
            setModalState({ mode: "default" });
            setDeletionState({ deleting: false });
            setExpiryState();
        });
    };

    useEffect(setExpiryState, [repositoryUrn]);

    // ### Rendering ###

    // Renders the modal title
    const renderTitle = () => {
        return (
            modalState.mode === "default"
                ? "Repository Expiry"
                : modalState.mode === "expirySelection"
                    ? "Set a new retention policy"
                    : "Delete Repository"
        );
    };

    // Renders the life cycle state chip or placeholder
    const renderLifeCycleState = () => {
        let lifeCycle;
        if (modalExpiryState.expiresIn === expiryPlaceHolder) {
            lifeCycle = (
                <span>
                    {modalExpiryState.expiresIn}
                </span>
            );
        } else {
            lifeCycle = (
                <CustomChip
                    height={30}
                    label={lifeCycleDescriptions[modalExpiryState.expiryState]}
                    className={classNames(classes.expiryStateChip, [modalExpiryState.expiryState])}
                />
            );
        }
        return lifeCycle;
    };

    // Renders the main view of the modal
    const renderExpiryOverview = () => {
        return (
            <div className={classes.contentContainer}>
                <span className={classes.annotation}>Current Lifecycle State</span>
                <div className={classes!.horizontalContainer}>
                    {renderLifeCycleState()}
                    <Button
                        id="delete-repository"
                        color="primary"
                        className={classes.textButton}
                        classes={{ textPrimary: classes.deleteLink }}
                        disabled={modalExpiryState.expiresIn === expiryPlaceHolder ||
                            modalExpiryState.expiryState === "expired"}
                        onClick={() => { setModalState({ mode: "deletion" }); }}
                    >
                        Delete Repository
                    </Button>
                </div>
                <span className={classes.annotation}>
                    {modalExpiryState.expiryState === "live" ? "Expiry" : "Deletion"} date
                </span>
                <div className={classes!.horizontalContainer}>
                    <span>
                        {modalExpiryState.expiresIn}
                    </span>
                    <Button
                        id="set-expiry"
                        color="primary"
                        className={classes.textButton}
                        disabled={modalExpiryState.expiresIn === expiryPlaceHolder}
                        onClick={() => { setModalState({ mode: "expirySelection" }); }}
                    >
                        Set a new expiry
                    </Button>
                </div>
                <div className={classes.horizontalButtonContainer}>
                    <Button
                        color="primary"
                        variant="contained"
                        onClick={onClosed}
                    >
                        Ok
                    </Button>
                </div>
            </div>
        );
    };

    const renderSelectionLabel = (policy: ExpiryTimeType) => {
        let policyName: string = policy.toString();
        policyName = policyName.substr(0, 1).toUpperCase() + policyName.substring(1);
        return (
            <div className={classes.selectionLabel}>
                <span className={classes.label}>
                    {policyName}<br />
                </span>
                <span className={classes.annotation}>
                    {retentionStrategyDescriptions[policy]}
                </span>
            </div>
        );
    };

    // Renders the expiration selection view (when clicking on 'set a new expiry').
    const renderNewExpirySelection = () => {
        const radioButton = () => {
            return (
                <Radio color="primary" />
            );
        };

        return (
            <div className={classes.contentContainer}>
                <FormControl component={"fieldset" as "div"}>
                    <span className={classes.legend}>Select one of following expiry options:</span>
                    <RadioGroup
                        aria-label="policy"
                        className={classes.radioGroup}
                        name="policy"
                        onChange={setRetentionPolicy}
                        value={policyState.retentionStrategy}>
                        <FormControlLabel
                            value="transient"
                            control={radioButton()}
                            label={renderSelectionLabel("transient")}
                        />
                        <FormControlLabel
                            value="temporary"
                            control={radioButton()}
                            label={renderSelectionLabel("temporary")}
                        />
                        <FormControlLabel
                            value="persistent"
                            control={radioButton()}
                            label={renderSelectionLabel("persistent")}
                        />
                    </RadioGroup>
                </FormControl>
                <div className={classes.horizontalButtonContainer}>
                    <Button
                        color="primary"
                        disabled={policyState.updating}
                        variant="outlined"
                        className={classes.cancelButton}
                        onClick={() => { setModalState({ mode: "default" }); }}
                    >
                        Cancel
                    </Button>
                    <LoadingButton
                        color="primary"
                        onClick={async () => setExpiry(policyState.retentionStrategy)}
                        variant="contained"
                    >
                        Update
                    </LoadingButton>
                </div>
            </div>
        );
    };

    // Renders the confirmation dialog for deleting a repository
    const renderDeletionConfirmation = () => {
        return (
            <div className={classes.contentContainer}>
                Are you sure you want to delete this repository?<br />
                By deleting it, the Lifecycle State will change to &quot;Expired&quot;
                for 30 days before being destroyed.
                {
                    isV1Urn && <span><br />
                        Note: You are using a v1 branch urn. You will need to convert it into a v2 urn in order to
                        undelete this repository in the inspector app.<br /><br />
                    </span>
                }
                <div className={classes.horizontalButtonContainer}>
                    <Button
                        color="primary"
                        disabled={deletionState.deleting}
                        variant="outlined"
                        className={classes.cancelButton}
                        onClick={() => { setModalState({ mode: "default" }); }}
                    >
                        Cancel
                    </Button>
                    <LoadingButton
                        classes={{ contained: classes.deleteButton }}
                        onClick={async () => deleteRepository(repositoryUrn!)}
                        variant="contained"
                    >
                        Yes, delete
                    </LoadingButton>
                </div>
            </div>
        );
    };

    return (
        <InspectorModal title={`${renderTitle()}`}>
            {modalState.mode === "default"
                ? renderExpiryOverview()
                : modalState.mode === "expirySelection"
                    ? renderNewExpirySelection()
                    : renderDeletionConfirmation()
            }
        </InspectorModal>
    );
};
