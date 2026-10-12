# Handoff: COSMOS AppOS

## Overview

**COSMOS AppOS** is an AI App Operating System that helps users discover managed data, generate apps with AI, design interactive blueprints, publish applications, manage data interfaces, and monitor app operations.

Positioning line: *"COSMOS AppOS does not only help you generate apps. It helps you build them, connect data, publish them, and continuously monitor whether they are running properly."*

This handoff covers the **end-to-end golden path** across all 8 modules of COSMOS AppOS, threaded through a single example app: **Safety Inspection Tracker** (Form Hub + Workforce Hub).

The design lives inside the broader **Varadise** design language — a warm off‑white, navy‑CTA, hairline‑card SaaS aesthetic. COSMOS AppOS is a sibling product surface to Varadise's System UI, so it must feel like part of the same portfolio.

## About the Design Files

The files bundled in this handoff (`index.html`, `app.jsx`, `screens/*.jsx`, `components/*.jsx`, `colors_and_type.css`, etc.) are **design references created in HTML** — a working prototype that shows the intended look, layout, and interaction. They are not production code to ship directly.

The task is to **recreate these designs in the target codebase's existing environment** (React + Tailwind, Next.js, Vue, SwiftUI, whatever the team already runs) using its established patterns, component library, and routing conventions. If no environment exists yet, pick the most appropriate framework for the project — React + Vite + Tailwind is a safe default — and implement the designs there.

The Varadise design tokens (`colors_and_type.css`) and Lucide icon substitutions used here should be either (a) reused verbatim if the team is happy with them, or (b) swapped for the team's canonical tokens/icons before shipping. The **color values, spacing scale, and type scale documented below are the source of truth** for how the design should render, regardless of implementation technology.

## Fidelity

**High‑fidelity (hi‑fi) clickable prototype.**

- Pixel‑perfect layouts with final colors, typography, spacing, and hairline borders.
- Real interactions: mode toggle, hover states, animated generation pipeline, click‑to‑annotate wireframe, tab switching, AI chat messages, live traffic chart, filter tabs.
- Persistent state (`localStorage` for current screen).
- Responsive‑friendly desktop‑first layouts; every screen is built with CSS grid/flex and readable down to ~1280px.

Recreate pixel‑perfectly. Where the target codebase already has an equivalent primitive (Button, Pill/Badge, Card, Modal, Segmented Control), use it and configure it to match the tokens; do not fork.

## Screens / Views

The app has a single fixed **left rail** (68px) plus a full‑bleed content area. The rail is present on every screen. Content screens are keyed by `screen` state and cross‑fade on transition (`cos-fade-in` animation, 320ms, `cubic-bezier(0.2, 0, 0, 1)`).

### 0. Global Chrome — Left Rail (`AppSidebar`)

- **Width**: 68px, `position: sticky; top: 0; height: 100vh`
- **Background**: `#FFFFFF`, right border `1px solid #E6E8EC`, top padding `14px`
- **Brand mark tile** at top: 44×44 square, radius 10px, `#0F172A` fill, contains the custom `CosmosMark` SVG (a horizontal arc echoing the Varadise wordmark with four small dots representing apps — three across the top, one large below). Icon is 22px, white stroke.
- **Primary sections**:
  - Top group: `AppOS` (sparkles icon), `Data Hub` (database), `My Apps` (layout‑grid)
  - Horizontal 1px divider (`#E6E8EC`, 28px wide)
  - "APP" label eyebrow (9px, 700, uppercase, `#9AA1AE`, letter‑spacing `.08em`)
  - Bottom group: `App Design` (wand‑2), `Data Management` (plug), `Monitoring` (activity)
- **Rail item behavior**: 44×44 rounded 10px tile. Default color `#667085`. Hover fill `#F5F7FA`. Active fill `#E7EEF4`, color `#20668F`, plus a 3px‑wide, 24px‑tall pill of `#20668F` on the left edge (12px outside the tile). Transition: `background 120ms, color 120ms`.
- **Foot**: settings gear (44×44, `#667085`), then a 32×32 avatar chip (background `#3167E3`, white 11px 700 "KL" initials).

### 1. Chat Home (`ChatHome`)

**Purpose**: entry point. User picks a mode, writes a prompt, and hits Generate/Design.

**Layout**:
- Slim top bar 52px tall (background `#FAFAFB`, bottom border `1px solid #E6E8EC`, padding `0 24px`). Left: breadcrumb "COSMOS AppOS › Home". Right: success pill "8 Hubs connected" (`#E7F5EC` bg, `#17803D` fg, `#B7DFC2` border) + bell icon.
- **Centered hero** — flex column, gap 32, max‑width **760px**, padded `48px 32px 32px`. Vertically centered within the remaining viewport.
- **Wordmark row**: 48×48 black tile (radius 12, `#0F172A`) with the `CosmosMark` (26px, white), then a text block:
  - Line 1: "COSMOS **AppOS**" — 26px, 700, letter‑spacing −0.02em. "COSMOS" is `#0F172A`; "AppOS" is `#20668F`.
  - Line 2: "AI App Operating System · v1.4" — 12px, `#667085`, 4px above.
- **Hero title**: "Turn your data into a working app." — 34px, 700, letter‑spacing −0.02em, line‑height 1.2, `#1B202D`, centered.
- **Hero subtitle**: 16px, `#4B5361`, max‑width 560px, centered, 12px above.
- **Mode toggle** (segmented pill):
  - Container: `#FFFFFF`, 1px border `#E6E8EC`, radius 999, padding 4.
  - Two buttons: **Spark** (icon `zap`) with subtitle "Generate now" and **Blueprint** (icon `pen-line`) with subtitle "Design first". Icon 15×15 left; two‑line label right (13px 600 title / 11px 0.75 opacity subtitle).
  - Active button: `#20668F` fill, white text. Inactive hover: `#F5F7FA` fill.
