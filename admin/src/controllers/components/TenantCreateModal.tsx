import { Modal, Form, Icon, Input, Radio } from 'antd';
import { FormComponentProps } from 'antd/lib/form';
import * as React from "react";
import "antd/lib/modal/style/css";
import "antd/lib/form/style/css";
import "antd/lib/input/style/css";
import "antd/lib/radio/style/css";
import { findTenant } from "../utils";

const FormItem = Form.Item;
let endpoint: string = null;

export interface ITenantCreateProps extends FormComponentProps {
  confirmLoading: boolean;
  visible: boolean;
  onCancel: () => void;
  onCreate: () => void;
  githubSelected: false;
  endpoint: string;
}

export interface ITenantCreateState {
  githubSelected: boolean;
}

export class CreateTenantModal extends React.Component<ITenantCreateProps, ITenantCreateState> {
  constructor(props: ITenantCreateProps) {
    super(props);
    this.state = {
      githubSelected: this.props.githubSelected,
    }
    // Not ideal but a quick alternative of creating a new component.
    endpoint = this.props.endpoint;
  }

  render() {
    const { confirmLoading, visible, onCancel, onCreate, form } = this.props;
    const { getFieldDecorator } = form;
    return (
      <Modal
        visible={visible}
        title="Create a new tenant"
        okText="Create"
        onCancel={onCancel}
        onOk={onCreate}
        confirmLoading={confirmLoading}
      >
        <Form layout="vertical">
          <FormItem label="Name">
            {getFieldDecorator('name', {
              rules: [
                { required: true, message: 'Please input tenant name' },
                { required: true, message: 'Name should be at least 4 characters', min: 4 },
                { required: true, message: 'Tenant name already exists', transform: (value: string) => value.toLowerCase(), validator: this.validateTenantName},
              ],
            })(
              <Input />
            )}
          </FormItem>
          <FormItem className="collection-create-form_last-form-item">
            {getFieldDecorator('storage', {
              initialValue: 'git',
            })(
              <Radio.Group onChange={(e) => {this.onStorageInputChange(e)}}>
                <Radio value="git">git</Radio>
                <Radio value="github">github</Radio>
                <Radio value="cobalt">cobalt</Radio>
              </Radio.Group>
            )}
          </FormItem>
          {this.state.githubSelected &&
            <FormItem label="Repository">
              {getFieldDecorator('repository', {
                rules: [{ required: true, message: 'Please input github repository name' }],
              })(
                <Input />
              )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Owner">
            {getFieldDecorator('owner', {
              rules: [{ required: true, message: 'Please input repository owner name' }],
            })(
              <Input />
            )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Username">
            {getFieldDecorator('username', {
              rules: [{ required: true, message: 'Please input github username' }],
            })(
              <Input prefix={<Icon type="user" style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="Username" />
            )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Personal access token">
            {getFieldDecorator('password', {
              rules: [{ required: true, message: 'Please input github personal access token' }],
            })(
              <Input prefix={<Icon type="lock" style={{ color: 'rgba(0,0,0,.25)' }} />} type="password" placeholder="Personal access token" />
            )}
            </FormItem>
          }
        </Form>
      </Modal>
    );
  }

  private onStorageInputChange(e) {
    this.setState({
      githubSelected: e.target.value === "github",
    });
  }

  private validateTenantName(rule: any, value: string, callback: any) {
    // Don't look up for values with smaller length since the min length propery will apply.
    if (value.length <  4) {
      callback();
    } else {
      findTenant(endpoint, value).then((data) => {
        if (data != null) {
          callback([new Error(rule.message)]);
        } else {
          callback();
        }
      }, (err) => {
        callback([new Error("Error accessing MongoDB. Try again!")]);
      });
    }
  }
}
