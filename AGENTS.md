# Project development constraints

- This repository's plugin capabilities target **DSH Desktop only**. Design, implementation, default keybindings, and acceptance checks must use the installed DSH Desktop contract and runtime as the compatibility target.
- Do not add support or default bindings for standalone DSH Web, TUI, Headless, or other carriers unless the user explicitly expands the scope. Desktop renders its UI through a Web client; a `dsh.client.platform: web` entry is a Desktop renderer transport detail, not a promise of standalone Web support.
- For shortcuts, publish defaults only for `desktop:macos`, `desktop:windows`, and `desktop:linux`; verify registration against DSH Desktop's shortcut admission policy, not just a permissive mock. Do not assume a settings entry exists in a user's Desktop profile.
- Build and test the plugin before reporting it works. Distinguish mocked/DOM tests from verification inside a running DSH Desktop instance. Do not commit, push, publish, or change the user's Desktop profile without separate explicit authorization.
- Choose the submission account by platform: use **南京-刘阳** for GitLab and **zhizhi-2986** for GitHub. Verify the target platform before submitting; this identity mapping does not grant authorization to commit, push, or publish.
