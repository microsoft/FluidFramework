import { Popconfirm, Table } from 'antd';
import "antd/lib/button/style/css";
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import * as React from "react";

export interface ITableState {
    dataSource: any[];
    count: number;
}

export interface ITableProps {
    data: any[];
}

export class EditableTable extends React.Component<ITableProps,ITableState > {
    columns: any;
    constructor(props: ITableProps) {
      super(props);
      this.columns = [{
        title: 'Name',
        dataIndex: 'id',
      },
      {
        title: 'Key',
        dataIndex: 'encryptKey',
      },
      {
        title: 'Storage',
        dataIndex: 'storage',
      },
      {
        title: 'Operation',
        dataIndex: 'operation',
        render: (text, record) => {
          return (
            this.state.dataSource.length > 1 ?
            (
              <Popconfirm title="Sure to delete?" onConfirm={() => this.onDelete(record.key)}>
                <a href="#">Delete</a>
              </Popconfirm>
            ) : null
          );
        },
      }];
      this.state = {
        dataSource: this.props.data,
        count: this.props.data.length,
      };
    }
    onDelete = (key) => {
      const dataSource = [...this.state.dataSource];
      this.setState(
          {
              dataSource: dataSource.filter(item => item.key !== key)
          });
    }
    handleAdd = () => {
      const { count, dataSource } = this.state;
      const newData = {
        key: count,
        id: `New tenant ${count}`,
        encryptKey: `secret_key_${count}`,
        storage: `https://endpoint`,
      };
      this.setState({
        dataSource: [...dataSource, newData],
        count: count + 1,
      });
    }
    render() {
      const { dataSource } = this.state;
      const columns = this.columns;
      return (
        <div>
          <Table bordered dataSource={dataSource} columns={columns} />
          <nav className="add-buttons">
                <a onClick={this.handleAdd}>
                Add new tenant
                </a>
          </nav>
        </div>
      );
    }
    /*onCellChange = (key, dataIndex) => {
      return (value) => {
        const dataSource = [...this.state.dataSource];
        const target = dataSource.find(item => item.key === key);
        if (target) {
          target[dataIndex] = value;
          this.setState({ dataSource });
        }
      };
    }*/
  }