# Public UI dependency

`datafox-ui-0.1.13.tgz` contains `@datafox/ui` built from the public
[datafoxlabs/datafox-ui](https://github.com/datafoxlabs/datafox-ui) repository,
commit [`4ac71ae19b4aa7734fb15181be2ee90d1417696e`](https://github.com/datafoxlabs/datafox-ui/commit/4ac71ae19b4aa7734fb15181be2ee90d1417696e).

The package is not yet available on the public npm registry. This local dependency
lets `npm ci`, tests, the demo and library builds run without a private registry.
The library keeps `@datafox/ui` as a peer dependency so applications can share one
UI runtime. To consume a packed trace-timeline build in another application,
install this archive alongside that build.

- Package version: `0.1.13`
- SHA-256: `c9596eb36c4034b6a7a194c11e6baa0077e8e56ba8a8329278bca261ec513249`
- License: Apache-2.0; the bundled Roboto Mono font uses SIL OFL 1.1.
  Both licenses are included in the archive.
- Build tools used: Node.js `24.19.0`, pnpm `11.15.1`.

To rebuild from the same public source:

```sh
git clone https://github.com/datafoxlabs/datafox-ui.git
cd datafox-ui
git checkout --detach 4ac71ae19b4aa7734fb15181be2ee90d1417696e
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
pnpm build
npm pack --ignore-scripts
```

When replacing the archive, update its checksum here and regenerate
`package-lock.json`. Validate the archive contents, run tests, typecheck and build
before committing it.
