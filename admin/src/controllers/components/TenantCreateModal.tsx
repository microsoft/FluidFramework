import { Modal, Form, Input, Radio } from 'antd';
import { FormComponentProps } from 'antd/lib/form';
import * as React from "react";
import "antd/lib/modal/style/css";
import "antd/lib/form/style/css";
import "antd/lib/input/style/css";
import "antd/lib/radio/style/css";

const FormItem = Form.Item;

export interface TenantCreateProps extends FormComponentProps {
  confirmLoading: boolean;
  visible: boolean;
  onCancel: () => void;
  onCreate: () => void;
}

export const TenantCreateModal = Form.create()(
  (props: TenantCreateProps) => {
    const { confirmLoading, visible, onCancel, onCreate, form } = props;
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
              <Radio.Group>
                <Radio value="git">git</Radio>
                <Radio value="github">github</Radio>
                <Radio value="cobalt">cobalt</Radio>
              </Radio.Group>
            )}
          </FormItem>
        </Form>
      </Modal>
    );
  }
);