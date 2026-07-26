module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Each alternative is anchored with a trailing slash, so a package whose name
  // merely starts with one of these is NOT matched: 'react-native-url-polyfill'
  // has to be listed in its own right, it does not ride in on 'react-native'.
  // Anything shipping untranspiled ESM has to be named here or Jest chokes on
  // its `import` statements.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|react-native-url-polyfill|@react-native|expo|@expo|@react-navigation)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    '!lib/**/*.d.ts',
  ],
};

