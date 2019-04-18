import * as React from "react";
import { Counter, IMap, IMapView } from "@prague/map";
import SemObjectCard from "./SemObjectCard";
import { Segment } from "semantic-ui-react";
import * as uuid_v4 from "uuid/v4";
import { times, flatten, zipWith, chunk } from "lodash";

interface ISemVal {
  author: string;
  content: string;
  leaseOwnerName: string;
  leaseEndTime: string;
  time: string;
}

interface ChatProps {
  message: ISemVal;
  key: string;
}

interface SemoContainerProps {
  semData: IMap;
  semDataView: IMapView;
  counter: Counter;
  clientId: string;
}

interface SemoContainerState {
  semData: ChatProps[];
}

export class MockSemObjectCard extends React.Component<SemoContainerProps, SemoContainerState> {
  componentDidMount() {
    this.setState({ semData: this.getInitialSemData() });

    this.props.semData.on("valueChanged", changed => {
      const { semData } = this.state;
      semData[changed.key] = this.props.semDataView.get(changed.key) as ISemVal;
      this.setState({ semData });
    });
  }

  /**
   * Fetch the existing Data
   */
  getInitialSemData(): any {
    const items: any = {};

    this.props.semDataView.forEach((value: ISemVal, key: string) => {
      items[key] = value;
    });
    return items;
  }

  releaseSemValLeaseHandler = (releasedKey: any) => {
    const newSemData: any = this.state.semData[releasedKey];

    console.log({ releasedKey });
    const { semDataView } = this.props;
    newSemData.leaseOwnerName = "";
    semDataView.set<ISemVal>(releasedKey, newSemData);
  };

  appendSemObjTableRowHandler = () => {
    const newSemObj: any = this.state.semData["#semObj"];
    const origTable = newSemObj.tables[0];
    origTable.rowCount++;
    origTable.cellSemValueIds = [...origTable.cellSemValueIds].concat(
      times(origTable.columnCount, () => uuid_v4())
    );
    this.props.semDataView.set<ISemVal>("#semObj", newSemObj);
  };

  appendSemObjTableColumnHandler = () => {
    const newSemObj: any = this.state.semData["#semObj"];
    const origTable = newSemObj.tables[0];

    // Insert the multiple new values throughout array
    origTable.cellSemValueIds = flatten(
      zipWith(chunk(origTable.cellSemValueIds, origTable.columnCount), a => a.concat(uuid_v4()))
    );
    origTable.columnCount++;
    this.props.semDataView.set<ISemVal>("#semObj", newSemObj);
  };

  updateSemValHandler = (
    semValKey: string,
    content: string,
    leaseOwnerName: string,
    leaseEndTime: string
  ) => {
    const { semDataView, clientId } = this.props;

    semDataView.set<ISemVal>(semValKey, {
      author: clientId,
      content,
      leaseOwnerName,
      leaseEndTime,
      time: Date.now().toString()
    });

    return content;
  };

  render() {
    if (!this.state) return null;

    const { semData } = this.state;
    return (
      <Segment>
        <SemObjectCard
          updateSemValHandler={this.updateSemValHandler}
          appendSemObjTableRowHandler={this.appendSemObjTableRowHandler}
          releaseSemValLeaseHandler={this.releaseSemValLeaseHandler}
          appendSemObjTableColumnHandler={this.appendSemObjTableColumnHandler}
          semData={semData || {}}
          sem={semData["#semObj"] || {}}
          semVals={[]}
          loading={false}
          validate={true}
          currentUser="DG"
        />
      </Segment>
    );
  }
}