- **Prompt composer** (the hero surface):
  - Card: white, radius 16, padding `18px 20px 14px`, border `#E6E8EC` (default) → `#20668F` when focused with a 4px‑wide `rgba(32,102,143,0.12)` glow.
  - Textarea auto‑grows 52 → 180px. Placeholder depends on mode:
    - Spark: *"Describe the app you want to create. You can use connected data or start with mock data."*
    - Blueprint: *"Describe the app you want to design. AppOS will create an interactive wireframe first."*
  - Below the textarea: 1px top divider (`#F0F2F5`) with two rows — left: three ToolChips (Spark shows *"Form Hub · Workforce Hub"*, *"Real data"*, *"Attach"*; Blueprint shows *"Choose data"*, *"Desktop · Responsive"*, *"Attach"*). Right: the submit pill.
  - Submit pill: radius 999, `#20668F` bg, white text 13 600, icon `arrow-up`. Disabled state: `#EEF1F4` bg, `#9AA1AE` fg, cursor not‑allowed. Label is *"Generate"* in Spark mode, *"Design"* in Blueprint.
- **Suggestions block**: eyebrow row (`zap`/`pen-line` icon + "Start from a prompt" or "Start from a blueprint" — 11px 600 uppercase `#667085`), then a stack of 4 (Spark) or 3 (Blueprint) suggestion buttons.
  - Suggestion button: white card, radius 12, padding `12px 14px`, border `#E6E8EC` (hover `#CBD1DA` + bg `#F9FAFB`). Contains a 32×32 tile (`#F3F4F1` bg, `#20668F` icon) + two‑line text + `arrow-up-right` icon on the right (`#9AA1AE`). Clicking a suggestion fills the prompt and immediately submits.
- **Recent apps strip**: eyebrow row with a *"View all"* link on the right. Grid of 3 cards.
  - Card: white, radius 12, padding `14px 16px`, border `#E6E8EC`, hover border `#CBD1DA`. Row 1: app name (13, 600). Row 2: metadata (11 `#667085`) + status pill.

**Interactions**:
- Cmd/Ctrl+Enter submits the prompt.
- Suggestion click sets prompt and submits after 100ms.
- Recent app "Safety Inspection Tracker" routes to `design`; others also route to `design`.
- Mode toggle swaps placeholder text, submit label, tool chips, and suggestion list.
- Background: linear gradient `#FAFAFB 0% → #F3F4F1 100%` on the main column.

### 2. Data Hub (`DataHub`)

**Purpose**: browse enterprise data as if browsing folders.

**Layout**: `ScreenHeader` (title *"Data Hub"*, subtitle *"Browse the data connected to COSMOS. Point AppOS at any of it."*, two buttons: neutral *"Filter"* with `filter` icon, primary *"Connect Data Source"* with `plug` icon), then a 3‑column grid — **280px | 340px | 1fr** — flex‑1 height 100vh.

**Left column** — Hub Tree
- Background `#FFFFFF`, right border, padding `16px 12px`, overflow‑y auto.
- Eyebrow "HUBS" (11px 600 uppercase `#667085`).
- Each hub node: 8/10 padding, radius 8, cursor pointer.
  - Row: chevron toggle (12px, `#9AA1AE`) → hub icon (16px) → label (13, 500) → count pill (right).
  - Active hub: `#E7EEF4` bg, `#20668F` text, count pill white bg.
  - Expanded hub: shows nested data set list (marginLeft 28, borderLeft `#E6E8EC` + paddingLeft 8). Nested rows: 12px text, `#4B5361`. Selected nested: `#F3F4F1` bg + `#20668F` text bold.
- Hub list (with counts): IoT Hub (4), CCTV Hub (3), Notification Center (2), Form Hub (6, expanded by default), Drive Hub (5), Workforce Hub (4), Asset Hub (6), Equipment Hub (5).

**Middle column** — Data Set List
- Background `#FAFAFB`, right border, padding `16px 16px`.
- Header row: hub icon + hub name (15, 600) + set count pill (`#EEF1F4`/`#4B5361`).
- Search input: full width, radius 8, border `#E6E8EC`, padding `8/12/8/32`, prefix `search` icon at left 10/10 (`#9AA1AE`).
- Data set cards (stack, gap 8):
  - White, radius 10, padding `12/14`, border default `#E6E8EC`. Selected: border `#20668F` + 3px `rgba(32,102,143,.12)` glow. Hover: border `#CBD1DA`.
  - Row 1: set name (13 600) + status pill (small).
  - Row 2: `{records} records · {frequency} · {apps} apps` — 11 `#667085`.
- Status pill mapping: `connected` → success, `warning` → warn, `missing` → danger.

**Right column** — Field Catalog + Sample Data
- Background `#FAFAFB`, padding `20px 28px`, overflow‑y auto.
- **Header**: breadcrumb chip row (hub icon + hub name + chevron + "Data Set"), then title + description + two action buttons — neutral *"Export sample"* (icon `download`, size sm) and primary *"Use in AppOS"* (icon `sparkles`, size sm) which routes back to Chat Home in Spark mode.
- **5‑up mini stat grid** (`MiniStat` cards, radius 10): Records / Update Freq / Owner / Permission (success tint) / Used By (clickable, routes to `myapps`). Each shows a 12px uppercase label with icon + 16 700 value.
- **Fields table** (white card, radius 12, border):
  - Header row: 14 600 *"Fields (N)"* + two pills (`Primary: inspection_id` neutral with `key` icon, `2 references` info with `link` icon).
  - Table columns: Field / Type / Description / Example. TH: `#FAFAFB` bg, 11 600 uppercase `#667085`, letter‑spacing .04em. TR border top `#F0F2F5`. Field name in JetBrains Mono `#1B202D` 500. Type is a `TypeTag` chip (radius 6, `#F3F4F1` bg, mono 11 700, color per type — Text `#4B5361`, Number `#20668F`, DateTime `#7A3EA1`, Enum `#B27D3A`, Ref `#3167E3`, Image `#17803D`). Example column in mono `#667085`.
  - Field list for Safety Inspection Forms: `inspection_id` (Text), `site_id` (Text), `zone` (Text), `inspector_id` (Ref), `checklist_score` (Number), `critical_flags` (Number), `status` (Enum), `submitted_at` (DateTime), `signature` (Image).
