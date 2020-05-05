/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Button, Modal } from "antd";
import * as React from "react";

// tslint:disable:max-line-length

export interface ITenantInfoProps {
    visible: boolean;
    record: any;
    onOk: () => void;
}

export class TenantInfoModal extends React.Component<ITenantInfoProps, {}> {
    constructor(props: ITenantInfoProps) {
        super(props);
    }

    public render() {
        const { visible, record, onOk } = this.props;
        const name = !record ? "" : record.name;
        const id = !record ? "" : record.id;
        const key = !record ? "" : record.key;
        const orderer = !record ? "" : record.orderer.url;
        const storage = !record ? "" : record.historianUrl;

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
              <p><b>Id:</b> {id}</p>
              <p><b>Key:</b> {key}</p>
              <p><b>Orderer:</b> {orderer}</p>
              <p><b>Storage:</b> {storage}</p>
              <a href="https://github.com/microsoft/FluidFramework/blob/master/server/admin/INSTRUCTION.md" target="_blank">
                Getting started with Fluid API
              </a>
            </Modal>
          </div>
        );
    }
}
