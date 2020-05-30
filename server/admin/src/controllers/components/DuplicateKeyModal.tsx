/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Button, Modal } from "antd";
import * as React from "react";

export interface IDuplicateKeyProps {
    visible: boolean;
    onOk: () => void;
}

export class DuplicateKeyModal extends React.Component<IDuplicateKeyProps> {
    constructor(props: IDuplicateKeyProps) {
        super(props);
    }

    public render() {
        const { visible, onOk } = this.props;

        return (
            <div>
                <Modal
                    title={name}
                    visible={visible}
                    onOk={onOk}
                    onCancel={onOk}
                    footer={[
                        <Button href="" key="ok" type="primary" onClick={onOk}>
                            Ok
                        </Button>,
                    ]}
                >
                    <p>Key already exists! Click on Value to edit.</p>
                </Modal>
            </div>
        );
    }
}
