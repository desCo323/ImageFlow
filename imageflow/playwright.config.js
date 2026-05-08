module.exports = {
  testDir: './tests/Browser',
  timeout: 30000,
  use: {
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
  },
};
