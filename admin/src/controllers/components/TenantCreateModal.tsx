import { Modal, Form, Icon, Input, Radio } from 'antd';
import { FormComponentProps } from 'antd/lib/form';
import * as React from "react";
import "antd/lib/modal/style/css";
import "antd/lib/form/style/css";
import "antd/lib/input/style/css";
import "antd/lib/radio/style/css";

const FormItem = Form.Item;

export interface ITenantCreateProps extends FormComponentProps {
  confirmLoading: boolean;
  visible: boolean;
  onCancel: () => void;
  onCreate: () => void;
  githubSelected: false;
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
              rules: [{ required: true, message: 'Please input tenant name!' }],
            })(
              <Input />
            )}
          </FormItem>
          <FormItem label="Encryption Key">
            {getFieldDecorator('key', {
              rules: [{ required: true, message: 'Please input encryption key for the tenant!' }],
            })(
              <Input />
            )}
          </FormItem>
          <FormItem className="collection-create-form_last-form-item">
            {getFieldDecorator('storage', {
              initialValue: 'git',
            })(
              <Radio.Group onChange={(e) => {this.onStorageChange(e)}}>
                <Radio value="git">git</Radio>
                <Radio value="github">github</Radio>
                <Radio value="cobalt">cobalt</Radio>
              </Radio.Group>
            )}
          </FormItem>
          {this.state.githubSelected &&
            <FormItem label="Repository">
              {getFieldDecorator('repository', {
                rules: [{ required: true, message: 'Please input github repository name!' }],
              })(
                <Input />
              )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Owner">
            {getFieldDecorator('owner', {
              rules: [{ required: true, message: 'Please input repository owner name!' }],
            })(
              <Input />
            )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Username">
            {getFieldDecorator('username', {
              rules: [{ required: true, message: 'Please input github username!' }],
            })(
              <Input prefix={<Icon type="user" style={{ color: 'rgba(0,0,0,.25)' }} />} placeholder="Username" />
            )}
            </FormItem>
          }
          {this.state.githubSelected &&
            <FormItem label="Password">
            {getFieldDecorator('password', {
              rules: [{ required: true, message: 'Please input github personal access token!' }],
            })(
              <Input prefix={<Icon type="lock" style={{ color: 'rgba(0,0,0,.25)' }} />} type="password" placeholder="Password" />
            )}
            </FormItem>
          }
        </Form>
      </Modal>
    );
  }

  private onStorageChange(e) {
    this.setState({
      githubSelected: e.target.value === "github",
    });
  }
}
