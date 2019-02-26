import * as React from "react";
import { DataStore } from "@prague/app-datastore";

interface IProps {
    chaincodePackage: string;
    docId: string;
    mountedElement: HTMLDivElement;
    serverUrl;
}

interface IState {
}

export class LoaderComponent extends React.Component<IProps, IState> {
    private domElement: HTMLDivElement;
    constructor(props) {
        super(props);
        this.domElement = document.createElement("div");
    }

    async componentDidMount() {
        this.props.mountedElement.appendChild(this.domElement);

        let ds = await DataStore.from(this.props.serverUrl, "anonymous-coward");

        const services: ReadonlyArray<[string, Promise<any>]>  = [
            ["div", Promise.resolve(this.domElement)], 
            ["datastore", Promise.resolve(ds)]
        ];

        await ds.open(this.props.docId, this.props.chaincodePackage, "", services);
    }

    render() {
        return(<p> Component </p>);
    }
}
