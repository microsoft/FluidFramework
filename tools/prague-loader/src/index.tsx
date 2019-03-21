import React from 'react';
import ReactDOM from 'react-dom';
import App, { IContainerLoaderProps } from './App';

const props: IContainerLoaderProps = {
    containerId: "ChangeThisValue-155aa3036248361",
    ordererUrl: "https://alfred.wu2-ppe.prague.office-int.com",
    storageUrl: "https://historian.wu2-ppe.prague.office-int.com",
    registryUrl: "https://pragueauspkn-3873244262.azureedge.net",
    div: document.getElementById('root') as HTMLDivElement,
};

ReactDOM.render(<App
    containerId={props.containerId}
    ordererUrl={props.ordererUrl}
    storageUrl={props.storageUrl}
    registryUrl={props.registryUrl}
    div={props.div}
    />, document.getElementById('root'));
