<template>
  <a :href="data.href" :title="data.title">{{ data.text || data.href }}</a>
</template>

<script>
import process from "process";

console.log("var-link executing");
const varGroup = process.env[`FLUID_VAR_GROUP`] || "internal";
const vars = {
  internal: {
    docsUrl: "https://aka.ms/fluid",
    badgeRepo: "https://github.com/microsoft/fluid-tutorial-badge",
    sudokuRepo: "https://github.com/microsoft/fluid-tutorial-sudoku",
  },
  external: {
    docsUrl: "https://fluid-preview-docs.azurewebsites.net/",
    badgeRepo:
      "https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-sudoku-badge",
    sudokuRepo:
      "https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-sudoku-tutorial",
    fluidFeed:
      "https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_packaging?_a=feed&feed=packages",
  }
};

const lookupValue = value => {
  // any props passed in with values of the form $variable will be looked up in vars,
  // first indexed by the variable group from the FLUID_VAR_GROUP environment variable
  if (value.startsWith("$")) {
    const varName = value.substring(1);
    const varValue = vars[varGroup][varName];
    // console.log(`$${varName} set to ${varValue}`);
    return varValue;
  }
  return value;
};

const vueInstance = {
  props: {
    href: String,
    text: String,
    title: String
  },
  computed: {
    data: function() {
      let source = Object.assign({}, this.$options.propsData);
      let dataObj = {};

      for (let [key, value] of Object.entries(source)) {
        // console.log(`k: ${key}, v: ${value}`);
        dataObj[key] = lookupValue(value);
      }
      return dataObj;
    }
  }
};

export default vueInstance;
</script>
