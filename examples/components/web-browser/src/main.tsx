/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Provider, themes } from '@fluentui/react-northstar';
import {
    initializeIcons
} from "office-ui-fabric-react";


export const WebBrowserName = "location-sharing";

initializeIcons();

/**
 * A component to allow you to browse the web with others
 */
export class WebBrowser extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(WebBrowser, []);

    public static getFactory() {
        return WebBrowser.factory;
    }

    protected async componentInitializingFirstTime() {
    
    }

    /**
     * Will return a new WebBrowserView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <Provider theme={themes.teams}>
                <WebBrowserView
                    root={this.root}
                />
            </Provider>
            ,
            div,
        );
    }
}

interface IWebBrowserViewProps {
    root: ISharedDirectory;
}

interface IWebBrowserViewState {

}

class WebBrowserView extends React.Component<IWebBrowserViewProps, IWebBrowserViewState> {

    constructor(props: IWebBrowserViewProps){
        super(props);
        const {root} = this.props;
        this.state = {
           
        }
        root.on("valueChanged", (change, local) => {

        });
    }

    render(){
        const { } = this.props;
        const { } = this.state;
        return (
            <iframe id="iframe" src="http://google.com/" width="100%" height="100%" ></iframe>
        );
    }
}

export const fluidExport = WebBrowser.getFactory();