- **Sample data table** (white card, radius 12): 14 600 title + "Showing 6 of 2,340 rows · updated 12 min ago" meta + "Refresh" link (12 `#20668F`). Body table in JetBrains Mono 12. Status column renders as a Pill (`reviewed` → success, `submitted` → info, `draft` → neutral). Score column colored by band: ≥90 `#17803D`, ≥75 `#4B5361`, else `#B27D3A`.

### 3. Spark Generation (`SparkGen`)

**Purpose**: show the AI generating an app from the prompt, then reveal the finished preview.

**Layout**: `ScreenHeader` (crumbs `["AppOS", "Spark Mode"]`, title *"Generating your app"*, subtitle *"AppOS reads your data, drafts the blueprint, and stands up a working preview."*, actions: neutral *"Back"* → `home`, plus a primary *"Open in Design"* (visible only when done) → `design`).

Then a 2‑column grid **380px | 1fr**, height 100vh.

**Left column** — Prompt + Pipeline
- Background `#FFFFFF`, right border, padding `24px`, overflow‑y auto.
- **Prompt card**: `#F3F4F1` bg, border `#E6E8EC`, radius 12, padding `14/16`. Eyebrow row (zap icon `#EA6A22` + "SPARK PROMPT") + prompt text (13 `#1B202D`, line‑height 1.5). Falls back to a default Safety Inspection tracker prompt.
- **Data Sources** section (eyebrow "DATA SOURCES", 8px gap, list of 3 rows):
  - Row: white, border `#E6E8EC`, radius 8, padding `8/12`, with left icon (14 `#20668F`), name (12 600) + hub (10 `#667085`) two‑liner, right `check` icon (12 `#17803D`).
  - Rows: `clipboard-list` Safety Inspection Forms (Form Hub); `users` Personnel Roster (Workforce Hub); `building-2` Sites & Zones (Asset Hub).
- **Pipeline** (eyebrow "PIPELINE", then a vertical timeline):
  - 6 steps, each with a 32×32 circular node (2px border) + label (13 600) + detail (11 `#4B5361`).
  - States:
    - **pending**: white bg, `#E6E8EC` border, `#9AA1AE` icon
    - **active**: `#20668F` bg, `#20668F` border, white icon, 4px expanding pulse ring (`cos-pulse` animation), label plus a blinking caret `cos-caret::after`
    - **done**: `#17803D` bg + border, white `check` icon, connector line above turns `#B7DFC2`
  - Vertical connector between nodes: 2px wide, `#E6E8EC` (or `#B7DFC2` when the previous step is done), starts 32px below the node.
  - Steps: `read` (database, "Reading connected data" / "Form Hub · Workforce Hub"), `model` (network, "Building data model" / "3 tables · 2 relationships"), `blueprint` (layout, "Designing app blueprint" / "Dashboard · List · Detail · Form"), `generate` (wand-2, "Generating UI & workflow" / "React components · rules · access"), `connect` (plug-2, "Wiring data bindings" / "Realtime & cached fields"), `review` (sparkles, "App ready to preview" / "Safety Inspection Tracker · v0.1").
  - Timing: first step starts at 800ms; each subsequent step advances every 900ms.
- After completion, a "Regenerate" link appears (12 600 `#20668F` with `rotate-cw` icon).

**Right column** — Generating Preview / App Preview
- Background `#F3F4F1`, padding 32.
- **While generating** (`GeneratingPreview`):
  - White card, radius 16, border `#E6E8EC`, padding 32, `overflow: hidden`, `min-height: 500`.
  - **Scanning line** overlay: 60px tall gradient bar animating vertically (`cos-scan`, 2.4s, ease‑in‑out, infinite) — top→bottom sweep, opacity dip at edges.
  - Header: 24×24 black tile + `CosmosMark` (14, white) + eyebrow "APPOS · GENERATING PREVIEW" (11, 700, `#20668F`, letter‑spacing .08em).
  - Skeleton row: 32×32 `#F3F4F1` circle + 220×14 bar + 140×10 bar.
  - **Stat row skeletons** (4‑column grid, gap 10): 72px tall placeholders that grow to 88px when `stepIdx > 2`. When `stepIdx > 3`, each replaces itself with a `FakeStat` (label + big number) via `cos-fade-in` (320ms). Static demo values: Inspections 48, Critical 3, Avg Score 87, Overdue 2.
  - **Big chart placeholder** (200px tall). At `stepIdx > 3` renders `FakeChart` — an SVG area chart with a `#20668F` line + 35%→0% opacity gradient fill.
  - **Two 120px table placeholders** (`FakeTableStub`) that populate rows when `stepIdx > 3`.
  - Progress bar footer: 3px track `#EEF1F4`, filled bar `#20668F`, animates width 600ms. Percentage label right, tabular numerals.
- **After completion** (`AppPreview`): fades in.
  - Header row: success pill `Generated` + label *"Safety Inspection Tracker · v0.1"* + three buttons (Regenerate, Open Blueprint, primary Open in Design).
  - White card containing `MockAppShell` — a rendered demo of the generated app (see below in "App Design").

### 4. Blueprint (`Blueprint`)

**Purpose**: design an app by drawing a wireframe and annotating each element.

**Layout**: `ScreenHeader` (crumbs `["AppOS", "Blueprint Mode"]`, title *"Blueprint — Safety Inspection Tracker"*, subtitle, actions: Back, *"Preview Flow"* (eye), primary *"Generate App"* (sparkles) → `spark`).

**Sub‑toolbar** (below header, `10/24` padding, white bg, bottom border):
- Left group: eyebrow "DEVICE" + `SegBtn` with 4 options — Desktop / Tablet / Mobile / Responsive (icons `monitor`, `tablet`, `smartphone`, `monitor-smartphone`).
- Right group: eyebrow "VIEW" + `SegBtn` with 3 options — **Canvas** (layout icon), **Flow** (git-fork), **Annotated** (message-square-text). This is the variant toggle.

**Body**: 3‑column grid **220px | 1fr | 340px**.

