import {
    Button,
    Form,
    Input,
    Popconfirm,
    Table,
  } from "antd";
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import * as React from "react";
import { IPackage } from "../../definitions";
// import * as utils from "../utils";

interface ICellProps {
    dataIndex: number;
    editable: boolean;
    handleSave;
    index: number;
    record;
    title: string;
}

interface ICellState {
    editing: boolean;
}

const FormItem = Form.Item;
const EditableContext = React.createContext(null);

const EditableRow = ({ form, index, ...props }) => (
  <EditableContext.Provider value={form}>
    <tr {...props} />
  </EditableContext.Provider>
);

const EditableFormRow = Form.create()(EditableRow);

class EditableCell extends React.Component<ICellProps, ICellState> {

  public input: Input;
  public form: any;
  public state = {
    editing: false,
  };

  public toggleEdit = () => {
    const editing = !this.state.editing;
    this.setState({ editing }, () => {
      if (editing) {
        this.input.focus();
      }
    });
  }

  public save = (e) => {
    const { record, handleSave } = this.props;
    this.form.validateFields((error, values) => {
      if (error && error[e.currentTarget.id]) {
        return;
      }
      this.toggleEdit();
      handleSave({ ...record, ...values });
    });
  }

  public render() {
    const { editing } = this.state;
    const {
      editable,
      dataIndex,
      title,
      record,
      index,
      handleSave,
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
                        onPressEnter={this.save}
                        onBlur={this.save}
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
}

interface ITableState {
    count: number;
    dataSource: any[];
}

export interface ITableProps {
    data: IPackage[];
}

export class PackageManager extends React.Component<ITableProps, ITableState> {
  public columns: any;
  constructor(props) {
    super(props);
    this.columns = [{
      dataIndex: "name",
      editable: true,
      title: "name",
      width: "30%",
    },
    {
      dataIndex: "age",
      title: "age",
    },
    {
      dataIndex: "address",
      title: "address",
    },
    {
      dataIndex: "operation",
      render: (text, record) => (
        this.state.dataSource.length >= 1
          ? (
            <Popconfirm title="Sure to delete?" onConfirm={() => this.handleDelete(record.key)}>
              <a href="javascript:;">Delete</a>
            </Popconfirm>
          ) : null
      ),
      title: "operation",
    }];

    this.state = {
      count: 2,
      dataSource: [{
        address: "London, Park Lane no. 0",
        age: "32",
        key: "0",
        name: "Edward King 0",
      },
      {
        address: "London, Park Lane no. 1",
        age: "32",
        key: "1",
        name: "Edward King 1",
      }],
    };
  }

  public handleDelete = (key) => {
    const dataSource = [...this.state.dataSource];
    this.setState({ dataSource: dataSource.filter((item) => item.key !== key) });
  }

  public handleAdd = () => {
    const { count, dataSource } = this.state;
    const newData = {
      address: `London, Park Lane no. ${count}`,
      age: 32,
      key: count,
      name: `Edward King ${count}`,
    };
    this.setState({
      count: count + 1,
      dataSource: [...dataSource, newData],
    });
  }

  public handleSave = (row) => {
    const newData = [...this.state.dataSource];
    const index = newData.findIndex((item) => row.key === item.key);
    const newItem = newData[index];
    newData.splice(index, 1, {
      ...newItem,
      ...row,
    });
    this.setState({ dataSource: newData });
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
          handleSave: this.handleSave,
          record,
          title: col.title,
        }),
      };
    });
    return (
      <div>
        <Button onClick={this.handleAdd} type="primary" style={{ marginBottom: 16 }}>
          Add a row
        </Button>
        <Table
          components={components}
          rowClassName={() => "editable-row"}
          bordered
          dataSource={dataSource}
          columns={columns}
        />
      </div>
    );
  }
}

/*
export interface ITableState {
    dataSource: IPackage[];
    count: number;
    modalVisible: boolean;
    modalConfirmLoading: boolean;
    infoVisible: boolean;
    currentInfo: any;
}

export interface ITableProps {
    data: IPackage[];
}

export class PackageManager extends React.Component<ITableProps, ITableState > {
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
          dataIndex: "version",
          title: "Version",
        },
        {
          dataIndex: "operation",
          render: (text, record: IPackage) => {
            return (
              <div>
                <a onClick={() => this.showInfo(record)}>View</a>
                <Popconfirm title="Sure to delete?" onConfirm={() => this.onDelete(record.name)}>
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

    private addNewTenant(tenant: IPackage) {
        const { count, dataSource } = this.state;
        this.setState({
          count: count + 1,
          dataSource: [...dataSource, tenant],
        });
    }
  }
  */
