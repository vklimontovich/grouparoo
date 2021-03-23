exports.default = async function buildConfig() {
  return [
    {
      class: "app",
      id: "__test_sqlite_app__",
      name: "[TEST] SQLite App",
      type: "sqlite",
      options: {
        file: "./__tests__/fixtures/sqlite_source.sqlite",
      },
    },
  ];
};