**Left column** — Components palette
- White bg, right border, padding `16/12`.
- Eyebrow "COMPONENTS" + list of 12 draggable items:
  - `KPI Card` (`square-stack`), `Chart` (`bar-chart-3`), `Table` (`table`), `Form` (`clipboard-list`), `Detail Panel` (`file-text`), `Button` (`square`), `Filter` (`filter`), `Timeline` (`git-branch`), `Map / Location` (`map-pin`), `File Preview` (`image`), `Alert Panel` (`bell`), `Comment / Note` (`message-square`)
  - Each row: 8/10 padding, radius 6, hover bg `#F5F7FA`, cursor grab. Icon 14 `#667085` + label 12 `#4B5361`.
- Below palette, a "Screens" sub‑panel (`#F3F4F1` bg, radius 8, 12 padding):
  - 4 links: Dashboard (active), Inspection List, Inspection Detail, New Inspection Form.
  - Active screen link: `#E7EEF4` bg, `#20668F` text 600, icon `circle-dot`. Inactive: `#4B5361` text, `circle` icon.

**Middle column** — Canvas (variant‑dependent)
- Background: dot grid — `radial-gradient(circle at 1px 1px, #E6E8EC 1px, transparent 1px)` on `#FAFAFB`, 20px cell.
- Padding `32/40`. Flex row, top‑aligned, horizontally centered.
- **`variant === 'canvas'`** — the wireframe browser (`CanvasView`):
  - White surface 680px wide, minHeight 620, border `#CBD1DA`, radius 10, shadow `0 8px 24px rgba(15,23,42,0.06)`.
  - Faux browser chrome (three 8×8 `#E6E8EC` dots + a 16px‑tall `#F3F4F1` address bar). Bottom border is dashed `#CBD1DA`.
  - Interior contains 8 absolutely‑positioned wireframe elements (`WireEl`) with fixed x/y/w/h — Page Header, KPI 1‑4, Chart, Detail Panel, Table.
  - Wire element default look: 1.5px dashed `#9AA1AE` border, `#FAFAFB` bg, radius 6. Hover: dashed `#20668F` border + `rgba(32,102,143,0.03)` bg. Selected: solid 2px `#20668F` border + `rgba(32,102,143,0.05)` bg.
  - On hover/selected, a chip appears at `top: -22, left: 0` showing the element **type** (10 600, white on `#0F172A` when hover, white on `#20668F` when selected).
  - Each element renders a wireframe stub — headers show a title + a primary button hint; KPI cards show label + big mono value + progress bar; Chart shows title + `FakeChart`; Detail Panel shows 4 dot+bar rows; Table shows a mono column header + 4 skeleton rows.
- **`variant === 'flow'`** (`FlowView`):
  - 820×460 white card, radius 10.
  - 4 screen tiles (200×120 each) positioned: Dashboard (40, 20), Inspection List (320, 20), Inspection Detail (600, 120), New Inspection (40, 240).
  - SVG arrows with an `arr` marker (`#20668F` triangle). Dashboard→List (solid). List→Detail (dashed, curved). Dashboard→New Form (dashed, curved).
  - Bottom hint panel (`#F3F4F1` bg, 1px border, radius 6): *"Flow view. Solid arrows are primary nav; dashed are drill‑in from a list row."*
- **`variant === 'annotated'`** (`AnnotatedView`):
  - Renders `CanvasView` on the left plus a 260px column of annotation cards on the right (only KPI 1‑4 are shown pre‑opened).
  - Each annotation card: type chip + element label + AI‑generated annotation body.

**Right column** — Annotation Panel
- White bg, left border, padding 20, overflow‑y auto, gap 16.
- Panel header row: type chip (`#20668F` bg, white 10 700) + element label (12 `#4B5361`) + close button (`x` icon).
- **"ELEMENT NOTE (edit to teach AI)"** eyebrow + textarea (minHeight 96, radius 8, `#FAFAFB` bg, border `#E6E8EC`, 13 `#1B202D`).
- Helper caption below: 11 `#9AA1AE` + `info` icon: *"Speak naturally. Example: 'Show only critical flags from BLD‑A and turn red when > 0.'"*
- **"DATA BINDING"** eyebrow + card: `#F3F4F1` bg, border, padding `10/12`, radius 8. Icon `database` `#20668F` + name + query snippet + "Edit" link.
- **"BEHAVIOUR ON CLICK"** eyebrow + select (padding `8/12`, border, radius 8): Open filtered Inspection List / Open detail modal / Do nothing.
- **"STYLE VARIANT"** eyebrow + 3‑up segmented buttons (Default / Compact / Emphasis). Active is `#E7EEF4` bg + `#20668F` text.
- **AI Suggestion callout**: gradient `#E7EEF4 → #F3F4F1`, border `#BFD3F7`, radius 10, padding 12. Eyebrow (11 700 `#20668F` uppercase) + suggestion text (12 `#1B202D`).
- Empty state (no element selected): 32 padding, centered, `mouse-pointer-click` icon (22px), copy *"Click any wireframe element to annotate it."*

### 5. My Apps (`MyApps`)

**Purpose**: catalog + status view of every app the user has built.

**Layout**: `ScreenHeader` with tabs: **All Apps** (count) / Published / Drafts / Needs Attention / Unpublished / Archived. Active tab: 2px `#EA6A22` bottom underline (per Varadise pattern), text `#1B202D` 600. Count pill sits inline (fontSize 10, `#E7EEF4`/`#20668F` when active, else `#EEF1F4`/`#667085`).

Below header (padding `20/28`):
- Toolbar row: search input on the left (max‑width 380, radius 8, border, prefix `search` icon `#9AA1AE`) + right `SegBtn` for view (Grid / Table).
- **Grid view**: `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`, gap 12.
- **Table view**: white card, radius 12; columns App / Status / Version / Modified / Visits / Data / Actions. Row hover cursor pointer, click routes to `design`.

**AppCard** (grid item):
- White, border `#E6E8EC` → `#CBD1DA` on hover. Radius 12, padding 20, gap 12.
- Row 1: 44×44 rounded 10 tinted tile (colored by accent — see `hexToTint`) + status pill on the right (`{status.toLowerCase()}` with dot).
- Row 2: app name (15, 700) + description (12, `#667085`, line‑height 1.45).
- Row 3: hub chips (10, `#F3F4F1` bg, `#4B5361`, radius 999, border `#E6E8EC`).
- Row 4 (with top border `#F0F2F5`): version + modified on the left, visit count and "live" heartbeat on the right. Live indicator: 6×6 `#17803D` dot with `cos-pulse` (2s) + "live" label.

