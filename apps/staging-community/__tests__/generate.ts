import path from "path";
import fs from "fs";
import doCommand from "./utils/doCommand";

const roo = path.join(__dirname, "../../../cli/dist/grouparoo.js");
const testDir = path.join(__dirname, "..");

const appId = `__test_sqlite_app__`;
const sourceId = `__test_sqlite_source__`;

const copyAppConfig = () => {
  const srcFile = path.join(__dirname, "./fixtures/sqlite-app.js");
  const destFile = path.join(__dirname, `../config/apps/${appId}.js`);
  fs.copyFileSync(srcFile, destFile);
};

describe("app-templates/source/table", () => {
  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });
  afterEach(() => {
    const filesToDelete = [`sources/${sourceId}.js`, `apps/${appId}.js`];
    const baseDir = path.join(__dirname, "../config");
    for (let file of filesToDelete) {
      const filePath = path.join(baseDir, file);
      if (fs.existsSync(filePath)) fs.rmSync(filePath);
    }
  });
  test("writes sqlite:table:source generator template", async () => {
    const command = `${roo} generate sqlite:table:source ${sourceId} --parent ${appId}`;
    const { stdout, exitCode } = await doCommand(command, testDir);
    expect(exitCode).toBe(0);
    const expFilePath = path.join(testDir, `config/sources/${sourceId}.js`);
    expect(stdout).toContain(`✅ wrote ${expFilePath}`);
    expect(stdout).not.toContain(
      `Could not find any listed columns in source.`
    );
  });
  test("throws error when using asterisk without quotes", async () => {
    copyAppConfig();
    await doCommand(`${roo} apply`);
    const command = `${roo} generate sqlite:table:source ${sourceId} --parent ${appId} --from users --with *`;
    const { stderr, stdout, exitCode } = await doCommand(command, testDir);
    console.log({ stdout, stderr });
  });
});
