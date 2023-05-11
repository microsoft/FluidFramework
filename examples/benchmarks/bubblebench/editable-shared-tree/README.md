# @fluid-example/bubblebench-editable-shared-tree

### Running the test locally

> Bubble bench is currently at a state where it fails to run in a normal state with 2 clients due to the inability of the front end application to observe and react accordingly to backpressure on the server. So, at this point in time, to get it to run you must take the following steps:
>
> 1.  execute the command `npm run start`
> 2.  when navigating to the url/port the front end is running on you MUST put `/manualAttach` For example, [localhost:8080/manualAttach](http://localhost:8080/manualAttach)
>     Note that this mode will run only 1 client. But, its still good for getting an idea of how editable shared tree compares to the other versions of bubble bench running 1 client.

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
launch: {
  dumpio: true, // output browser console to cmd line
  slowMo: 500,
  headless: false,
},
```
