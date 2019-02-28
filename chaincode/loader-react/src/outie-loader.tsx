import * as React from "react";
import { DataStore } from "@prague/app-datastore";
import { ComponentHost } from "@prague/component";
import { ISharedMap } from "@prague/map";
import { outie } from "./constants";

interface IProps {
    host: ComponentHost;
    root: ISharedMap;
    div: HTMLDivElement;
}

interface IState {
    docId: string;
}

export class OutieLoader extends React.Component<IProps, IState> {
    docId: string;

    constructor(props) {
        super(props);
    }

    async componentDidMount() {

        this.docId = await this.props.root.get("docId");

        let ds = await DataStore.from(await this.props.root.get("serverUrl"), "anonymous-coward");

        const services: ReadonlyArray<[string, Promise<any>]>  = [
            ["div", Promise.resolve(this.props.div)], 
            ["datastore", Promise.resolve(ds)]
        ];

        await ds.open(this.docId, await this.props.root.get("chaincodePackage"), "", services);

        // TODO: wow this is a hack
        // There's a timing issue related to opening this docId twice.
        this.props.root.set("shouldRender", outie);
    }

    render() {
        if(this.state !== null) {
            return(<p>{this.docId}</p>);
        }
        return(<p> Component </p>);
    }
}

export class OutieLoaderMenu extends React.Component {

}