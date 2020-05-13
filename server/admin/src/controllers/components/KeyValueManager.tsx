/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Form,
    Input,
    Popconfirm,
    Table,
  } from "antd";
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import React from "react";
import { IKeyValue } from "../../definitions";
import utils from "../utils";
import { DuplicateKeyModal } from "./DuplicateKeyModal";
import { CreateKeyValueModal } from "./KeyValueCreateModal";

interface ICellProps<T> {
    dataIndex: number;
    editable: boolean;
    handleEdit: (row: T) => void;
    index: number;
    record: T;
    title: string;
}

interface ICellState {
    editing: boolean;
}

interface ITableColumn<T> {
  dataIndex: string;
  editable: boolean;
  render?: (text: string, record: T) => React.ReactNode;
  title: string;
  width?: string;
}

const FormItem = Form.Item;
const EditableContext = React.createContext(null);

const EditableRow = ({ form, index, ...props }) => (
  <EditableContext.Provider value={form}>
    <tr {...props} />
  </EditableContext.Provider>
);

const EditableFormRow = Form.create()(EditableRow);

class EditableCell extends React.Component<ICellProps<IKeyValue>, ICellState> {
  public input: Input;
  public form: any;
  public state = {
    editing: false,
  };

  public render() {
    const { editing } = this.state;
    const {
      editable,
      dataIndex,
      title,
      record,
      index,
      handleEdit,
      ...restProps
    } = this.props;
    return (
      <td {...restProps}>
        {editable ? (
          <EditableContext.Consumer>
            {(form) => {
              this.form = form;
              return (
                editing ? (
                  <FormItem style={{ margin: 0 }}>
                    {form.getFieldDecorator(dataIndex, {
                      initialValue: record[dataIndex],
                      rules: [{
                        message: `${title} is required.`,
                        required: true,
                      }],
                    })(
                      <Input
                        ref={(node) => (this.input = node)}
                        onPressEnter={this.toggle}
                        onBlur={this.toggle}
                      />,
                    )}
                  </FormItem>
                ) : (
                  <div
                    className="editable-cell-value-wrap"
                    style={{ paddingRight: 24 }}
                    onClick={this.toggleEdit}
                  >
                    {restProps.children}
                  </div>
                )
              );
            }}
          </EditableContext.Consumer>
        ) : restProps.children}
      </td>
    );
  }
  private toggleEdit = () => {
    const editing = !this.state.editing;
    this.setState({ editing }, () => {
      if (editing) {
        this.input.focus();
      }
    });
  }

  private toggle = (e) => {
    const { record, handleEdit } = this.props;
    this.form.validateFields((error, values) => {
      if (error && error[e.currentTarget.id]) {
        return;
      }
      this.toggleEdit();
      handleEdit({ ...record, ...values });
    });
  }
}

interface ITableState {
    count: number;
    dataSource: IKeyValue[];
    infoVisible: boolean;
    modalVisible: boolean;
    modalConfirmLoading: boolean;
}

export interface ITableProps {
    data: IKeyValue[];
}

export class KeyValueManager extends React.Component<ITableProps, ITableState> {
  public columns: Array<ITableColumn<IKeyValue>>;
  public form: any;
  public edited = new Map<string, string>();
  constructor(props) {
    super(props);
    this.columns = [{
      dataIndex: "key",
      editable: false,
      title: "Key",
      width: "30%",
    },
    {
      dataIndex: "value",
      editable: true,
      title: "Value",
    },
    {
      dataIndex: "operation",
      editable: false,
      render: (text: string, record: IKeyValue) => {
        const needSave = this.edited.has(record.key);
        const saveButton = needSave ? <a onClick={() => this.handleSave(record)}>Save</a> : null;
        const seperatorStyle = {
          display: "inline",
        };
        const seperator = needSave ? <div style={seperatorStyle}><span> | </span></div> : null;
        return (
            <div>
              {saveButton}
              {seperator}
              <Popconfirm title="Sure to delete?" onConfirm={() => this.handleDelete(record.key)}>
              <a>Delete</a>
              </Popconfirm>
            </div>
        );
      },
      title: "Operation",
    }];

    this.state = {
      count: this.props.data.length,
      dataSource: this.props.data,
      infoVisible: false,
      modalConfirmLoading: false,
      modalVisible: false,
    };
  }

