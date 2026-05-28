# `luc-features/` — Loyola customizations

Each feature added to Loyola's NDE customization (chat, HathiTrust,
EBSCO integrations, "Try My Search In…", etc.) lives in its own folder
here. The convention below keeps features self-contained, consistent
across the bundle, and structurally ready to be lifted into a
standalone NDE add-on later for sharing with CARLI peers.

## Layout

```
luc-features/
├── _shared/                       # Cross-feature utilities
│   └── primo-query.ts             # Parses Primo's ?query=… URL params
├── <feature-name>/
│   ├── <feature-name>.component.ts   # Config + helpers + component, one file
│   ├── <feature-name>.component.html
│   └── <feature-name>.component.scss  # Only if styles beyond NDE's theme are needed
└── README.md (this file)
```

**Brand assets** (SVGs, logos for third-party systems) do **not** live
here. They go in the view's assets directory so each view can ship
different branding:

- `views/<institution-view>/assets/images/` — content images, third-party logos
- `views/<institution-view>/assets/icons/` — NDE UI icon overrides

Reference assets from templates as plain `assets/images/...` —
`AssetsPublicPathDirective` (in `app/services/`) rewrites the base URL
at runtime.

## Code style

- **Contemporary TypeScript**, standalone Angular components.
- **Function declarations** for top-level / named definitions.
- **Arrow functions** for callbacks, closures, and inline lambdas
  (`.map`, `.filter`, `.subscribe`, RxJS operators, short one-liners).
- **Template literals** for string composition — no `+` concatenation.
- **`async`/`await`** where applicable.
- **Comments only where the WHY isn't obvious.** No restating what the
  code does; document hidden constraints, surprising behavior, or the
  reason for a non-obvious choice.
- **Named exports only**, no default exports — keeps imports greppable.
- **One feature = one folder, one `.ts` file** unless the feature
  genuinely outgrows it (~300 lines or independent, separately testable
  helpers).

## Configuration

Each feature puts its institution-specific values (URLs, IDs,
identifiers like EBSCO `custid` or Google Scholar `inst`) in a **block
of `const`s at the top of the component file**. This block is the
seam: it's the contract that gets replaced by `MODULE_PARAMETERS`
injection when extracting the feature to an add-on. Everything else
moves to the add-on unchanged.

## Registering a feature

Add a single line to `customModule/src/app/custom1-module/customComponentMappings.ts`:

```ts
['<slot-selector>', MyFeatureComponent],
```

…where `<slot-selector>` is an NDE extension-point custom-element
name. The documented naming convention is `nde-{component}-{position}`
where position is `before`, `after`, `top`, `bottom`, or empty
(replace). The full slot catalog isn't documented in customModule's
README — verify a selector by running `npm run serve` and inspecting
the DOM for the empty `<nde-…>` placeholder element. If none exists,
consult Ex Libris documentation or open a support case.

## Path to add-on extraction

When a feature is mature enough to share with other libraries:

1. The config block at the top of the component becomes parameters
   injected via the `MODULE_PARAMETERS` token (see customModule
   README, "Developing an Add-On" section).
2. The component, HTML, SCSS, and any `_shared/` imports move into
   the new add-on repo. `_shared/` utilities either get copied or
   extracted into a small published library.
3. The feature is registered in Alma's Add-on Configuration with a
   JSON parameter block matching the original config shape.
