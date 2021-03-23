import path from "path";
import { spawn } from "child_process";

const defaultTestDir = path.join(process.cwd(), "tmp", "cliTest");

class ErrorWithStd extends Error {
  stderr: string;
  stdout: string;
  pid: number;
  exitCode: number;
}

const doCommand = async (
  command: string,
  testDir: string = defaultTestDir,
  extraEnv = {}
): Promise<{
  stderr: string;
  stdout: string;
  pid: number;
  exitCode: number;
}> => {
  return new Promise((resolve, reject) => {
    const parts = command.split(" ");
    const bin = parts.shift();
    const args = parts;
    let stdout = "";
    let stderr = "";

    let env = process.env;
    // we don't want the CLI commands to source typescript files
    // when running jest, it will reset NODE_ENV=test
    delete env.NODE_ENV;
    // but sometimes we do /shrug/
    env = Object.assign(env, extraEnv);

    const cmd = spawn(bin, args, { cwd: testDir, env: env });

    cmd.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    cmd.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    let pid = cmd.pid;

    cmd.on("close", (exitCode) => {
      if (stderr.length > 0 || exitCode !== 0) {
        const error = new ErrorWithStd(stderr);
        error.stderr = stderr;
        error.stdout = stdout;
        error.pid = pid;
        error.exitCode = exitCode;
        return reject(error);
      }
      return resolve({ stderr, stdout, pid, exitCode });
    });
  });
};

export default doCommand;
