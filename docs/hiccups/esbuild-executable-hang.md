# esbuild executable hangs on macOS

On 2026-09-25, a template checkout stalled during Nuxt dev and production builds. Vite stopped during transformation, and the dev server returned HTTP 503. Running `node_modules/@esbuild/darwin-arm64/bin/esbuild --version` also hung. Several esbuild processes remained in macOS `UE` state at 0% CPU.

## Diagnose

Check the installed executable directly before changing Nuxt configuration or dependencies. Inspect existing esbuild processes first; an executable stuck in `UE` may remain after a kill signal, so avoid repeated probes. If a new probe is needed, bound it with a short timeout.

Compare the installed binary with a fresh copy using `shasum -a 256`, `ls -liO@`, `xattr -l`, and `codesign --verify`. Check both `node_modules/@esbuild/darwin-arm64/bin/esbuild` and `node_modules/esbuild/bin/esbuild`: Bun may install them as hard links to the same inode. A copy that runs from the same package directory while the installed inode hangs is strong evidence that the problem follows the inode or its macOS execution state.

In the observed case, the installed binary and working copy had identical bytes, a valid identical embedded signature, the same `com.apple.provenance` attribute, and the same permissions. A sample of an already hung process showed only `_dyld_start`. These observations ruled out a changed esbuild payload, but did not establish the precise macOS cause. The provenance attribute and `777` permissions alone were not the cause: a new copy with both ran successfully.

## Repair and verify

Preserve the original inode and its metadata before replacing it. If the two installed paths are hard links, move both original links into an evidence directory on the same filesystem. Copy the executable to a new inode with `cp -p`, install that copy at the platform-package path, and restore the wrapper path as a hard link to it. Check the inode numbers and hashes afterward. Do not change global macOS security settings or reinstall unrelated dependencies.

Run `--version` from both installed paths, then run the normal `bun run build` with `ESBUILD_BINARY_PATH` unset. The template checkout passed both checks after its two paths were replaced with a fresh inode. Existing hung processes were left untouched.

This is a local installation failure, not a core source-code defect. A separate prediction-task build failure arose when a dev server and build rewrote shared Nuxt build metadata concurrently; that case was resolved with an isolated Nuxt build directory and should not be diagnosed as an esbuild executable hang.
