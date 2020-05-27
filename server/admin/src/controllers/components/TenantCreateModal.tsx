/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Form, Icon, Input, Modal, Radio } from "antd";
// eslint-disable-next-line import/no-internal-modules
import { FormComponentProps } from "antd/lib/form";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "antd/lib/form/style/css";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "antd/lib/input/style/css";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "antd/lib/modal/style/css";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "antd/lib/radio/style/css";
import * as React from "react";

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
        };
    }

    public render() {
        const { confirmLoading, visible, onCancel, onCreate, form } = this.props;
        const { getFieldDecorator } = form;
        /* eslint-disable @typescript-eslint/strict-boolean-expressions */
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
                        {getFieldDecorator("name", {
                            rules: [
                                { required: true, message: "Please input tenant name" },
                                { required: true, message: "Name should be at least 1 character", min: 1 },
                            ],
                        })(
                            <Input />,
                        )}
                    </FormItem>
                    <FormItem className="collection-create-form_last-form-item" label="Storage Service">
                        {getFieldDecorator("storageType", {
                            initialValue: "git",
                        })(
                            <Radio.Group onChange={(e) => { this.onStorageInputChange(e); }}>
                                <Radio value="git">git</Radio>
                                <Radio value="github">github</Radio>
                                <Radio value="cobalt">cobalt</Radio>
                            </Radio.Group>,
                        )}
                    </FormItem>
                    {this.state.githubSelected &&
            <FormItem label="Repository">
                {getFieldDecorator("repository", {
                    rules: [{ required: true, message: "Please input github repository name" }],
                })(
                    <Input />,
                )}
            </FormItem>
                    }
                    {this.state.githubSelected &&
            <FormItem label="Owner">
                {getFieldDecorator("owner", {
                    rules: [{ required: true, message: "Please input repository owner name" }],
                })(
                    <Input />,
                )}
            </FormItem>
                    }
                    {this.state.githubSelected &&
            <FormItem label="Username">
                {getFieldDecorator("username", {
                    rules: [{ required: true, message: "Please input github username" }],
                })(
                    <Input prefix={<Icon type="user" style={{ color: "rgba(0,0,0,.25)" }} />} placeholder="Username" />,
                )}
            </FormItem>
                    }
                    {this.state.githubSelected &&
            <FormItem label="Personal access token">
                {getFieldDecorator("password", {
                    rules: [{ required: true, message: "Please input github personal access token" }],
                })(
                    <Input
                        prefix={<Icon type="lock" style={{ color: "rgba(0,0,0,.25)" }} />}
                        type="password"
                        placeholder="Personal access token" />,
                )}
            </FormItem>
                    }
                    <FormItem className="collection-create-form_last-form-item" label="Ordering Service">
                        {getFieldDecorator("ordererType", {
                            initialValue: "kafka",
                        })(
                            <Radio.Group>
                                <Radio value="kafka">kafka</Radio>
                                <Radio value="memory">memory</Radio>
                                <Radio value="kafka2">kafka (experimental)</Radio>
                            </Radio.Group>,
                        )}
                    </FormItem>
                </Form>
            </Modal>
        );
        /* eslint-enable @typescript-eslint/strict-boolean-expressions */
    }

    private onStorageInputChange(e) {
        this.setState({
            githubSelected: e.target.value === "github",
        });
    }
}
