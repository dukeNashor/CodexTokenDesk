# Instrument UI verification — 2026-09-07

final result: passed

## Visual target and evidence

- Selected target: first displayed design, `C:/Users/sunjiawei/.codex/generated_images/01a079d6-949b-7b62-a6f9-5b7d91073601/exec-46124d2d-28c8-4fdc-84fa-05544ca17f00.png`.
- Implementation: `http://127.0.0.1:3003`, local development preview; installed application on 3002 was not changed.
- Evidence directory: `C:/Users/sunjiawei/.codex/visualizations/2026/09/07/01a079d6-949b-7b62-a6f9-5b7d91073601/`.
- Accepted desktop: `implemented-desktop-final.png`; source and implementation both 1487 × 1058 pixels, browser CSS viewport 1487 × 1058, screenshot density 1. No rescaling needed.
- Accepted mobile: `implemented-mobile.png`, `implemented-mobile-nav.png`, viewport 390 × 844. No mobile reference was supplied; these are responsive checks, not pixel-fidelity comparisons.
- Full-view comparison: source and implementation were opened together in the same tool result. Final capture restores the sidebar scroll to the top. Data differs intentionally: the mock uses illustrative rounds; implementation uses the real 19-round session, first 16 rounds, M units, Function Calling enabled for tool verification. The live sidebar totals can change between captures.
- Detail inspection: readouts, tags, axes, unknown hatch, tool counts and filter labels inspected at native screenshot size; these were legible without an additional crop. The attempted `implemented-analysis-detail.png` capture did not honor the requested clip origin and was rejected; it is not comparison evidence.

## Comparison history

1. Initial real-data inspection found the chart scaled to nearly twice its intended size for short sessions (P1): a variable SVG width caused the graph to consume the viewport. Fixed the viewBox width and distributed round slots within it; checked 7-round, 19-round and final 3-round pages.
2. Initial desktop proportions differed from the selected mock (P2): narrow sidebar and duplicate session header. Expanded the desktop sidebar to the reference proportion and consolidated the selected title into the top instrument header.
3. Filters were separated from the analysis instrument and fell below the first screen (P2). Moved the existing controls onto its bottom panel, trimmed vertical chart gaps, and increased chart labels. Post-fix evidence: `implemented-desktop-final.png`; the analysis instrument and controls fit the 1058px viewport.
4. Ring contours were too dark on the new LCD surface (P2). Adjusted its source and Context palette, track background, band opacity and tool outlines while retaining its interactions. Browser verified the rendered ring and switch back to tracks.

No remaining actionable P0/P1/P2 visual findings in the checked states.

## Fidelity surfaces

- Typography: existing local DSEG7 retained for numeric meters; Chinese uses the existing system UI font. Small repeated explanatory text removed; units and state labels retained. Main title truncates with a full native title.
- Spacing: separate stacked primary/secondary instruments, left navigation, large lower analysis screen and physical-style controls follow the selected layout. Wide source labels remain available through accessible names/native titles.
- Colors: ivory matte housing, dark forest-green glass, mint readouts, amber event markings; muted model stamps and corner tags retained. Token and Context plotting remains code-native SVG data visualization, not a rasterized UI.
- Assets: generated matte surface texture is local at `public/images/instrument-surface.png`; background material is visually subtle with no distracting repeat boundary in checked screens. Existing logo and vector icons reused. No remote font/image dependency added.
- Copy: dollar reading and estimate badge retained; the redundant dollar-equivalent subtitle removed. Subscription and Sol comparison basis are available in disclosures. The mock's invented Export/Settings buttons were not implemented. Existing date/model/status/tool controls remain available.

## Functional verification

- Tracks are the initial view; ring toggles successfully and returns to tracks.
- Pagination reaches rounds 17–19 and disables Next at the end; Token scale stays constant between pages.
- Enter opens round 17 in the existing detail drawer; Escape closes it.
- Function Calling filter exposes tool counts; a five-call cell expands all five calls; a call opens its tool drawer.
- Unmatched round search displays an explicit empty state; clearing search restores rounds.
- Total overview, date filtering, mobile navigation opening/closing tested.
- No document-level horizontal overflow at 1487px or 390px; tracks use a local scroll region at narrow widths.
- Browser error log: no errors at final inspection.
- `pnpm typecheck`, `pnpm check:secrets`, and production `pnpm build` passed.
- `pnpm exec vitest run --exclude '**/.next/**'`: 10 source test files, 69 tests passed. Four new rendering tests cover zero/unknown data, source identity, unknown compaction endpoints, tool grouping/filtering and pagination/empty state.

## Assumptions and unmodified issues

