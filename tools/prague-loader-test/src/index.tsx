import React from "react";
import ReactDOM from "react-dom";
import { Loader } from "@prague/react-loader";
import { string } from "prop-types";

let url =
  "https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/st172aa?chaincode=@ms/tablero@0.15.1";
// const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik4tbEMwbi05REFMcXdodUhZbkhRNjNHZUNYYyIsImtpZCI6Ik4tbEMwbi05REFMcXdodUhZbkhRNjNHZUNYYyJ9.eyJhdWQiOiJodHRwczovL21pY3Jvc29mdC1teS5zaGFyZXBvaW50LWRmLmNvbSIsImlzcyI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzcyZjk4OGJmLTg2ZjEtNDFhZi05MWFiLTJkN2NkMDExZGI0Ny8iLCJpYXQiOjE1NTM2Mjc0MzAsIm5iZiI6MTU1MzYyNzQzMCwiZXhwIjoxNTUzNjMxMzI2LCJhY3IiOiIxIiwiYWlvIjoiQVZRQXEvOEtBQUFBKzE4STZ6b1pmNmtSVS8yL0V2U01TbTFKMEFwOVZtMWNQK09BVnhWUUJDaE11ZGg4STdmaUxuOFhTWXROOTBDbHZYV0t6UnR0TUdoaFFDbFpzSEozM0wrcjFveEtuNUlWWHFXcVZBNGNtS2s9IiwiYW1yIjpbInB3ZCIsIm1mYSJdLCJhcHBfZGlzcGxheW5hbWUiOiJPMzY1IFN1aXRlIFVYIiwiYXBwaWQiOiI0MzQ1YTdiOS05YTYzLTQ5MTAtYTQyNi0zNTM2MzIwMWQ1MDMiLCJhcHBpZGFjciI6IjIiLCJkZXZpY2VpZCI6IjdhMGI2YWFiLTIwNzAtNGFjMi1hNjliLTA4YmQxM2E4ZWUwNyIsImZhbWlseV9uYW1lIjoiQnJvbmVyIiwiZ2l2ZW5fbmFtZSI6IlNhbSIsImluX2NvcnAiOiJ0cnVlIiwiaXBhZGRyIjoiMjAwMTo0ODk4OjgwZTg6MTplMTkwOmYyY2I6MWI0ODpiIiwibmFtZSI6IlNhbSBCcm9uZXIiLCJvaWQiOiI1ZDU3MmNkYy1lODE2LTQwZmItOWI1YS0xMzgzYjcwMGYyYzgiLCJvbnByZW1fc2lkIjoiUy0xLTUtMjEtMjEyNzUyMTE4NC0xNjA0MDEyOTIwLTE4ODc5Mjc1MjctMjI1MDc2OTkiLCJwdWlkIjoiMTAwMzdGRkU5OURFODQwQiIsInJoIjoiSSIsInNjcCI6IkZpbGVzLlJlYWRXcml0ZS5BbGwgU2l0ZXMuTWFuYWdlLkFsbCBVc2VyLlJlYWQuQWxsIiwic2lnbmluX3N0YXRlIjpbImR2Y19tbmdkIiwiZHZjX2NtcCJdLCJzdWIiOiJ2R3I4VDVqRnJGU3lnb2Z4U3dyY0RyaUQtQkpvZ0o2YlhYZUV6RkZqcDI0IiwidGlkIjoiNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3IiwidW5pcXVlX25hbWUiOiJzYWJyb25lckBtaWNyb3NvZnQuY29tIiwidXBuIjoic2Ficm9uZXJAbWljcm9zb2Z0LmNvbSIsInV0aSI6InVMODhvNXQ5MDBhMU1MRUwzbk1CQUEiLCJ2ZXIiOiIxLjAifQ.FTuYz0t3g8i6FgcBzND5mgFv-7MX3JqCl9SEvO3YUW8WUDJrFkT-RMWjl9pdFowuyak6IssYyd8OZVeuY9A2SDt4Lw6tAKCrtQgs7T-iqP0nVuQbNlzbd_IETtW-fzd0fObmqf4WYxkn9YNZI65Lo_tG9H1NXhvjUkGpM0NlMByLBTWJnQ_krqtcXNUV_kqvF6kBPxPLkn_hZ9qfr7iTo0sQld3TvZqRqgXsCQLibs5Ed7ZMmW6Z39EPuM97dwUxcIvlOLHNqhP8cehziWHtNQuoEJpYpoUTMVNu7a2x921Li6VoeMTSaQ8JO1EOEyP-E69DxFyxPhFt4--4jJWPYg";
// const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik4tbEMwbi05REFMcXdodUhZbkhRNjNHZUNYYyIsImtpZCI6Ik4tbEMwbi05REFMcXdodUhZbkhRNjNHZUNYYyJ9.eyJhdWQiOiJodHRwczovL21pY3Jvc29mdC1teS5zaGFyZXBvaW50LWRmLmNvbSIsImlzcyI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzcyZjk4OGJmLTg2ZjEtNDFhZi05MWFiLTJkN2NkMDExZGI0Ny8iLCJpYXQiOjE1NTM2Mjc0MzAsIm5iZiI6MTU1MzYyNzQzMCwiZXhwIjoxNTUzNjMxMzI2LCJhY3IiOiIxIiwiYWlvIjoiQVZRQXEvOEtBQUFBKzE4STZ6b1pmNmtSVS8yL0V2U01TbTFKMEFwOVZtMWNQK09BVnhWUUJDaE11ZGg4STdmaUxuOFhTWXROOTBDbHZYV0t6UnR0TUdoaFFDbFpzSEozM0wrcjFveEtuNUlWWHFXcVZBNGNtS2s9IiwiYW1yIjpbInB3ZCIsIm1mYSJdLCJhcHBfZGlzcGxheW5hbWUiOiJPMzY1IFN1aXRlIFVYIiwiYXBwaWQiOiI0MzQ1YTdiOS05YTYzLTQ5MTAtYTQyNi0zNTM2MzIwMWQ1MDMiLCJhcHBpZGFjciI6IjIiLCJkZXZpY2VpZCI6IjdhMGI2YWFiLTIwNzAtNGFjMi1hNjliLTA4YmQxM2E4ZWUwNyIsImZhbWlseV9uYW1lIjoiQnJvbmVyIiwiZ2l2ZW5fbmFtZSI6IlNhbSIsImluX2NvcnAiOiJ0cnVlIiwiaXBhZGRyIjoiMjAwMTo0ODk4OjgwZTg6MTplMTkwOmYyY2I6MWI0ODpiIiwibmFtZSI6IlNhbSBCcm9uZXIiLCJvaWQiOiI1ZDU3MmNkYy1lODE2LTQwZmItOWI1YS0xMzgzYjcwMGYyYzgiLCJvbnByZW1fc2lkIjoiUy0xLTUtMjEtMjEyNzUyMTE4NC0xNjA0MDEyOTIwLTE4ODc5Mjc1MjctMjI1MDc2OTkiLCJwdWlkIjoiMTAwMzdGRkU5OURFODQwQiIsInJoIjoiSSIsInNjcCI6IkZpbGVzLlJlYWRXcml0ZS5BbGwgU2l0ZXMuTWFuYWdlLkFsbCBVc2VyLlJlYWQuQWxsIiwic2lnbmluX3N0YXRlIjpbImR2Y19tbmdkIiwiZHZjX2NtcCJdLCJzdWIiOiJ2R3I4VDVqRnJGU3lnb2Z4U3dyY0RyaUQtQkpvZ0o2YlhYZUV6RkZqcDI0IiwidGlkIjoiNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3IiwidW5pcXVlX25hbWUiOiJzYWJyb25lckBtaWNyb3NvZnQuY29tIiwidXBuIjoic2Ficm9uZXJAbWljcm9zb2Z0LmNvbSIsInV0aSI6InVMODhvNXQ5MDBhMU1MRUwzbk1CQUEiLCJ2ZXIiOiIxLjAifQ.FTuYz0t3g8i6FgcBzND5mgFv-7MX3JqCl9SEvO3YUW8WUDJrFkT-RMWjl9pdFowuyak6IssYyd8OZVeuY9A2SDt4Lw6tAKCrtQgs7T-iqP0nVuQbNlzbd_IETtW-fzd0fObmqf4WYxkn9YNZI65Lo_tG9H1NXhvjUkGpM0NlMByLBTWJnQ_krqtcXNUV_kqvF6kBPxPLkn_hZ9qfr7iTo0sQld3TvZqRqgXsCQLibs5Ed7ZMmW6Z39EPuM97dwUxcIvlOLHNqhP8cehziWHtNQuoEJpYpoUTMVNu7a2x921Li6VoeMTSaQ8JO1EOEyP-E69DxFyxPhFt4--4jJWPYg";

interface IState {
  url: string,
  input: string
}

class Example extends React.Component<any, IState> {

  state = {
    url: "https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/st172aa?chaincode=@ms/tablero@0.15.1",
    input: "https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/st172aa?chaincode=@ms/tablero@0.15.1",
  };

  render() {
    const onClick = () => {
      this.setState({
        url: this.state.input
      });
      this.forceUpdate();
    };

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      this.setState({
        input: event.target.value
      });
    }

    return (
      <div>
        <input type="text" onChange={onChange} />
        <input type="button" value={"Load"} onClick={onClick} />
        <Loader url={this.state.url} />
      </div>
    );
  }
}

ReactDOM.render(
  <Example />,
  //   <div>
  //     <input type="text" />
  //     <input type="button" value={"Load"} onClick={onClick} />
  //     <Loader url={url} />
  //   </div>,
  document.getElementById("root")
);
