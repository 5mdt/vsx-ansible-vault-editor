// #AVE-0014
/** Every command id the extension handles; package.json `contributes.commands` must match. */
export const COMMAND_IDS = [
  "ansibleVault.encrypt",
  "ansibleVault.decrypt",
  "ansibleVault.toggle",
  "ansibleVault.encryptFile",
  "ansibleVault.decryptFile",
  "ansibleVault.toggleFile",
  "ansibleVault.encryptAllInFile",
  "ansibleVault.decryptAllInFile",
  "ansibleVault.peek",
  "ansibleVault.editDecrypted",
  "ansibleVault.rekey",
  "ansibleVault.rekeyWorkspace",
  "ansibleVault.toggleMarker",
  "ansibleVault.forgetPasswords",
  "ansibleVault.openDecryptedStagedChanges",
  "ansibleVault.openDecryptedChanges",
  "ansibleVault.enableGitDiff",
  "ansibleVault.disableGitDiff",
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];
