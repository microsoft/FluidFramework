import * as React from "react";
import "./index.css";

interface IProps {
    region: number,
    regionString: string
}

export class RegionRound extends React.Component<IProps, any> {
  componentDidMount() {}

  render() {
    const {region, regionString, children} = this.props;
    const className = "region" + region;
    return (
        <div className={className}>
            <h4 className={className}>{regionString}</h4>
            {children}
        </div>
        );
  }
}
