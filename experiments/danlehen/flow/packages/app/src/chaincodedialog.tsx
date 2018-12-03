import * as React from "react";
import { Dialog, DialogType, DialogFooter } from 'office-ui-fabric-react/lib/Dialog';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';
import { TextField } from 'office-ui-fabric-react/lib/TextField';

interface IProps { addComponent: (docId: string, chaincode: string) => void }
interface IState { 
    docId: string;
    chaincode: string;
    hideDialog: boolean
}

export class ChaincodeDialog extends React.Component<IProps, IState> {
    constructor(props: Readonly<IProps>) {
        super(props);
        this.state = { 
            docId: null,
            chaincode: null,
            hideDialog: true
        };
    }

    render() {
        return (<Dialog
                hidden={this.state.hideDialog}
                onDismiss={this.closeDialog}
                dialogContentProps={{
                    type: DialogType.largeHeader,
                    title: 'Add Component'
                }}
                modalProps={{
                    isBlocking: false,
                    containerClassName: 'ms-dialogMainOverride'
                }}
                >
                <TextField label="Document ID" onChange={(event, newValue) => this.setState({ docId: newValue })} />
                <TextField label="Chaincode Package" onChange={(event, newValue) => this.setState({ chaincode: newValue })} />
                <DialogFooter>
                    <PrimaryButton onClick={this.submit} text="Ok" />
                </DialogFooter>
            </Dialog>);
    }

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
