This project uses **bun** as its package manager and runtime, not npm.

- Use `bun install` instead of `npm install`.
- Use `bun run` instead of `npm run` or `npx`.
- Use `bun test` or `bun run test` instead of `npm test`.
- Never generate or commit `package-lock.json`. The project uses `bun.lock`.
