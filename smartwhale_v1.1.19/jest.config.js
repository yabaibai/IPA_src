// jest.config.js
// 使用 ts-jest 直接编译 TypeScript，无需 React Native / Expo 的 setup
// 适用于纯逻辑工具函数的单元测试（不涉及 UI 组件）
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  rootDir: ".",
  roots: ["<rootDir>/__tests__", "<rootDir>/src"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        paths: { "@/*": ["./src/*"] },
        strict: false,
        types: ["jest"],
      },
    }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: [],
};
