import path from "path";
import fs from "fs";
import doCommand from "./utils/doCommand";

const roo = path.join(__dirname, "../../../cli/dist/grouparoo.js");
const testDir = path.join(__dirname, "..");

const sourceId = `__test_pg_source__`;

describe("app-templates/source/table", () => {
  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });
  afterEach(() => {
    const filesToDelete = [`sources/${sourceId}.js`];
    const baseDir = path.join(__dirname, "../config");
    for (let file of filesToDelete) {
      const filePath = path.join(baseDir, file);
      if (fs.existsSync(filePath)) fs.rmSync(filePath);
    }
  });
  test("writes postgres:table:source generator template", async () => {
    const command = `${roo} generate postgres:table:source ${sourceId} --parent test__pgApp`;
    const { stdout, exitCode } = await doCommand(command, testDir);
    expect(exitCode).toBe(0);
    const expFilePath = path.join(testDir, `config/sources/${sourceId}.js`);
    expect(stdout).toContain(`✅ wrote ${expFilePath}`);
    expect(stdout).not.toContain(
      `Could not find any listed columns in source.`
    );
  });
  test("throws error when using asterisk without quotes", async () => {
    const command = `${roo} generate postgres:table:source ${sourceId} --parent test__pgApp --from users --with *`;
    const { stderr, stdout, exitCode } = await doCommand(command, testDir);
    console.log({ stdout, stderr });
  });
});
