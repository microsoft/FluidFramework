/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Form, Popconfirm, Table } from "antd";
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import React from "react";
import { ITenant } from "../../definitions";
import utils from "../utils";
import { CreateTenantModal } from "./TenantCreateModal";
import { TenantInfoModal } from "./TenantInfoModal";

export interface ITableState {
    dataSource: ITenant[];
    count: number;
    modalVisible: boolean;
    modalConfirmLoading: boolean;
    infoVisible: boolean;
    currentInfo: any;
}

export interface ITableProps {
    data: ITenant[];
}

export class TenantManager extends React.Component<ITableProps, ITableState > {
    public columns: any;
    public form: any;

    constructor(props: ITableProps) {
      super(props);

      this.columns = [
        {
          dataIndex: "name",
          title: "Name",
        },
        {
          dataIndex: "provider",
          title: "Storage",
        },
        {
          dataIndex: "orderer.type",
          title: "Orderer",
        },
        {
          dataIndex: "operation",
          render: (text, record: ITenant) => {
            return (
              <div>
                <a onClick={() => this.showInfo(record)}>View</a>
                <Popconfirm title="Sure to delete?" onConfirm={() => this.onDelete(record.id)}>
                <span> | </span>
                <a>Delete</a>
                </Popconfirm>
              </div>
            );
          },
          title: "Operation",
        }];

      this.state = {
        count: this.props.data.length,
        currentInfo: null,
        dataSource: this.props.data,
        infoVisible: false,
        modalConfirmLoading: false,
        modalVisible: false,
      };
    }

    public onDelete = (id) => {
      utils.deleteTenant(document.location.origin, id).then((res) => {
        const dataSource = [...this.state.dataSource];
        this.setState(
            {
                dataSource: dataSource.filter((item) => item.id !== id),
            });
      }, (err) => {
        console.error(err);
      });
    }

    public showModal = () => {
        this.setState({ modalVisible: true });
    }

    public showInfo = (record: any) => {
      this.setState({ infoVisible: true, currentInfo: record });
    }

    public hideInfo = () => {
      this.setState({ infoVisible: false });
    }

    public handleCancel = () => {
        this.setState({ modalVisible: false });
    }

    public handleCreate = () => {
        console.log("Begin create");
        const form = this.form;
        form.validateFields((err, tenant) => {
          if (err) {
            return;
          }

          this.setState({
            modalConfirmLoading: true,
          });

          utils.addTenant(document.location.origin, tenant).then(
            (res) => {
              form.resetFields();
              this.setState({
                modalConfirmLoading: false,
                modalVisible: false,
              });
              this.addNewTenant(res);
            },
            (addTenantError) => {
              console.error(addTenantError);
            });
        });
    }

    public saveFormRef = (form) => {
        this.form = form;
    }

    public render() {
      const { dataSource } = this.state;
      const columns = this.columns;
      const TenantCreateModal = Form.create()(CreateTenantModal) as any;
      return (
        <div>
          <Table bordered dataSource={dataSource} columns={columns} rowKey="id" />
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
          />
          <TenantInfoModal
            visible={this.state.infoVisible}
            onOk={this.hideInfo}
            record={this.state.currentInfo}
          />
        </div>
      );
    }

    private addNewTenant(tenant: ITenant) {
        const { count, dataSource } = this.state;
        this.setState({
          count: count + 1,
          dataSource: [...dataSource, tenant],
        });
    }
  }
