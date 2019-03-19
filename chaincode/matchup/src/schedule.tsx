import * as React from "react";
import "./index.css";

const schedule = [
    ["1st Round", "March 21-22", new Date(2019, 2, 23, 0)],
    ["2nd Round", "March 23-24", new Date(2019, 2, 25, 0)],
    ["Sweet 16", "March 28-29", new Date(2019, 2, 30, 0)],
    ["Elite 8", "March 30-31", new Date(2019, 3, 1, 0)],
    ["Final Four", "April 6", new Date(2019, 3, 7, 0)],
    ["Championship", "April 8", new Date(2019, 3, 9, 0)]
  ];

export class Schedule extends React.Component<any, any> {
    currentDate: Date;
    componentDidMount() { }

    render() {
        this.currentDate = new Date(Date.now());

        let names: JSX.Element[] = new Array();
        let dates: JSX.Element[] = new Array();
        let priorDate = new Date(2019, 2, 0, 0);
        for (const [name, stringDate, d] of schedule) {
          const date = d as Date;
          const current = priorDate < this.currentDate && this.currentDate < date;
    
          names.push(<th className={current ? "current" : ""}>{name}</th>);
          dates.push(<td className={current ? "current" : ""}>{stringDate}</td>);
    
          priorDate = date;
        }
    
        const nonChampionshipGames = names.length - 2;
        for (let i = nonChampionshipGames; i >= 0; i--) {
          names.push(names[i]);
          dates.push(dates[i]);
        }

        return (
            <div>
        <div id={"table"}>
          <table className={"gridtable"}>
            <tr>
              {... names}
            </tr>
            <tr>
              {... dates}
            </tr>
          </table>
        </div>
      </div>
        )
    }
}
