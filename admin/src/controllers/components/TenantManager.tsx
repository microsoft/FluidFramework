import { Form, Popconfirm, Table } from 'antd';
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import * as React from "react";
import * as utils from "../utils";
import { CreateTenantModal } from "./TenantCreateModal"

export interface ITableState {
    dataSource: any[];
    count: number;
    modalVisible: boolean;
    modalConfirmLoading: boolean;
}

export interface ITableProps {
    data: any[];
    endpoint: string;
}

export class TenantManager extends React.Component<ITableProps,ITableState > {
    columns: any;
    form: any;
    constructor(props: ITableProps) {
      super(props);
      this.columns = [{
        title: 'Name',
        dataIndex: 'name',
      },
      {
        title: 'Key',
        dataIndex: 'key',
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
              <Popconfirm title="Sure to delete?" onConfirm={() => this.onDelete(record._id)}>
                <a href="#">Delete</a>
              </Popconfirm>
            ) : null
          );
        },
      }];
      this.state = {
        dataSource: this.props.data,
        count: this.props.data.length,
        modalVisible: false,
        modalConfirmLoading: false,
      };
    }
    onDelete = (id) => {
      utils.deleteTenant(this.props.endpoint, id).then((res) => {
        const dataSource = [...this.state.dataSource];
        this.setState(
            {
                dataSource: dataSource.filter(item => item._id !== id)
            });
      }, (err) => {
        console.error(err);
      });
    }

    showModal = () => {
        this.setState({ modalVisible: true });
    }

    handleCancel = () => {
        this.setState({ modalVisible: false });
    }

    handleCreate = () => {
        const form = this.form;
        form.validateFields((err, tenant) => {
          if (err) {
            return;
          }

          this.setState({
            modalConfirmLoading: true,
          });

          console.log(tenant);
          utils.addTenant(this.props.endpoint, tenant).then((res) => {
            form.resetFields();
            this.setState({
              modalVisible: false,
              modalConfirmLoading: false,
            });
            this.addNewTenant(res);
          }, (err) => {
            console.error(err);
          });

        });
    }

    saveFormRef = (form) => {
        this.form = form;
    }

    render() {
      const { dataSource } = this.state;
      const columns = this.columns;
      const TenantCreateModal = Form.create()(CreateTenantModal);
      return (
        <div>
          <Table bordered dataSource={dataSource} columns={columns} rowKey="_id" />
          <nav className="add-buttons">
                <a onClick={this.showModal}>
                Add new tenant
                </a>
          </nav>
          <TenantCreateModal
            ref={this.saveFormRef}
            visible={this.state.modalVisible}
            onCancel={this.handleCancel}
            onCreate={this.handleCreate}
            confirmLoading={this.state.modalConfirmLoading}
            githubSelected={false}
            endpoint={this.props.endpoint}
          />
        </div>
      );
    }

    private addNewTenant(tenant: any) {
        const { count, dataSource } = this.state;
        const newData = {
          _id: tenant._id,
          name: tenant.name,
          key: tenant.key,
          storage: tenant.storage,
        };
        this.setState({
          dataSource: [...dataSource, newData],
          count: count + 1,
        });
    }
  }