**App list** (fixed):
1. **Safety Inspection Tracker** — accent `#20668F`, icon `clipboard-check`, status `Needs Attention` (warn), v1.2, 3h ago, K. Lam, 842 visits, dataStatus Partial, monitoring on. Hubs: Form Hub · Workforce Hub · Asset Hub. Description: *"Daily walk checklists, critical flag tracking, sign-off workflow."*
2. **Visitor Access** — `#3167E3`, icon `user-round-plus`, Published (success), v3.4, Yesterday, P. Wong, 2,341 visits. Hubs: Form Hub · CCTV Hub.
3. **Equipment Health** — `#17803D`, icon `gauge`, Published, v2.1, 2d ago, M. Sze, 1,088. Hubs: IoT Hub · Equipment Hub.
4. **Chiller Plant Overview** — `#B27D3A`, icon `zap`, Draft (neutral), v0.3, 2d ago, K. Lam, "—" visits, dataStatus Mock. Hubs: IoT Hub.
5. **Permit-to-Work** — `#7A3EA1`, icon `file-lock-2`, Unpublished (neutral), v1.0, 1w ago, A. Chan, 412. Hubs: Form Hub · Workforce Hub.
6. **Work Order Kanban** — `#20668F`, icon `kanban`, Published, v2.7, 4d ago, J. Ng, 3,201. Hubs: Form Hub · Workforce Hub · Equipment Hub.

Accent→tint map (`hexToTint`): `#20668F→#E7EEF4`, `#3167E3→#E8F0FE`, `#17803D→#E7F5EC`, `#B27D3A→#FBF1DE`, `#7A3EA1→#F1E7F7`.

### 6. App Design (`AppDesign`)

**Purpose**: continue editing an app via AI Vibe Coding, view live preview.

**Layout**: `ScreenHeader` (crumbs `["My Apps", "Safety Inspection Tracker"]`, title, subtitle *"v1.2 · last modified 3h ago by K. Lam"*, actions: Back (→ myapps), Preview (eye), *"Open Blueprint"* (git-branch, → blueprint), *"Unpublish"* (pause-circle), primary *"Publish v1.3"* (rocket)).

Tabs under the header: **Design** / Data Management / Workflow / Access / Monitoring / Version / Settings. Selecting Data Management renders the `DataMgmt` component in **embed** mode (same tab bar remains); selecting Monitoring renders `Monitoring` embed similarly. Other tabs are stubs (not built out in v1).

**Design tab body**: 2‑column grid **420px | 1fr**, full height.

**Left column** — AI Chat panel
- White bg, right border, flex column.
- Chat header (`14/16` padding, bottom border, `#FAFAFB` bg): `sparkles` icon `#20668F` + "AI Vibe Coding" (12 600) + right‑aligned "Session · 4 changes" (11 `#667085`).
- Messages scroll area (padding 16):
  - **Assistant message**: 24×24 black tile with `CosmosMark` (13, white) + white speech bubble (border `#E6E8EC`, radius 12, `10/12` padding, 13 `#1B202D`).
    - Optional `edits[]` array → renders a stack of file‑change chips. `kind === 'added'` → green (`#E7F5EC` bg, `#B7DFC2` border, `file-plus` icon `#17803D`). Otherwise `#F3F4F1` bg with `file-diff` icon `#4B5361`. Filename in mono 11 500, right‑aligned hint (`+18 lines`, `new query`, etc.) in `#667085`.
    - Footer: 10 `#9AA1AE` "AppOS · {timestamp}".
  - **User message**: reversed row. 24×24 `#3167E3` avatar with white "KL" 10 700. Bubble: `#F3F4F1` bg, border, radius 12.
  - **Thinking indicator**: three 6×6 `#20668F` dots pulsing with 0/200/400ms delays + "Applying change…" copy (12 `#4B5361`).
- Composer footer (bottom border, 12 padding, `#FAFAFB` bg):
  - White card, radius 12, border, padding 10. Textarea 44 minHeight. Below: two ToolChips ("Reference element" `at-sign`, "Add data" `database`) + Send button (radius 8, 12 600, `#20668F` bg or disabled state).
  - Enter (no shift) sends; Shift+Enter is newline.

**Right column** — Live app preview
- Background `#F3F4F1`, padding 20.
- Top bar: `preview` info pill + "Draft v1.3 · autosaved" caption + right‑aligned Desktop/Tablet/Mobile segmented control.
- Preview surface: white card, radius 16, border, containing `MockAppShell`.

**`MockAppShell` demo content** (used by both `SparkGen` and `AppDesign` — a mini preview of the generated Safety Inspection Tracker):
- Toolbar (`#F3F4F1` bg, bottom border, `14/20` padding): title "Safety Inspection Tracker" + subtitle "All sites · Week 27" + two mini buttons (neutral *Filter*, primary *+ New Inspection*).
- 4‑up KPI grid (20 padding, gap 10): Inspections 48 (+6 vs last wk, `#17803D`), Critical Flags 3 (2 unresolved, `#C0362C`), Avg Score 87 (+2 pts, `#17803D`), Overdue 2 (BLD‑B, BLD‑C, `#B27D3A`).
- Score trend chart section (`#F3F4F1` inner card, 160 height, `FakeChart` line+area).
- Recent Inspections mini‑table (white card, border, radius 8):
  - Header row (border bottom): "Recent Inspections" (12 600) + "Showing 4 of 48" (11 `#667085`).
  - Grid columns (140 / 1fr / 100 / 80 / 70 / 90): id (mono `#4B5361`) / site (`#1B202D` 500) / by (`#667085`) / score (colored by band) / flags (`#C0362C` when >0 with ⚑) / status pill.
  - Rows: `INSP-2026-0338` BLD-A · L5 Mech / K. Lam / 87 / 2 / submitted (info). `-0337` BLD-A · L3 Atrium / K. Lam / 94 / 0 / reviewed (success). `-0336` BLD-B · Roof W / P. Wong / 72 / 4 / submitted (info). `-0333` BLD-B · MEP / P. Wong / 65 / 5 / draft (neutral).

