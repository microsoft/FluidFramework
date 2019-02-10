import { PrimaryButton } from "office-ui-fabric-react/lib/Button";
import { ComboBox, IComboBox, IComboBoxOption } from "office-ui-fabric-react/lib/ComboBox";
import { Dialog, DialogFooter, DialogType } from "office-ui-fabric-react/lib/Dialog";
import { TextField } from "office-ui-fabric-react/lib/TextField";
import * as React from "react";
import { IAppConfig } from "./app";

interface IProps {
    config: IAppConfig;
    addComponent: (docId: string, chaincode: string) => void;
}

interface IState {
    docId: string;
    chaincode: string;
    options: IComboBoxOption[];
    hideDialog: boolean;
}

export class ChaincodeDialog extends React.Component<IProps, IState> {
    constructor(props: Readonly<IProps>) {
        super(props);

        const queryUrl = new URL(props.config.verdaccioUrl);
        queryUrl.pathname = "/-/verdaccio/packages";

        fetch(`${queryUrl}`, {
            method: "GET",
            headers: new Headers([[
                "Authorization", `Basic ${btoa("prague:bohemia")}`],
            ]),
        })
        .then((response) => response.json())
        .then((json) => {
            this.setState({
                options: [...new Set<IComboBoxOption>(json.map((pkg: { name: string, version: string }) => ({
                    key: `${pkg.name}@${pkg.version}`,
                    text: pkg.name,
                })))],
            });
        });

        this.state = {
            // tslint:disable-next-line:insecure-random
            docId: Math.random().toString(36).substr(2, 4),
            chaincode: "",
            options: [],
            hideDialog: true,
        };
    }

    public render() {
        return (<Dialog
                hidden={this.state.hideDialog}
                onDismiss={this.closeDialog}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: "Add Component",
                }}
                modalProps={{
                    isBlocking: false,
                    containerClassName: "ms-dialogMainOverride",
                }}>
                <TextField
                    label="Document ID"
                    onChange={(event, newValue) => this.setState({ docId: newValue })}
                    value={this.state.docId} />
                <ComboBox
                    defaultSelectedKey="C"
                    label="Chaincode Package"
                    id="Basicdrop1"
                    ariaLabel="Basic ComboBox example"
                    allowFreeform={true}
                    autoComplete="on"
                    options={this.state.options}
                    // onRenderOption={this._onRenderFontOption}
                    // componentRef={this._basicComboBoxComponentRef}
                    // tslint:disable:jsx-no-lambda
                    onChange={this._onChange}
                    // tslint:enable:jsx-no-lambda
                    />
                <DialogFooter>
                    <PrimaryButton onClick={this.submit} text="Ok" />
                </DialogFooter>
            </Dialog>);
    }

    public showDialog() {
        this.setState({ hideDialog: false });
    }

    // tslint:disable-next-line:variable-name
    private _onChange = (event: React.FormEvent<IComboBox>, option: IComboBoxOption, index: number, value: string): void => {
        if (option !== undefined) {
            this.setState({ chaincode: option.key.toString() });
        } else if (index !== undefined && index >= 0 && index < this.state.options.length) {
            this.setState({ chaincode: this.state.options[index].key.toString() });
        } else if (value !== undefined) {
            const newOption = { key: value, text: value };
            this.setState({
                options: [...this.state.options, newOption],
                chaincode: newOption.key.toString(),
            });
        }
    }

    private closeDialog = () => {
        this.setState({ hideDialog: true });
    }

    private submit = () => {
        this.props.addComponent(this.state.docId, this.state.chaincode);
        this.closeDialog();
    }
}
