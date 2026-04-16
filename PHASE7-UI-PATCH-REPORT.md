# PHASE7 UI Patch Report

Implemented the requested focused UI patch batch (desktop + mobile) with conservative changes only.

## 1) Crew multi-project switch UX
- Updated crew project switching control to a discreet **Project** pill button instead of a loud icon-only control.
- Added project switch access inside crew overflow menu on the main crew list page.
- Preserved role/scope constraints by continuing to use scoped project filtering (`getProjectsForWorkspace` / `pickNextProjectId`).
- Single-project users remain uncluttered (`canSwitchProject` gate unchanged).

## 2) List row field reduction (admin + crew)
- Admin date list rows now show only:
  - Date
  - City
  - Region
  - Venue
- Removed venue address and tour line from admin list rows.
- Crew date cards now show only Date, City/Region, Venue (no venue address, no tour line).
- Venue address/details are still available in detail/edit contexts.

## 3) Desktop field alignment cleanup
- Standardized label width for Date/City/Region/Country/Tour inline rows in New/Edit Date form (`w-[64px]`).
- This cleans row rhythm and removes uneven field starts.

## 4) Mobile import modal usability
- Moved close `×` control to the top-left of the modal header area.
- Compacted modal header layout (no separate right-side close row).
- Made modal container scrollable on mobile (`overflow-y-auto`) so lower actions (including **Choose file** and **Review AI draft**) remain reachable.

## 5) Mobile Country field alignment
- Aligned Country field input start with Region and Tour by standardizing inline label width in New/Edit Date forms.

## Files updated
- `components/app-shell.tsx`
- `components/admin-page-client.tsx`
- `components/show-card.tsx`
- `PHASE7-UI-PATCH-REPORT.md`
