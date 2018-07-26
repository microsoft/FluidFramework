import { api as prague } from "@prague/routerlicious";
import * as React from "react";
import Modal from "react-responsive-modal";
import ReactTable from "react-table";
import "react-table/react-table.css";

export interface IItem {
    title: string;
    description: string;
}

export interface IToDoListProps {
    map: prague.types.IMap;
    view: prague.types.IMapView;
}

export interface IToDoListState {
    list: IItem[];
    modalOpen: boolean;
    title: string;
    description: string;
}

export class TodoList extends React.Component<IToDoListProps, IToDoListState> {
    constructor( props: IToDoListProps ) {
        super(props);
        this.setInitialState();
        this.listenForUpdate();
    }
    public onOpenModal = () => {
        this.setState({ modalOpen: true });
    }

    public onCloseModal = () => {
        this.setState({ modalOpen: false, title: "", description: "" });
    }

    public handleTitleChange = (e) => {
        const { value } = e.target;
        this.setState({ title: value });
    }

    public handleDescriptionChange = (e) => {
        const { value } = e.target;
        this.setState({ description: value });
    }

    public onSave = () => {
        const title = this.state.title;
        const description = this.state.description;
        this.save(title, description);
    }

    public render() {
        const data = this.state.list;
        const columns = [
        {
            Header: "Item",
            accessor: "title",
        },
        {
            Header: "Description",
            accessor: "description",
        }];
        const { modalOpen, title, description } = this.state;
        return (
            <div>
                <div className="list-add" onClick={this.onOpenModal}>
                    <span className="list-add-content">+</span>
                </div>
                <ReactTable
                    data={data}
                    columns={columns}
                    defaultPageSize={25}
                    className="-striped -highlight"
                />
                <Modal open={modalOpen} onClose={this.onCloseModal} center>
                    <h2>Add Item</h2>
                    Title: <input
                        className="item-input"
                        type="text"
                        name="title"
                        value={title}
                        onChange={this.handleTitleChange} />
                    Description: <input
                        className="item-input"
                        type="text"
                        name="description"
                        value={description}
                        onChange={this.handleDescriptionChange} />
                    <button className="list-save" onClick={this.onSave}>Save</button>
                </Modal>
            </div>
        );
    }

    private save(title: string, description: string) {
        const keyArray = Array.from(this.props.view.keys());
        const mapIndex = keyArray.length;
        this.props.view.set(String(mapIndex), `${title}@${description}`);
        console.log(`New item: Title: ${title}, Description: ${description}`);
        this.setState({ modalOpen: false, title: "", description: "" });
    }

    private setInitialState() {
        this.state = {
            description: "",
            list: this.getData(),
            modalOpen: false,
            title: "",
        };
    }

    private listenForUpdate() {
        this.props.map.on("valueChanged", (op: any) => {
            this.setState({
                list: this.getData(),
            });
        });
    }

    private getData() {
        const keyArray = Array.from(this.props.view.keys());
        const list = keyArray.map((key) => {
            const rawItem = this.props.view.get(key) as string;
            const parts = rawItem.split("@");
            return {
              description: parts[1],
              title: parts[0],
            };
        });
        return list.filter((item) => item.title && item.title !== "");
    }
}
