module.exports = {
  color: true,
  extension: ["js"],
  global: [],
  ignore: [],
  jobs: 5,
  parallel: true,
  reporter: "spec",
  require: "@babel/register",
  spec: ["test/**/*.test.js"],
  watch: false,
  "watch-files": ["lib/**/*.js", "test/**/*.js"],
};
