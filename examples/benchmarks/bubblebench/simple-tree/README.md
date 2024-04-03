# @fluid-example/bubblebench-simple-tree

## Getting Started

You can run this example using the following steps:

> 1.  execute the command `npm run start`
> 2.  Open your web browser and navigate to <http://localhost:8080> to view the running application. This setup enables two clients to run simultaneously on the webpage.
> 3.  Alternatively, you can append /manualAttach to the URL/port, such as http://localhost:8080/manualAttach. This mode will run only one client, providing a comparison to other versions of Bubble Bench that run with a single client. It's useful for understanding the performance of the Simple Tree in contrast to other configurations.

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
launch: {
  dumpio: true, // output browser console to cmd line
  slowMo: 500,
  headless: false,
},
```