**Auto‑chat**: 400ms after mount, a "thinking" indicator appears, then 1800ms later the assistant posts a reply about wiring row‑click on Recent Inspections. When user sends a new message, 1400ms later the assistant posts "Applied. Change is live in the preview. Version snapshot v1.3-draft created — publish when ready."

### 7. Data Management (`DataMgmt`)

**Purpose**: manage the data behind a specific app.

Works two ways:
- **Standalone** (via left rail) — renders its own `ScreenHeader`.
- **Embedded** inside App Design (when the *Data Management* tab is chosen) — shares App Design's ScreenHeader + tab bar.

**Content** (padding `20/28`, gap 20):

1. **"Three Ways to Connect Data" hero** — full‑width gradient card:
   - Background `linear-gradient(135deg, #0F172A 0%, #20668F 100%)`, white text, radius 16, padding 24.
   - Eyebrow "THREE WAYS TO CONNECT DATA" (11 700 uppercase, sparkles icon, 0.8 opacity).
   - Title (22 700): *"Wire your app to real data — however you like."*
   - 3‑column grid of `ConnectMethod` cards:
     - **1 · Manual Mapping** — icon `pointer`. Copy: *"Browse the Data Hub, pick fields, map them to your app's data requirements."* CTA "Browse Data Hub" → routes to `hub`.
     - **2 · Ask AI to Find Data** — icon `sparkles`. Highlighted card (white on dark surface). Copy: *"Just say 'I need equipment health, recent maintenance, and abnormal events.' AppOS will match Hubs."* CTA "Ask AppOS" (white pill, `#20668F` text).
     - **3 · Create Mock Data** — icon `beaker`. Copy: *"Skip integration. Generate a complete mock data set so the app runs immediately."* CTA "Generate Mock Data".
   - Non‑highlighted cards: `rgba(255,255,255,0.08)` bg, `rgba(255,255,255,0.15)` border. Highlighted: `0.14/0.4`.

2. **Required Data** section (`Section` helper — 16 700 title + 12 `#667085` hint). White table card:
   - Columns: Required Data / Purpose / Status / Action.
   - Rows: Safety Inspection Forms (Connected/success), Personnel Roster (Connected/success), Sites & Zones (Connected/success), Maintenance Records (Missing/danger), Alert Events (Mock Data/warn).
   - Action links: green rows → "View mapping →" (`#20668F`), danger → "Connect data →" (`#C0362C`), warn → "Switch to real →" (`#B27D3A`).

3. **Current Data Inputs** section. 2‑column grid of input cards:
   - Card: white, border, radius 10, padding 14. 36×36 tinted tile (mock inputs use `#FBF1DE`/`#B27D3A`, others use `#E7EEF4`/`#20668F`) with `plug` or `beaker` icon. Body: mono name + source/type/updated meta. Right: pill (`live` success or `mock` warn).
   - Inputs: `safety_inspection_forms` (Form Hub, real, 12m ago), `personnel_roster` (Workforce Hub, real, 2h ago), `sites_zones` (Asset Hub, real, 1d ago), `mock_alert_events` (Mock, live).

4. **App Output APIs** section. White card:
   - Row layout: grid `160 / 1fr / 60 / 220 / 80`, padding `12/20`. Columns: name / description / method tag / mono path / try link.
   - **MethodTag** chip: `#F3F4F1` bg, mono 10 700, radius 6. Colors: GET `#17803D`, POST `#20668F`, PUT `#B27D3A`, DELETE `#C0362C`.
   - APIs: Safety Score API (GET), Critical Findings API (GET), Work Order Trigger API (POST), Inspection Report API (GET).

5. **Data Health** section. 5‑up grid:
   - Card: white, border, radius 10, padding 14. Top row: icon (14, `#667085`) + 8×8 status dot (green/amber/red). Body: 11 uppercase label + 16 700 value + 11 detail.
   - Health items: Data Freshness "On schedule" success · Missing Rate 0.8% success · Schema Consistency Stable success · API Availability 99.94% success · Permission Status "1 warning" warn.

### 8. Monitoring (`Monitoring`)

**Purpose**: keep the published app running healthily.

Also renders standalone or embedded within App Design.

**Content** (padding `20/28`, gap 20):

1. **Health at a Glance** — 4‑up grid of `HealthCard`:
   - Card: white, border, radius 12, padding 16. 32×32 tinted tile + "Live" heartbeat indicator top‑right. 11 uppercase label + 22 700 value + 11 delta.
   - Live indicator: 5×5 `#17803D` dot pulsing + "Live" text (8 700 uppercase `#17803D`, letter‑spacing .1em).
   - Cards: App Uptime 99.94% success · Active Users (7d) 128 success · Open Incidents 2 warn · Data Freshness "On time" success.

2. **Middle band** — 2‑column grid `1fr | 320px`:
   - **Incident Timeline** (white card, radius 12):
     - Header row: title (14 700) + subtitle "Last 24h · 5 events · 2 open" + right‑side severity pill row (`1 danger`, `2 warn`, `2 info`).
     - Body: vertical timeline. Each row: 32×32 circle icon (bg per severity) with 2px white border, connector line below (2px `#EEF1F4`). Right side: title + type tag chip (mono 10 700 `#F3F4F1`/`#4B5361`) + right‑aligned timestamp + detail body.
     - Severity colors: danger `#C0362C/#FBE9E7/alert-octagon`, warn `#B27D3A/#FBF1DE/alert-triangle`, info `#20668F/#E7EEF4/info`.
     - Events: 09:24 schema-change warn "Field type shifted" — critical_flags Int→Number auto‑coerced. 08:47 permission warn "Role missing on new site" — Inspector role missing on BLD‑D. 07:12 data-delay info "Feed caught up" — 11min delay resolved. 00:03 api-fail danger "API failure" — /report/:id 3× 5xx, rolled back to v1.1. Yesterday 22:15 usage info "Usage spike" — +87% submissions.
   - **Right column** — three stacked panels:
     - **Notification Channels** (white card): title + "Manage" link, then 6 rows (in‑app on, Email on, Notification Center on, WhatsApp off, Slack on, MS Teams off). Row: icon + name + `ToggleDot` on the right.
     - **Watching For** (white card): 8 rows of alert types with toggle. On: `#20668F` icon, `#1B202D` text. Off: `#CBD1DA` icon, `#9AA1AE` text.
     - **"What Monitoring Does" callout** (`#F3F4F1` bg, radius 12, border, padding 16): eyebrow (sparkles icon + "WHAT MONITORING DOES" 11 700 `#20668F`) + copy.