- Track columns follow existing aggregated round order, not elapsed time. Context positions inside a round use recorded Token offsets. Different sources are not joined into a misleading continuous curve.
- Source lanes expose recorded parent-thread identity; no exact parent-round relationship is fabricated where the data only provides a parent thread. Separate child rounds retain their own selectable columns.
- Existing tool category defaults are unchanged. Function Calling was explicitly enabled for verification; it is not newly enabled by default.
- Graph labels and controls are slightly more compact than the mock to preserve all real filters. The mock's fictitious values and extra actions are not acceptance requirements.
- Not installed into the Windows tray distribution, committed, or deployed. No billing/parser/API behavior was changed.
- Existing broad Next.js file tracing warning remains. Existing Vitest discovery also finds copied tests in `.next/standalone`; source-only verification excludes that directory without changing repository test configuration.
- Existing drawer focus management and all rare error states were not redesigned or exhaustively audited. Touch-device hardware, all raw-number lengths, and every browser engine were not tested.
- P3 follow-up: further typography/material tuning is possible; exact mathematical texture tiling was not verified.

## Asset provenance

## LCD navigation and split track revision — 2026-09-07

- User confirmed: only projects collapse; individual sessions remain direct detail links. Project modules now use a hinge-like control and inset title LCD; sessions use independent green LCDs, brighter selection, retained diagonal model stamps and corner badges. Recent-view selection controls remain separate.
- Token and Context now occupy separate framed screen windows with chassis title strips. Both remain in one SVG and scroll region to preserve exact column alignment, paging and shared highlighting. The chassis gap is outside round hit targets. Context unknown/compaction markers and source/tool lanes were shifted together.
- Checked desktop and 390×844 mobile screenshots, project expansion, session opening, keyboard round opening, paging, recent-view controls, and mobile navigation. No document horizontal overflow; narrow tracks scroll locally. Browser error log empty.
- Verification: typecheck, 69 source tests, production build and git diff whitespace checks passed. Existing Next.js tracing warning remains. No new dependencies or tests added for this visual revision.
- Evidence: `C:\Users\sunjiawei\.codex\visualizations\2026\09\07\01a079d6-949b-7b62-a6f9-5b7d91073601\lcd-navigation-split-tracks.png`.
- No unconfirmed behavioral assumptions introduced. No installed-version update, deployment or commit. Existing drawer focus management and test discovery issues above remain outside scope; exhaustive browser/touch hardware coverage was not repeated.

### Existing texture asset

### LCD surface and scale detail — 2026-09-07

### Fixed LCD legend segments — 2026-09-07

#### Correction: natural electrode junctions

- Removed the whole-word two-stripe CSS mask: it produced aligned black cuts rather than electrode gaps. Model legends now use a hand-authored fourteen-segment SVG alphabet, with separately tapered polygons and local junction spacing. Existing model colors, ghost layer and selected glow remain intact.
- Latin letters, digits, spaces, hyphens and decimal points are supported. Other model labels keep their original readable text rather than dropping characters. Chinese tags remain unchanged, as previously agreed.
- Desktop and 390px navigation screenshots checked; no continuous mask cuts remain. Typecheck, 69 source tests and production build passed. No new screenshot-assertion test was added for this visual judgment. No deployment/install/commit; existing tracing and focus-management issues remain out of scope.
- Screenshot: `lcd-electrode-junctions.png` in the screenshot directory above.

- User clarified fixed, switchable LCD icon segments (not surface printing), retaining model colors and fluorescence. Added shared `LcdTag` dark/illuminated glyph layers for model names, effort/plan corner legends, estimate/quality labels, model chart basis labels, and table status labels.
- Model legends retain their diagonal placement with two narrow geometric gaps. Selected sessions glow more brightly; other models remain readable. Chinese glyphs remain intact. Inactive fixed plan/unpriced/missing-information slots retain faint ghosts and are aria-hidden; decorative duplicates are also hidden from assistive technology.
- Reversible styling choice: labels on pale chassis use a compact dark LCD backing; labels already inside glass use transparent backing. Model legends were reduced to 28px and raised to avoid clipping on narrow cards.
- Typecheck, 69 source tests, and production build passed (existing tracing warning remains). Desktop/mobile screenshots and inactive-tag DOM semantics checked; no document overflow at 390px. Existing navigation controls and tag meanings retained.
- No installation, deployment, commit or unrelated cleanup. Existing drawer focus and test-discovery limitations remain; exhaustive device/accessibility coverage was not performed. Evidence: `lcd-segment-tags.png` in the screenshot directory above.

