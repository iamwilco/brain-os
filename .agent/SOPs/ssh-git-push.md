# SOP: SSH Git Push Issues

## Problem

`git push` fails with SSH passphrase prompt or "Received disconnect" error.

## Root Cause

SSH key at `~/.ssh/id_ed25519` requires a passphrase. The agent (non-interactive terminal) cannot provide it.

## Solution

### Option 1: Add key to SSH agent (recommended)

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
# Enter passphrase when prompted
```

Then push normally:
```bash
git push --set-upstream origin main
```

### Option 2: Use HTTPS instead of SSH

```bash
git remote set-url origin https://github.com/iamwilco/brain-os.git
git push --set-upstream origin main
```

## Verification

```bash
ssh -T git@github.com
# Should see: "Hi iamwilco! You've successfully authenticated"
```

## Notes

- The SSH agent persists for the terminal session only
- For persistent agent, add to `~/.zshrc`: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`
