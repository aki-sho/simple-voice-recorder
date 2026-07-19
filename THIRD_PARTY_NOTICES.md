# Third-Party Notices

Simple Voice Recorder includes or is built with third-party software. Each
component remains subject to its own copyright and license terms.

## Runtime and build framework

### Tauri

- Components: `tauri`, `tauri-build`, `tauri-runtime`, `tauri-utils`, `wry`
- License: Apache License 2.0 OR MIT License
- Project: https://github.com/tauri-apps/tauri

### rfd

- Component: `rfd`
- Purpose: native folder selection dialog
- License: MIT License
- Project: https://github.com/PolyMeilex/rfd

### Serde and serde_json

- Components: `serde`, `serde_derive`, `serde_json`
- Purpose: settings serialization
- License: Apache License 2.0 OR MIT License
- Projects: https://github.com/serde-rs/serde and https://github.com/serde-rs/json

## Audio encoding

### lamejs

- Component: `lamejs` 1.2.1
- Purpose: MP3 encoding in the application frontend
- License: GNU Lesser General Public License v3.0
- Project: https://github.com/zhuker/lamejs
- Upstream LAME project: https://lame.sourceforge.io/

The distributed `src/vendor/lame.min.js` file is an unmodified copy of the
`lamejs` 1.2.1 package. The package's license notice is preserved in
`THIRD_PARTY_LICENSES/lamejs-LICENSE.txt`.

### use-strict

- Component: `use-strict` 1.0.1
- Relationship: npm dependency declared by `lamejs`
- License: ISC License
- Project: https://github.com/isaacs/use-strict

The package's license text is preserved in
`THIRD_PARTY_LICENSES/use-strict-LICENSE.txt`.

## Windows distribution

### Microsoft Edge WebView2

- Component: Microsoft Edge WebView2 Runtime
- License: Microsoft software license terms
- Project: https://developer.microsoft.com/microsoft-edge/webview2/

The WebView2 Runtime is not bundled with the portable EXE. The NSIS installer
can download the Evergreen WebView2 bootstrapper when the runtime is missing.

### NSIS

- Component: Nullsoft Scriptable Install System
- Purpose: Windows installer generation
- License: zlib/libpng license
- Project: https://nsis.sourceforge.io/

## Transitive dependencies

Exact Rust dependency versions are locked in `src-tauri/Cargo.lock`. Exact npm
dependency versions are locked in `package-lock.json`. Package metadata can be
inspected with:

```powershell
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1
npm ls --all
```

This notice is informational and does not replace the license text distributed
by each third-party project.