  public render() {
    const { dataSource } = this.state;
    const components = {
      body: {
        cell: EditableCell,
        row: EditableFormRow,
      },
    };
    const columns = this.columns.map((col) => {
      if (!col.editable) {
        return col;
      }
      return {
        ...col,
        onCell: (record) => ({
          dataIndex: col.dataIndex,
          editable: col.editable,
          handleEdit: this.handleEdit,
          record,
          title: col.title,
        }),
      };
    });
    const KeyValueCreateModal = Form.create()(CreateKeyValueModal) as any;
    return (
      <div>
        <Table
          components={components}
          rowClassName={() => "editable-row"}
          bordered
          dataSource={dataSource}
          columns={columns}
        />
        <nav className="add-buttons">
          <a onClick={this.showModal}>
          Add an Item
          </a>
        </nav>
        <KeyValueCreateModal
          ref={this.saveFormRef}
          visible={this.state.modalVisible}
          onCancel={this.hideModal}
          onCreate={this.handleAdd}
          confirmLoading={this.state.modalConfirmLoading}
        />
        <DuplicateKeyModal
          visible={this.state.infoVisible}
          onOk={this.hideInfo}
        />
      </div>
    );
  }

  public saveFormRef = (form) => {
    this.form = form;
  }

  private handleDelete = (key: string) => {
    utils.deleteKey(document.location.origin, key).then((res) => {
      console.log(`Deleted ${res}`);
      const dataSource = [...this.state.dataSource];
      this.setState({ dataSource: dataSource.filter((item) => item.key !== key) });
    }, (err) => {
      console.error(err);
    });
  }

  // Adds to table using a modal
  private handleAdd = () => {
    const form = this.form;
    form.validateFields((err, newKeyValue: IKeyValue) => {
      if (err) {
        return;
      }

      // Return if duplicate.
      const index = this.state.dataSource.findIndex((element) => element.key === newKeyValue.key);
      if (index !== -1) {
        form.resetFields();
        this.setState({
          modalVisible: false,
        });
        this.showInfo();
        return;
      }

      this.setState({
        modalConfirmLoading: true,
      });

      utils.addKeyValue(document.location.origin, newKeyValue).then(
        (res) => {
          form.resetFields();
          this.setState({
            modalConfirmLoading: false,
            modalVisible: false,
          });
          this.addNewKeyValue(res);
        },
        (addKeyValueError) => {
          console.error(addKeyValueError);
        });
    });
  }

  private addNewKeyValue(newKeyValue: IKeyValue) {
    const { count, dataSource } = this.state;
    this.setState({
      count: count + 1,
      dataSource: [...dataSource, newKeyValue],
    });
  }

  // Saves the update to DB.
  private handleSave = (newKeyValue: IKeyValue) => {
    if (this.edited.has(newKeyValue.key)) {
      utils.addKeyValue(document.location.origin, newKeyValue).then((res: IKeyValue) => {
        console.log(`Saved ${res.key}:${res.value}`);
        // Remove from dirty
        this.edited.delete(res.key);
        this.setState({ dataSource: [...this.state.dataSource] });
      }, (error) => {
        console.error(error);
      });
    } else {
      console.error(`Not in cache`);
    }
  }

  // Only handles local edit and marks as dirty
  private handleEdit = (row: IKeyValue) => {
    const newData = [...this.state.dataSource];
    const index = newData.findIndex((item) => row.key === item.key);
    const newItem = newData[index];
    newData.splice(index, 1, {
      ...newItem,
      ...row,
    });
    this.setState({ dataSource: newData });
    // Mark as dirty
    this.edited.set(row.key, row.value);
  }

  private showModal = () => {
    this.setState({ modalVisible: true });
  }

  private hideModal = () => {
    this.setState({ modalVisible: false });
  }

  private showInfo = () => {
    this.setState({ infoVisible: true });
  }

  private hideInfo = () => {
    this.setState({ infoVisible: false });
  }
}
