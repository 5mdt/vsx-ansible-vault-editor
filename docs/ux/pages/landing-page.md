# Page: landing-page

**Features:** [AVE-0016](../../features/AVE-0016-landing-page.md), [AVE-0022](../../features/AVE-0022-demo-video.md)

## View

```text
┌───────────────────────────────────────────────────────┐
│  [logo]  Ansible Vault Editor                v1.0.1   │
│  Encrypt, decrypt and edit Ansible Vault files and    │
│  inline !vault values without leaving the editor.     │
│                                                       │
│  [ Marketplace ]  [ Open VSX ]  [ Download .vsix ]    │
│                                                       │
│  ┌ demo.webm (poster, then autoplay, muted, loop) ──┐  │
│  │ ▶ ━━━━━━━━━━○───────────  0:21 / 0:50   ⛶ ⋮     │  │
│  └─────────────────────────────────────────────────┘  │
│  1 Encrypt · 2 Peek · 3 Edit · 4 Guard · 5 Warn ...   │
│                                                       │
│  Features    (list)                                   │
│  Commands    (table from package.json)                │
│                                                       │
│  GitHub - Changelog - Benchmarks - License - More from 5mdt        │
└───────────────────────────────────────────────────────┘
```

## States

| State                       | Looks like                                          |
|-----------------------------|-----------------------------------------------------|
| light / dark                | follows `prefers-color-scheme`                      |
| button hover                | outline fills with the accent colour                |
| narrow                      | buttons wrap, one per line                          |
| video                       | poster, then plays muted on a loop; native controls |
| reduced motion / Data Saver | poster only, plays on click                         |
| no WebM/VP9 support         | `demo.gif` shown instead                            |

## Actions

| Control             | Does                           | Endpoint | Confirm? |
|---------------------|--------------------------------|----------|----------|
| VS Code Marketplace | opens the Marketplace page     | n/a      | no       |
| Open VSX            | opens the Open VSX page        | n/a      | no       |
| Download .vsix      | downloads the latest build     | n/a      | no       |
| Video controls      | play, pause, seek, full screen | n/a      | no       |
| GitHub              | opens the repository           | n/a      | no       |
| Changelog           | opens `changelog.html`         | n/a      | no       |
| Benchmarks          | opens `benchmarks.html`        | n/a      | no       |
| More from 5mdt      | opens 5mdt.github.io           | n/a      | no       |
