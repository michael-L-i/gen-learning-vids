import { spawn } from "node:child_process";

export function run(
  command,
  args = [],
  { input, cwd, timeout = 15 * 60 * 1000, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "",
      stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
      finish(
        new Error(`${command} took too long. Check the provider and retry.`),
      );
    }, timeout);
    child.stdout.on("data", (b) => {
      stdout += b;
      if (stdout.length > 4e6) {
        child.kill();
        finish(new Error("Provider returned too much output."));
      }
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-12000);
    });
    child.on("error", (e) =>
      finish(
        new Error(
          e.code === "ENOENT"
            ? `${command} is not installed or is missing from PATH. Check Settings → Local tools.`
            : e.message,
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? finish(null, { stdout, stderr })
        : finish(
            new Error(
              `${command} exited with code ${code}. ${stderr.slice(-1800) || stdout.slice(-1800)}`,
            ),
          ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
  });
}
export async function available(command) {
  try {
    await run(process.platform === "win32" ? "where" : "which", [command], {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}
