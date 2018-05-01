import { Form, Popconfirm, Table } from 'antd';
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import * as React from "react";
import * as utils from "../utils";
import { CreateTenantModal } from "./TenantCreateModal"
import { TenantInfoModal } from "./TenantInfoModal"

export interface ITableState {
    dataSource: any[];
    count: number;
    modalVisible: boolean;
    modalConfirmLoading: boolean;
    infoVisible: boolean;
    currentInfo: any;
}

export interface ITableProps {
    data: any[];
    endpoint: string;
    tenantConfig: any;
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
        title: 'Storage',
        dataIndex: 'provider',
      },
      {
        title: 'Operation',
        dataIndex: 'operation',
        render: (text, record) => {
          return (
            <div>
              <a onClick={() => this.showInfo(record)}>View</a>
              <Popconfirm title="Sure to delete?" onConfirm={() => this.onDelete(record._id)}>
              <span> | </span>
              <a>Delete</a>
              </Popconfirm>
            </div>
          );
        },
      }];
      this.state = {
        dataSource: this.props.data,
        count: this.props.data.length,
        modalVisible: false,
        modalConfirmLoading: false,
        infoVisible: false,
        currentInfo: null,
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

    showInfo = (record: any) => {
      this.setState({ infoVisible: true, currentInfo: record });
    }

    hideInfo = () => {
      this.setState({ infoVisible: false });
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

          const newTenant = utils.generateTenant(tenant, this.props.tenantConfig);
          if (newTenant === null) {
            console.log(`No valid tenant can be generated!`);
          } else {
            utils.addTenant(this.props.endpoint, newTenant).then((res) => {
              form.resetFields();
              this.setState({
                modalVisible: false,
                modalConfirmLoading: false,
              });
              this.addNewTenant(res);
            }, (err) => {
              console.error(err);
            });
          }
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
          <TenantInfoModal
            visible={this.state.infoVisible}
            onOk={this.hideInfo}
            record={this.state.currentInfo}
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
          provider: tenant.provider,
          storage: tenant.storage,
        };
        this.setState({
          dataSource: [...dataSource, newData],
          count: count + 1,
        });
    }
  }
