import * as React from "react";
import { FlowEditor } from "./editor";
import { CommandBar, ICommandBarItemProps } from "office-ui-fabric-react/lib/CommandBar";
import { DataStore } from "@prague/datastore"
import { initializeIcons } from "@uifabric/icons";
import * as style from "./index.css";
import { ChaincodeDialog } from "./chaincodedialog";
import { ChaincodeHost } from "./chaincodehost";

interface IProps { }
interface IState { }

export class App extends React.Component<IProps, IState> {
    private readonly cmds = { insert: (element: JSX.Element) => { alert("video"); } };
    private readonly chaincodeDlg = React.createRef<ChaincodeDialog>();
    
    constructor(props: Readonly<IProps>) {
        super(props);
        initializeIcons();
    }

    render() {
        return (
            <div className={style.app}>
                <CommandBar
                    items={this.getItems()}
                    overflowItems={this.getOverlflowItems()}
                    farItems={this.getFarItems()} />
                <div className={`${style.fill}`}>
                    <FlowEditor cmds={this.cmds} docUrl="http://localhost:3000" docId={Math.random().toString(36).substr(2, 4)}></FlowEditor>
                </div>
                <ChaincodeDialog ref={this.chaincodeDlg} addComponent={this.addComponent} />
            </div>
        );
    }    

    private addComponent = (docId: string, chaincode: string) => {
        this.cmds.insert(<ChaincodeHost docId={docId} chaincode={chaincode}></ChaincodeHost>)
    }

    private readonly insertables = [
        { name: "Video", iconName: "Video", onClick: () => this.cmds.insert(<video style={{ float: "left" }} autoPlay={true} loop={true} controls={true} src="https://www.tutorialrepublic.com//examples/video/shuttle.mp4"></video>) },
        { name: "Wedge Left", iconName: "CaretRight", onClick: () => this.cmds.insert(<div className={style.wedgeLeft}></div>) },
        { name: "Wedge Right", iconName: "CaretLeft", onClick: () => this.cmds.insert(<div className={style.wedgeRight}></div>) },
        { name: "Flow", iconName: "Text", onClick: () => this.cmds.insert(<FlowEditor cmds={this.cmds} docUrl="http://localhost:3000" docId={Math.random().toString(36).substr(2, 4)}></FlowEditor>) },
        { name: "Component", iconName: "Text", onClick: () => { this.chaincodeDlg.current.showDialog(); }},
    ].map(({name, iconName, onClick}) => { return {
        key: `insert${name}`,
        name,
        iconProps: { iconName },
        onClick,
        ["data-automation-id"]: `insert${name}Button`
    }});

    // Data for CommandBar
    private getItems = () => {
        return [
            {
                key: "insertItem",
                name: "Insert",
                cacheKey: "myCacheKey", // changing this key will invalidate this items cache
                iconProps: {
                    iconName: "Add"
                },
                subMenuProps: {
                    items: this.insertables
                }
            },
        ];
    };

    private getOverlflowItems = () => [] as ICommandBarItemProps[];

    private getFarItems = () => [] as ICommandBarItemProps[];
}