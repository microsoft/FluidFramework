import * as React from "react";
import "./index.css";

interface IProps {
    Region
}

export class Region extends React.Component<IProps, any> {
  componentDidMount() {}

  render() {

    return (
        <p> Region </p>
    );
  }
}

/**
 *


                 <Matchup
                    matchNumber={""}
                    highTeam={{
                        name: ,
                        seed
                    }}
                    lowTeam={{
                        name: ,
                        seed
                    }}
                />
 */