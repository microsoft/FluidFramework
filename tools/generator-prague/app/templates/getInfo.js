const pkg = require("./package.json");
const date = new Date();

const url = "https://www.wu2-ppe.prague.office-int.com/loader/stupefied-kilby/prague/ChangeThisValue-" + date.getTime() + "?chaincode=" + pkg.name + "@" + pkg.version;

console.log("\nREAD ME");
console.log("Check out your chaincode at:");
console.log(url);
console.log("\nFor more deployment info or to handle deployment errors, check out README.md");