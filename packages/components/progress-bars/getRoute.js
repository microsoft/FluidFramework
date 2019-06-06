const pkg = require("./package.json");
const date = new Date();

const url = "https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/ChangeThisValue-" + date.getTime() + "?chaincode=" + pkg.name + "@" + pkg.version;

console.log("View your chaincode at:");
console.log('\x1b[36m%s\x1b[0m', url);
console.log("\nFor more deployment info or to handle deployment errors, check out README.md");