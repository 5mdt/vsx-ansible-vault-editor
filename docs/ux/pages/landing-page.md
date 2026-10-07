# Page: landing-page

**Features:** [AVE-0016](../../features/AVE-0016-landing-page.md)

## View

```text
┌───────────────────────────────────────────────────────┐
│  [logo]  Ansible Vault Editor                v1.0.1   │
│  Encrypt, decrypt and edit Ansible Vault files and    │
│  inline !vault values without leaving the editor.     │
│                                                       │
│  [ Marketplace ]  [ Open VSX ]  [ Download .vsix ]    │
│                                                       │
│  ┌ demo.gif ───────────────────────────────────────┐  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Features    (list)                                   │
│  Commands    (table from package.json)                │
│                                                       │
│  GitHub · Changelog · License · More from 5mdt        │
└───────────────────────────────────────────────────────┘
```

## States

| State        | Looks like                           |
|--------------|--------------------------------------|
| light / dark | follows `prefers-color-scheme`       |
| button hover | outline fills with the accent colour |
| narrow       | buttons wrap, one per line           |

## Actions

| Control             | Does                       | Endpoint | Confirm? |
|---------------------|----------------------------|----------|----------|
| VS Code Marketplace | opens the Marketplace page | n/a      | no       |
| Open VSX            | opens the Open VSX page    | n/a      | no       |
| Download .vsix      | downloads the latest build | n/a      | no       |
| GitHub, Changelog   | opens the repository files | n/a      | no       |
| More from 5mdt      | opens 5mdt.github.io       | n/a      | no       |