3. **App Traffic · 24h** — white card:
   - Header: title + subtitle + right `SegBtn` for 24h/7d/30d.
   - `TrafficChart`: 24‑bar histogram, 180px tall. Bar 14 (peak hour) is `#20668F`; bars 7–19 (working hours) are `#B0C7D7`; edges are `#DDE2E8`. X‑axis label every 4h in mono 9 `#9AA1AE`.

**ToggleDot** (used in Monitoring channels + watch list): 28×16 rounded pill. Off `#CBD1DA`, On `#20668F`. Inner 12×12 white knob translates on toggle (160ms `cubic-bezier(0.2,0,0,1)`).

## Interactions & Behavior

### Global
- Screen state persists in `localStorage.cos-screen`; loads from it on mount.
- Every screen change re‑runs `lucide.createIcons()` to render dynamic icons; a general `useEffect` also does this on every render.
- All screen transitions play `cos-fade-in` (opacity 0→1, translateY 6→0, 320ms `cubic-bezier(0.2, 0, 0, 1)`).

### Chat Home
- Submit path: `Spark → SparkGen`, `Blueprint → Blueprint`.
- Clicking a suggestion fills the composer and submits after 100ms.
- Submit button is disabled while the composer is empty (whitespace‑only counts as empty).
- Focused composer border transitions to `#20668F` with a `rgba(32,102,143,0.12)` 4px glow.

### Spark Generation
- Timing: step 0 → 1 at 800ms, then 900ms per step. When all steps complete, `done = true`, right panel switches from `GeneratingPreview` to `AppPreview` (with `cos-fade-in`), and the "Open in Design" primary CTA appears in the header.
- "Regenerate" resets to step 0.

### Blueprint
- Clicking any wireframe element sets it as `selected`; annotation panel updates.
- Clicking the close button (`x`) clears selection and shows the empty state.
- Segmented device/view toggles work but don't restructure the canvas beyond swapping variant.
- Textarea in the annotation panel is fully editable — represents the user "teaching" the AI.

### My Apps
- Tab filters the list; count pills auto‑update from `MY_APPS`.
- Grid ↔ Table view via segmented control.
- Row click routes to `design` (all apps go to the same demo App Design surface).

### App Design
- Chat: Enter sends, Shift+Enter newlines. After send, a 1400ms delay before assistant reply.
- Tab switching to Data Management or Monitoring renders those components inline (embed mode).

### Data Management
- "Browse Data Hub" CTA routes to `hub`.

### Monitoring
- Notification channel toggles are locally interactive (`ToggleDot` state).

### Tweaks (in‑page)
- Panel toggled via the toolbar Tweaks control (uses the standard postMessage protocol).
- Controls: `Chat Home mode` radio (Spark / Blueprint), `Blueprint canvas variation` radio (Canvas / Flow / Annotated), Jump‑to‑screen buttons (Chat Home, Data Hub, Spark Gen, Blueprint, My Apps, App Design, Data Mgmt, Monitoring).
- Defaults live inside `/*EDITMODE-BEGIN*/…/*EDITMODE-END*/` markers so they can be persisted to disk.

## State Management

- `screen: 'home' | 'hub' | 'spark' | 'blueprint' | 'myapps' | 'design' | 'data' | 'monitor'` — persisted to localStorage as `cos-screen`.
- `mode: 'spark' | 'blueprint'` — controls Chat Home placeholder, submit label, suggestions.
- `blueprintVariant: 'canvas' | 'flow' | 'annotated'` — controls Blueprint canvas view.
- `prompt: string` — text in the Chat Home composer; passed through to SparkGen for display.
- Per‑screen local state: Blueprint's `selected`; DataHub's `selectedHub`, `selectedSet`, `expanded`; MyApps's `tab`, `view`; App Design's `tab`, `messages`, `prompt`, `thinking`; Monitoring's channel toggles.
- No real data fetching — all data is inline mock arrays (`SAMPLE_VISITORS`, `HUB_TREE`, `MY_APPS`, `MON_INCIDENTS`, etc.). In production these should come from a real API and a state manager appropriate to the codebase (Zustand, Redux Toolkit, React Query, etc.).

## Design Tokens

All tokens come from Varadise's `colors_and_type.css` (bundled in this handoff).

### Colors — Neutrals
- `--v-canvas: #FAFAFB` — app background
- `--v-canvas-warm: #F3F4F1` — alt background, tinted rows, gradient stop
- `--v-surface: #FFFFFF` — cards, inputs, menus
- `--v-surface-alt: #F9FAFB` — hover row, disabled input
- `--v-border: #E6E8EC` — hairline border, default
- `--v-border-strong: #CBD1DA` — hover border, divider on nav
- `--v-scrim: rgba(15, 23, 42, 0.40)` — modal backdrop

### Colors — Text
- `--v-fg: #1B202D` — primary
- `--v-fg-muted: #4B5361` — secondary
- `--v-fg-subtle: #667085` — tertiary/meta
- `--v-fg-faint: #9AA1AE` — placeholder, disabled

### Colors — Brand & Primary
- `--v-brand: #0F172A` — near-black wordmark
- `--v-primary: #20668F` — primary CTA
- `--v-primary-hover: #1B587E`
- `--v-primary-press: #164C6D`
- `--v-primary-ring: rgba(32, 102, 143, 0.30)` — focus ring
- `--v-primary-soft: #E7EEF4` — selected/active bg
- `--v-accent-blue: #3167E3` — identity chip
- `--v-accent-orange: #EA6A22` — active tab underline

