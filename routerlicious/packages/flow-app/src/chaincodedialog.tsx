import * as React from "react";
import { Dialog, DialogType, DialogFooter } from "office-ui-fabric-react/lib/Dialog";
import { PrimaryButton } from "office-ui-fabric-react/lib/Button";
import { TextField } from "office-ui-fabric-react/lib/TextField";
import { ComboBox, IComboBoxOption, VirtualizedComboBox, IComboBox } from "office-ui-fabric-react/lib/ComboBox";

interface IProps { 
    addComponent: (docId: string, chaincode: string) => void,
    verdaccioUrl: string,
}
interface IState { 
    docId: string;
    chaincode: string;
    options: IComboBoxOption[]
    hideDialog: boolean
}

export class ChaincodeDialog extends React.Component<IProps, IState> {
    constructor(props: Readonly<IProps>) {
        super(props);

        // TODO-Fix-Flow: this probably would work if it was just localhost:3002 because docker aliases it
        // 
        fetch("http://localhost:4873/-/verdaccio/packages", {
                method: "GET",
                headers: new Headers([[
                    "Authorization", `Basic ${btoa("prague:bohemia")}`]
                ]),
        })
        .then(response => response.json())
        .then(json => {
            this.setState({
                options: [...new Set<IComboBoxOption>(json.map((pkg: { name: string }) => ({
                    key: `${pkg.name}@latest`,
                    text: pkg.name
                })))]
            })
        });

        this.state = { 
            docId: Math.random().toString(36).substr(2, 4),
            chaincode: "",
            options: [],
            hideDialog: true
        };
    }

    render() {
        return (<Dialog
                hidden={this.state.hideDialog}
                onDismiss={this.closeDialog}
                dialogContentProps={{
                    type: DialogType.normal,
                    title: "Add Component"
                }}
                modalProps={{
                    isBlocking: false,
                    containerClassName: "ms-dialogMainOverride"
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
                    //onRenderOption={this._onRenderFontOption}
                    //componentRef={this._basicComboBoxComponentRef}
                    // tslint:disable:jsx-no-lambda
                    onFocus={() => console.log("onFocus called")}
                    onBlur={() => console.log("onBlur called")}
                    onMenuOpen={() => console.log("ComboBox menu opened")}
                    onPendingValueChanged={(option, pendingIndex, pendingValue) =>
                        console.log("Preview value was changed. Pending index: " + pendingIndex + ". Pending value: " + pendingValue)
                    }
                    onChange={this._onChange}
                    // tslint:enable:jsx-no-lambda
                    />
                <DialogFooter>
                    <PrimaryButton onClick={this.submit} text="Ok" />
                </DialogFooter>
            </Dialog>);
    }

    private _onChange = (event: React.FormEvent<IComboBox>, option: IComboBoxOption, index: number, value: string): void => {
        console.log("_onChanged() is called: option = " + JSON.stringify(option));
        if (option !== undefined) {
            this.setState({ chaincode: option.key.toString() });
        } else if (index !== undefined && index >= 0 && index < this.state.options.length) {
            this.setState({ chaincode: this.state.options[index].key.toString() });
        } else if (value !== undefined) {
            const newOption = { key: value, text: value };
            this.setState({ 
                options: [...this.state.options, newOption],
                chaincode: newOption.key.toString()
            });
        }
    };

    public showDialog() {
        this.setState({ hideDialog: false });
    }

    private closeDialog = () => {
        this.setState({ hideDialog: true });
    }

    private submit = () => {
        this.props.addComponent(this.state.docId, this.state.chaincode);
        this.closeDialog();
    }
}
