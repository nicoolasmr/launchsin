const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  transform: {
    ...tsJestTransformCfg,
  },
  coverageThreshold: {
    global: {
      lines: 10,
      statements: 10,
      functions: 0,
      branches: 5
    }
  }
};