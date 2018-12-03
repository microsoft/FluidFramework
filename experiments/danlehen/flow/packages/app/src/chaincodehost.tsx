import * as React from "react";
import { DataStore } from "@prague/datastore"

interface IProps { docId: string, chaincode: string }
interface IState { }

export class ChaincodeHost extends React.Component<IProps, IState> {
    private readonly rootRef = React.createRef<HTMLDivElement>();

    constructor(props: Readonly<IProps>) {
        super(props);
    }

    render() {
        return (<div ref={this.rootRef}></div>);
    }

    componentDidMount() {
        const { docId, chaincode } = this.props;
        const div = document.createElement("div");
        DataStore.From("http://localhost:3000").then(store => {
            store.open(docId, "danlehen", chaincode, [
                ["dom", Promise.resolve(document)],
                ["div", Promise.resolve(this.rootRef.current)]
            ]);
        });
    }
}
