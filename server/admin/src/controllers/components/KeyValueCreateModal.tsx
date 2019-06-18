/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Form, Input, Modal } from "antd";
import { FormComponentProps } from "antd/lib/form";
import "antd/lib/form/style/css";
import "antd/lib/input/style/css";
import "antd/lib/modal/style/css";
import "antd/lib/radio/style/css";
import * as React from "react";

const FormItem = Form.Item;

export interface IKeyValueCreateProps extends FormComponentProps {
  confirmLoading: boolean;
  visible: boolean;
  onCancel: () => void;
  onCreate: () => void;
}

export class CreateKeyValueModal extends React.Component<IKeyValueCreateProps, {}> {
  constructor(props: IKeyValueCreateProps) {
    super(props);
  }

  public render() {
    const { confirmLoading, visible, onCancel, onCreate, form } = this.props;
    const { getFieldDecorator } = form;
    return (
      <Modal
        visible={visible}
        title="Create a new item"
        okText="Create"
        onCancel={onCancel}
        onOk={onCreate}
        confirmLoading={confirmLoading}
      >
        <Form layout="vertical">
          <FormItem label="Key">
            {getFieldDecorator("key", {
              rules: [
                { required: true, message: "Please input key" },
                { required: true, message: "key should be at least 1 character", min: 1 },
              ],
            })(
              <Input />,
            )}
          </FormItem>
          <FormItem label="Value">
            {getFieldDecorator("value", {
              rules: [
                { required: true, message: "Please input value" },
                { required: true, message: "Value should be at least 1 character", min: 1 },
              ],
            })(
              <Input />,
            )}
          </FormItem>
        </Form>
      </Modal>
    );
  }
}