- Applied the approved restrained static pixel texture and narrow glass edge reflection/inset shadow to navigation screens, numeric meters and chart surfaces. `public/images/lcd-pixels.svg` is a local hand-authored 4×4 SVG tile, distinct from the diagonal unknown-data pattern. No animation, new copy or dependency was added.
- Context retains numeric labels at 0/50/100%, with darker 10% full-width guides and 5% edge ticks. Dotted round boundaries align across both windows. Decorative SVG geometry is hidden from accessibility and ignores pointer input; real curves and unknown/compaction geometry remain unchanged.
- Checked desktop and 390×844 screenshots, local horizontal scrolling with no document overflow, and keyboard opening of the round detail dialog. Typecheck and 69 source tests passed. Evidence: `lcd-detail-desktop.png` and `lcd-detail-mobile.png` in the screenshot directory above.
- No new behavioral assumptions. Digit glyphs, data semantics and interactions were retained; no exhaustive browser/device coverage, installed-version update or commit. Previously documented build/discovery/focus issues remain outside scope.


Built-in imagegen generated `public/images/instrument-surface.png` (1254 × 1254); original output preserved. Prompt: “Seamless repeating raster material texture for a warm ivory laboratory instrument chassis; flat orthographic full-bleed warm ivory-gray matte plastic near #d8d4c5, exceptionally subtle fine grain, uniform even illumination; no perspective, highlights, shadows, vignette, gradient, objects, borders, outlines, text, screws, scratches, dirt, stains, or seams; extremely low contrast.”


## Compact summary, pixel type and source-continuous scope — 2026-09-07

- Removed inactive plan-excluded legends entirely; actual Spark plan-excluded legends remain.
- Combined six summary readouts into one LCD glass with a desktop six-cell row and a two-column mobile grid. Existing estimate states, units, unknown cache rate and expandable input/output details remain. Measured desktop glass height about 92px.
- Removed the Token/Context plot's overflow container and fixed minimum width. ResizeObserver drives available width and at most 16 rounds/page; 390px viewport shows 4 rounds with M units and 3 with long raw values. Page controls, source/tool rows and keyboard selection remain. Main page controls vertical scrolling; composition chart retains its existing horizontal browsing behavior.
- Context connects known endpoints of successive rounds of the SAME rollout/source with distinct colors; unknown rounds break continuity. A compaction at a round boundary suppresses a normal connector, and compactions have amber dashed jumps and diamond event marks. No connection crosses independent sources. The x-axis remains round order and recorded within-round Token offsets, not elapsed time. The full-word source label is still exposed in titles/accessible labels when shortened visually.
- Added local Fusion Pixel Font 10px zh_hans from the official 2026.07.20 release for scope/composition text. Source: https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.07.20 . Font and upstream SIL OFL notices copied from its release archive into public/fonts; no runtime external font calls. Decorative pixel texture remains separate from unknown-data hatching.
- Validation: 73 tests in 11 source suites, typecheck, production build and client secret check passed. New continuity tests cover interleaved sources, unknown/zero values, boundary compression and end-of-round samples. Browser verified loaded pixel font, no inner plot overflow, desktop/mobile paging, raw-unit layout, keyboard detail dialog and grouped tools (5 calls). No browser errors; no document horizontal overflow at 390px.
- Evidence: compact-scope-desktop.png and compact-scope-mobile.png in the screenshot directory recorded above.
- Assumptions follow the confirmed design; same-source gaps use step connections between sampled states, without inventing additional intermediate samples. More than five visible sources reuse the color palette but retain source labels. Installed distribution, commit and deployment were not updated. Existing file-tracing warning, test discovery of standalone copies, and drawer focus management remain out of scope. No exhaustive hardware/browser/rare-data visual audit was performed.


## Larger primary scopes and cursor source labels — 2026-09-07

- Applied the agreed desktop first-screen budget: summary plus Token/Context end at approximately 89% of the measured 1234px viewport. The plot responds to viewport height, with 40/60 Token/Context allocation and a 540px minimum on narrow screens. Only the outer document scrolls.
- Increased plot axes, round numbers and values to 20px pixel text. Responsive pagination now fits 14 rounds at the tested desktop width and 2 at 390px; raw values remain readable without document horizontal overflow.
- Removed standalone main/child source rows. All known Context segments, including cross-column connectors, expose source-specific pointer targets; hover shows the full recorded source label beside the cursor and highlights the matching curve. Tooltip bounds are clamped to the viewport. Touch/click and accessible keyboard round detail remain.
- Browser verification: an interleaved child connector showed the correct child label and opened that child's round 9 detail; desktop and mobile geometry, raw-unit paging and overflow checked. Evidence: large-scope-desktop.png and large-scope-mobile.png in the screenshot directory above.
- Validation: 74 tests across 11 source suites, production build with TypeScript validation, and client secret check passed. The existing whole-project tracing warning remains.
- Assumptions follow the confirmed design; on short/mobile viewports minimum readable plot height takes priority over fitting a single screen. No installation, deployment or commit; no exhaustive device or accessibility audit. Existing drawer focus management, repeated source colors beyond five, and standalone test-discovery limitations remain unchanged.


## Floating turn inspector — 2026-09-07

