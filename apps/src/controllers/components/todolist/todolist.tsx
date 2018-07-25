import { api as prague } from "@prague/routerlicious";
import * as React from "react";
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
}

export class TodoList extends React.Component<IToDoListProps, IToDoListState> {
    constructor( props: IToDoListProps ) {
        super(props);
        this.setInitialState();
        this.listenForUpdate();
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
        },
    ];
      return (
        <div>
              <ReactTable
                data={data}
                columns={columns}
                defaultPageSize={10}
                className="-striped -highlight"
              />
        </div>
      );
    }

    private setInitialState() {
        this.state = {
            list: this.getData(),
        };
    }

    private listenForUpdate() {
        this.props.map.on("valueChanged", () => {
            this.setState({
                list: this.getData(),
            });
        });
    }

    private getData() {
        const keyArray = Array.from(this.props.view.keys());
        const list = keyArray.map((key) => {
            const rawItem = this.props.view.get(key);
            const parts = rawItem.split("@");
            return {
              description: parts[1],
              title: parts[0],
            };
        });
        return list;
    }
}
