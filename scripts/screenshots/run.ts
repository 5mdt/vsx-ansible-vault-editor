// #BUG-0004: drives a real VS Code through the extension and saves one PNG per scene.
// Run through `make screenshots`; output goes to build/screenshots/.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { _electron, type ElectronApplication, type Page } from "playwright-core";
import { encrypt } from "../../src/vault/format";

const ROOT = resolve(__dirname, "..", "..");
const OUT = join(ROOT, "build", "screenshots");
const WORKSPACE = join(OUT, "workspace");
const USER_DATA = join(OUT, "user-data");
const PASSWORD = "demo-password";
const VAULT_ID = "prod";

const block = (key: string, plain: string, indent = ""): string => {
  const lines = encrypt(plain, PASSWORD, VAULT_ID).trimEnd().split("\n");
  return `${indent}${key}: !vault |\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n`;
};

function write(rel: string, text: string): void {
  const file = join(WORKSPACE, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
}

function git(...args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=Demo", "-c", "user.email=demo@example.com", ...args],
    { cwd: WORKSPACE, stdio: "ignore" },
  );
}

function buildWorkspace(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(WORKSPACE, { recursive: true });
  write("pw", PASSWORD);
  write(
    "group_vars/prod.yml",
    `---\ndb_host: db.example.com\ndb_user: admin\n${block("db_password", "s3cret-prod")}api_token: tok_live_51Hx\n`,
  );
  write(
    "group_vars/staging.yml",
    "---\ndb_host: db.staging.example.com\ndb_password: staging-pass\n",
  );
  write("secrets.yml", encrypt("api_key: abc123\nsmtp_password: hunter2\n", PASSWORD, VAULT_ID));
  write("group_vars/db.yml", `---\n${block("db_password", "old-password")}`);
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "initial");
  write("group_vars/db.yml", `---\n${block("db_password", "new-password")}`);

  write(
    join("..", "user-data", "User", "settings.json"),
    JSON.stringify(
      {
        "workbench.colorTheme": "Default Dark Modern",
        "workbench.startupEditor": "none",
        "workbench.tips.enabled": false,
        "workbench.secondarySideBar.defaultVisibility": "hidden",
        "workbench.sideBar.location": "left",
        "window.dialogStyle": "custom",
        "window.commandCenter": false,
        "editor.fontSize": 15,
        "window.zoomLevel": 3.8,
        "editor.minimap.enabled": false,
        "editor.fontFamily": "monospace",
        "files.hotExit": "off",
        "update.mode": "none",
        "telemetry.telemetryLevel": "off",
        "git.openRepositoryInParentFolders": "never",
        "security.workspace.trust.enabled": false,
        "ansibleVault.passwordFile": "pw",
        "ansibleVault.mustEncryptGlobs": ["**/staging.yml"],
      },
      null,
      2,
    ),
  );
}

const settle = (page: Page, ms = 400) => page.waitForTimeout(ms);

async function runCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press("F1");
  await page.waitForSelector(".quick-input-widget", { state: "visible" });
  await page.keyboard.type(title, { delay: 5 });
  await settle(page, 500);
  await page.keyboard.press("Enter");
}

async function openFile(page: Page, name: string): Promise<void> {
  await page.keyboard.press("Control+p");
  await page.waitForSelector(".quick-input-widget", { state: "visible" });
  await page.keyboard.type(name, { delay: 5 });
  await settle(page, 500);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".monaco-editor .view-lines", { state: "visible" });
  await settle(page);
}

async function gotoLine(page: Page, line: number): Promise<void> {
  await page.keyboard.press("Control+g");
  await page.keyboard.type(String(line));
  await page.keyboard.press("Enter");
  await settle(page, 200);
}

let frame = 0;
async function shot(app: ElectronApplication, page: Page, name: string): Promise<void> {
  await settle(page, 600);
  frame += 1;
  const file = join(OUT, `${String(frame).padStart(2, "0")}-${name}.png`);
  // capturePage sees the real window, which page.screenshot clips once window.zoomLevel is set
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  writeFileSync(file, Buffer.from(png, "base64"));
  console.log(`wrote ${file}`);
}

async function scenes(app: ElectronApplication, page: Page): Promise<void> {
  // 1. inline encrypt: a plain value becomes a !vault block
  await openFile(page, "prod.yml");
  await gotoLine(page, 11);
  await page.keyboard.press("End");
  await runCommand(page, "Ansible Vault: Encrypt Selection or File");
  await settle(page, 1500);
  await shot(app, page, "inline-encrypt");
  await page.keyboard.press("Control+s"); // a dirty buffer would block closing the window
  await settle(page, 600);

  // 2. peek: hover over the existing block
  await gotoLine(page, 4);
  await page.keyboard.press("End");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+i");
  await page.waitForSelector(".monaco-hover", { state: "visible" });
  await shot(app, page, "peek-hover");
  await page.keyboard.press("Escape");

  // 3. edit decrypted: a whole vaulted file in a normal tab
  await openFile(page, "secrets.yml");
  await runCommand(page, "Ansible Vault: Edit Decrypted");
  await settle(page, 1500);
  await shot(app, page, "edit-decrypted");

  // 4. save guard: saving a plaintext file that must stay encrypted
  await openFile(page, "staging.yml");
  await gotoLine(page, 3);
  await page.keyboard.press("End");
  await page.keyboard.type("1");
  await page.keyboard.press("Control+s");
  await page.waitForSelector(".monaco-dialog-box", { state: "visible" });
  await shot(app, page, "save-guard");
  await page.keyboard.press("Escape");
  // cancelling leaves the buffer dirty, which would block closing the window
  await runCommand(page, "File: Revert File");
  await settle(page, 600);

  // 5. rekey the workspace: the preview list
  await runCommand(page, "Ansible Vault: Rekey Workspace");
  await page.waitForSelector(".quick-input-list", { state: "visible" });
  await shot(app, page, "rekey-workspace");
  await page.keyboard.press("Escape");

  // 6. decrypted diff of a changed vaulted file
  await openFile(page, "db.yml");
  await runCommand(page, "Ansible Vault: Open Decrypted Changes");
  await page.waitForSelector(".monaco-diff-editor", { state: "visible" });
  await shot(app, page, "decrypted-diff");
}

async function main(): Promise<void> {
  buildWorkspace();
  const executablePath = await downloadAndUnzipVSCode();
  const app: ElectronApplication = await _electron.launch({
    executablePath,
    args: [
      WORKSPACE,
      `--extensionDevelopmentPath=${ROOT}`,
      `--user-data-dir=${USER_DATA}`,
      `--extensions-dir=${join(OUT, "extensions")}`,
      "--disable-workspace-trust",
      "--skip-release-notes",
      "--skip-welcome",
      "--no-sandbox",
    ],
  });
  const pid = app.process().pid;
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(1280, 800);
      win.center();
    });
    await page.waitForSelector(".monaco-workbench", { state: "visible" });
    await settle(page, 3000);
    await scenes(app, page);
  } finally {
    await Promise.race([app.close(), new Promise((r) => setTimeout(r, 10_000))]);
    if (pid) {
      try {
        process.kill(pid);
      } catch {
        // already gone
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
