# Node.js and npm toolchain

Status: Accepted

## Decision

Use a maintained Node.js LTS release (22.22 or newer) and npm for installation, development, operations, and testing. The template has one canonical `package-lock.json`. The installer uses Node's built-in TypeScript stripping for the credential module, which contains only erasable types and Node built-ins, before dependencies exist.

Installed operations use `node --import tsx`: their TypeScript uses extensionless imports, Nuxt path aliases, and parameter properties. Keeping that syntax consistent with the application avoids a second module convention for shared code. Node's native type stripping alone does not resolve all these imports or transform parameter properties.

Vitest executes the existing regression suite in isolated forks. Tests that replaced modules in Bun subprocesses use Vitest's module mocks; files that change the working directory retain process isolation. The completion persistence tests compile the actual SFC with Vue's compiler and render it in the same in-memory host, preserving their acknowledgment and recovery assertions. Browser integration tests continue to use Node's built-in test runner and Playwright.

## Rationale

Node is already required by Nuxt, Firebase CLI, and reliable browser automation. A single runtime and package manager simplify lab onboarding and credentials setup. The canonical lockfile keeps the supported installation reproducible. The small TypeScript execution dependency preserves shared source conventions while removing the extra runtime installation.
