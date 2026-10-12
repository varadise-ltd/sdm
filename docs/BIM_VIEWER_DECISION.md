# SDM BIM Viewer Decision

## Decision

Use a dedicated read-only BIM renderer behind a BimViewerAdapter interface.

## Why this fits SDM

SDM needs controlled inspection of approved model revisions: 2D/3D viewing,
model and storey navigation, object selection, properties, visibility controls,
sectioning, and saved viewpoints. Keeping the viewer behind an adapter lets the
platform change rendering engines without changing the repository, permissions,
workflow, or audit model.

Pascal remains technically interesting for future editable digital-twin
experiences, but SDM's first BIM requirement is controlled inspection of
approved model revisions. Native BIM authoring remains outside the SDM scope.

## Proposed SDM integration

1. Store the original IFC revision as an immutable file asset.
2. Create a model-revision record linked to the SDM container revision.
3. Convert IFC and extract metadata in a background worker.
4. Store derived model assets and metadata with content hashes in private storage.
5. Open the viewer from package detail or a Drawing Hub link.
6. Issue short-lived, permission-checked URLs for model assets and metadata.
7. Record model opens, downloads, viewpoints, and review actions in the audit log.

## MVP viewer capabilities

- 3D model viewing
- IFC object tree and storey navigation
- Object selection and property inspection
- Hide, isolate, highlight, and X-ray modes
- Section planes
- Multiple model loading for federated packages
- Camera reset and saved package viewpoint

BCF viewpoint exchange, comments, markup, measurements, clash review, and live
collaboration should follow as later increments.

## Licensing gate

The selected renderer and its distribution must be reviewed for compatibility
with the intended COSMOS deployment. No production release should ship a
renderer dependency until that review and the required commercial or open-source
distribution decision are recorded.