### Colors — Semantic (soft‑tint pill system)
- Success: fg `#17803D`, bg `#E7F5EC`, border `#B7DFC2`
- Warn: fg `#B27D3A`, bg `#FBF1DE`, border `#EBD3A5`
- Danger: fg `#C0362C`, bg `#FBE9E7`, border `#F1BEB9`
- Info: fg `#2F6FEB`, bg `#E8F0FE`, border `#BFD3F7`
- Neutral tag: fg `#4B5361`, bg `#EEF1F4`, border `#DDE2E8`

Additional accent set for `AppCard` tinted tiles: `#20668F/#3167E3/#17803D/#B27D3A/#7A3EA1`.

### Radius
- `--v-r-sm: 6px` (chip, small button)
- `--v-r-md: 8px` (button, input, stat card)
- `--v-r-lg: 12px` (record card, dropdown)
- `--v-r-xl: 16px` (modal, sheet, prompt composer)
- `--v-r-pill: 999px`

### Spacing (4pt grid)
- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px
- Card internal padding: 20–24
- Row gutters: 16
- Page gutters: 24–32

### Elevation
- `--v-shadow-none: none` (default)
- `--v-shadow-menu: 0 8px 24px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.04)` (menus, canvas card)
- `--v-shadow-modal: 0 24px 64px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06)`

### Motion
- Ease: `cubic-bezier(0.2, 0, 0, 1)` (Varadise's single easing curve)
- Durations: 120ms fast (hover), 180ms base (tab/underline), 240ms slow (screen transitions actually use 320ms as an exception)
- Custom keyframes: `cos-fade-in`, `cos-pulse`, `cos-shimmer`, `cos-caret`, `cos-scan`

### Typography
- Sans: `Inter` (400/500/600/700). System fallbacks per token.
- Mono: `JetBrains Mono` (400/500) for record IDs, code‑ish paths, mono values in tables.
- Ramp (px):
  - Display 40 (KPI hero)
  - H1 30 (page title)
  - H2 22 (section title)
  - H3 18 (card title)
  - Large 16 (emphasised body, hero subtitle)
  - Body 14 (default)
  - Small 13 (dense secondary, chip label in composer)
  - XS 12 (helper, meta, pill)
  - 2XS 11 (uppercase eyebrow)
- Line height: tight 1.2, snug 1.35, body 1.5
- Letter spacing: eyebrow 0.06em (uppercase); display/H1 use −0.02em / −0.015em
- `font-feature-settings: 'tnum' 1` on all numeric displays (KPIs, table numbers, timestamps).

## Assets

Copy the following from the design system into the target codebase (or replace with the team's canonical versions):
- `assets/logo-mark-arc.png` — Varadise brand mark
- `assets/logo-wordmark.png` — Varadise wordmark
- `assets/favicon-192.png` — favicon

**CosmosMark**: the AppOS icon is drawn inline as SVG (see `AppSidebar.jsx` / `CosmosMark` export). It should be extracted as a proper SVG asset in production. Definition:
- 24×24 viewbox, stroke color = passed color, strokeWidth 2, rounded caps/joins.
- Path: `M4 15 A 8 8 0 0 1 20 15` (upward arc — a nod to the Varadise wordmark's cloud/arc motif)
- Four filled circles: `(7,8)` r 1.2, `(12,6)` r 1.2, `(17,8)` r 1.2, `(12,18)` r 1.4 — representing "apps around the OS"

**Icons**: Lucide (via CDN in the prototype). Every icon reference in the JSX uses `data-lucide="<name>"`. Full list used:
`sparkles, database, layout-grid, wand-2, plug, activity, settings, home, briefcase, bar-chart-3, calendar, calendar-clock, scan-face, user-check, hard-hat, clipboard-list, alert-triangle, map-pin, building-2, file-text, users, cog, radio-tower, video, bell, folder, filter, search, chevron-right, chevron-down, key, link, download, refresh-cw, git-branch, rotate-cw, check, check-circle-2, arrow-left, arrow-right, arrow-up, arrow-up-right, arrow-up, x, monitor, tablet, smartphone, monitor-smartphone, layout, git-fork, message-square-text, square-stack, square, table, image, message-square, mouse-pointer-click, circle-dot, circle, info, eye, plus, pointer, beaker, plug-2, network, at-sign, file-plus, file-diff, alert-octagon, mail, app-window, message-circle, hash, server, server-crash, key-round, trending-up, trending-down, target, shield-check, clock, kanban, file-lock-2, gauge, user-round-plus, zap, pen-line, paperclip, file-cog, pause-circle, rocket, history, git-branch, line-chart, layout-panel-left, layout-dashboard, users, user, shield`.

## Files

Design references in this handoff bundle:
- `index.html` — page shell, script loads, global styles + custom animations (`cos-fade-in`, `cos-pulse`, `cos-caret`, `cos-scan`)
- `app.jsx` — root shell + router + Tweaks panel wiring
- `colors_and_type.css` — Varadise design tokens (drop‑in)
- `components/Button.jsx` — `VButton` (variants: primary / neutral / ghost / danger; sizes sm/md)
- `components/Pill.jsx` — `VPill` (variants: success / warn / danger / info / neutral)
- `components/StatCard.jsx` — Varadise StatCard (used for reference; the app uses its own MiniStat/HealthCard variants)
- `components/Avatar.jsx` — `VAvatar` (deterministic color from initials)
- `components/TabBar.jsx` — `TopTabs`, `ListTabs`
- `screens/AppSidebar.jsx` — left rail + `CosmosMark` SVG
- `screens/ChatHome.jsx` — Chat Home (mode toggle, composer, suggestions, recents)
- `screens/DataHub.jsx` — Data Hub 3‑column + `ScreenHeader` shared helper + `MiniStat`
- `screens/SparkGen.jsx` — Generation pipeline + `MockAppShell` + `FakeChart`
- `screens/Blueprint.jsx` — Interactive wireframe + annotation panel + `SegBtn`
- `screens/MyApps.jsx` — App catalog grid/table
- `screens/AppDesign.jsx` — AI Vibe Coding chat + preview
- `screens/DataMgmt.jsx` — Data Management sections
- `screens/Monitoring.jsx` — Monitoring dashboard + `TrafficChart`
- `assets/` — Varadise brand assets

Open `index.html` in a browser to see the working prototype. Every interaction, animation, and layout decision is live in that reference.
