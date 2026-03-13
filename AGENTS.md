Project-Specific Rules:
- Never work in the primary checkout for this repository.
- All work for this project must happen in a separate git worktree rooted under `$HOME/.codex/worktrees/`.
- At agent thread initialization, verify `git rev-parse --show-toplevel` starts with `$HOME/.codex/worktrees/`.
- At agent thread initialization, verify `git rev-parse --git-dir` is not `.git` and points to a path containing `/.git/worktrees/`.
- At agent thread initialization, verify the agent thread's git worktree working directory was created from `dev`; if it was not, stop and ask the user to relaunch the task from a worktree created from `dev`.
- If any of those initialization checks fail, stop and ask the user to relaunch the task from a worktree under `$HOME/.codex/worktrees/`.
- After initialization succeeds, do not repeat provenance checks during the same thread. A later commit to `dev` does not invalidate the current worktree.