- User revised the initially approved dock layout during implementation: final desktop panel floats above the right side, with no backdrop, blur, or background resizing. Confirmed plot width remains 1329px while the inspector is 560px at the tested desktop size.
- LCD source-color header, segmented status/model tags and four readouts precede collapsible metadata/Token breakdown and subscription details. The dark record screen uses regular 15px text, pixel headings, and rendered Markdown with a raw-source toggle. Existing messages, outputs, compactions and tool metadata remain accessible. Markdown uses react-markdown + remark-gfm; HTML stays inert, image references are links.
- Desktop arrows navigate the filtered plot sequence, with source+turn identity, no wrapping and separate same-source navigation. Input/editable controls, modifiers and text selection keep native behavior. Chart pages follow the selected round and retain a selected highlight. Removing the selection through filters closes the inspector. Tool view provides return to the owning round.
- Verified in the browser: child round 9 -> main round 10 by Right, Left back to 9, same-source 9 -> 7 and back, switching after navigation-button focus, background round selection, first-round boundary, input-arrow protection, Markdown/raw toggle, and unchanged background width. At 390x844 the panel is full screen without horizontal overflow; background is inert, Tab/Shift+Tab wrap within visible controls, and closing restores focus to the originating SVG round.
- Evidence: turn-inspector-desktop.png and turn-inspector-mobile.png in the screenshot directory above.
- Assumptions: desktop threshold follows the existing 900px mobile breakpoint; desktop width caps at 560px. No installed distribution update, deployment or commit. No exhaustive browser/device/assistive-technology audit; more than five source colors still repeat. Existing build file-tracing and standalone test-discovery warnings remain out of scope.
- Final validation: 80 tests in 13 suites, typecheck, production build, diff whitespace check and client secret check passed. Existing NFT tracing warning remains.


## Context delta fluorescence — 2026-09-07

- Selected or hovered rounds show one source-colored 20px pixel label above their highest Context segment, without a card background. Hover takes priority; pointer exit restores selection. Labels avoid chart edges, ignore pointer input, and expose exact Token changes in their accessible label. Compact units adapt to magnitude independently of dashboard units.
- Delta uses current minus immediately preceding same-source snapshot, computed from selected.turns before local model/status/search filtering and pagination. First rounds and unknown endpoints show an em dash, known zero shows ±0; compression remains a net change with the existing independent amber event marks.
- 84 source tests and typecheck passed. Tests cover interleaved identities, zero/negative values, unknown baselines, compression and a filtered-out predecessor. Browser verified selected round 2 (+11954 Token), hover round 3 (+531), and restoration to round 2; screenshot context-delta.png saved in the QA directory.
- Scope is the default track display; the optional double-ring renderer is unchanged. No installed build update or commit, and no exhaustive device/source-overlap visual audit. Existing tracing warning remains out of scope.

- User revision: Context delta now compares occupancy rates and displays signed percentage-point change (+5%, −2.4%, ±0%). Absolute Token deltas are no longer shown. Accessible text explicitly names percentage points. Small nonzero changes display <0.1% with direction; baseline, unknown and hover rules stay the same.

- First-round baseline revision: the first known Context snapshot for each source now compares with zero. An existing unknown predecessor remains unknown. Full-history baselines are attached before date filtering, so the first visible round of a date range is not mistaken for the source first round.
- Two-line annotation revision: 30px final occupancy above 16px signed percentage-point change, both source-colored, with weaker secondary glow. One decimal retained; unknown fields remain independent. Reserved Context top headroom keeps both lines above high-occupancy curves. Browser verified 27.0% / +4.6%, exact 30px / 16px sizing; typecheck and six track tests passed. No installed build update, commit or exhaustive device audit.

- Crossing hover fix: resolve overlapping 14px hit strokes by nearest rendered polyline for both pointer hover and click. Exact distance ties prefer the current column's own turn. Preserve cross-column source identification and destination-round navigation. Regression tests cover paint-order independence, parallel overlap, exact crossings, vertical segments and degenerate endpoints. Browser confirmed main round 10 and child round 9 can both be reached at the same x with ~5.5px y separation, and clicking the main line opens round 10. 88 tests and typecheck passed. No installed update or commit; exhaustive device overlap testing remains out of scope.

- User-message recovery: parser supported event_msg/user_message but ignored response_item/message with role=user. A minimal parser regression returned [] before the fix and the expected message afterward. Added response-item parsing and per-turn, cross-format pairing without collapsing repeated same-format messages. 91 tests and typecheck passed. After restarting only dev port 3003 to invalidate its in-memory parsed-file cache, the UI-design session reported 35 user messages (previously zero), and the fee-table session round 2 visibly rendered its user question. No raw-log changes, installed port 3002 update, or commit. Existing orphan-message attribution policy and cache invalidation on parser hot reload remain unchanged.
