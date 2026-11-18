/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Binds supertest's servers to 127.0.0.1 so no other local program can answer a test's request.
  setupFilesAfterEnv: ['<rootDir>/test/setup/loopbackTestServers.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
}
