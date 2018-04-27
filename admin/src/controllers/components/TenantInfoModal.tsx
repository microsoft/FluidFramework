import { Button, Modal } from 'antd';
import * as React from "react";

export interface ITenantInfoProps {
    visible: boolean;
    record: any;
    onOk: () => void;
}

export class TenantInfoModal extends React.Component<ITenantInfoProps, {}> {
    constructor(props: ITenantInfoProps) {
        super(props);
    }
    render() {
        const { visible, record, onOk } = this.props;
        const name = !record ? "" : record.name;
        const id = !record ? "" : record._id;
        const key = !record ? "" : record.key;
        return (
          <div>
            <Modal
              title={name}
              visible={visible}
              onOk={onOk}
              onCancel={onOk}
              footer={[
                <Button key="ok" type="primary" onClick={onOk}>
                  Ok
                </Button>,
              ]}
            >
              <p><b>Id:</b> {id}</p>
              <p><b>Key:</b> {key}</p>
              <a href="https://github.com/Microsoft/Prague/blob/master/apps/INSTRUCTION.md" target="_blank">Learn more</a>
            </Modal>
          </div>
        );
    }
}