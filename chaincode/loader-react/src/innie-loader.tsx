import * as React from "react";
import { ComponentHost } from "@prague/component";
import { ISharedMap } from "@prague/map";

interface IProps {
    host: ComponentHost;
    root: ISharedMap;
    div: HTMLDivElement;
}

interface IState {
}

export class InnieLoader extends React.Component<IProps, IState> {

    docId: string;
    chaincode: string;

    constructor(props) {
        super(props);
    }

    async componentDidMount() {

        this.docId = await this.props.root.get("docId");
        this.chaincode = await this.props.root.get("chaincodePackage");
        await this.props.host.openComponent(this.docId, true, [["div", Promise.resolve(this.props.div)]]);
    }

    render() {
        console.log("Innie Render");

        return(<p> Innie </p>);
    }
}
