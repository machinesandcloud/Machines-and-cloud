---
name: Machines & Cloud
description: Clear customer conversations and useful workday controls.
colors:
  action: "#2459df"
  ink: "#19283f"
  navy: "#13243e"
  surface: "#ffffff"
  workspace: "#f4f6fa"
  muted: "#5d6b82"
  line: "#dfe5ee"
typography:
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.55
rounded:
  control: "8px"
  panel: "16px"
---

## Overview

Retain the confirmed blue/navy identity, white content surfaces and relevant trade photography. Marketing helps a buyer understand and choose. Product screens help an owner finish a task. This records the incumbent direction and the current redesign contract, not a new brand or a substitute for current launch control.

## Colors

Use blue for the primary action and current selection. Navy provides brand structure; white and a restrained workspace background organize content. Status must have a readable text label as well as color. Source implementations are `site-refresh.css`, `product-ui.css`, `desk.css` and `admin.css`; preserve their existing CSS custom properties rather than introducing a second token runtime.

## Typography

Use Inter for product controls and data. Space Grotesk remains the existing marketing display face. Keep product type steady across viewport sizes. Headings name the customer task; labels, timestamps and status are distinct without repeated decorative headings. Readable prose measure and short paragraphs matter more than dramatic display size.

## Layout

One dominant next action. Separate daily work from setup and infrequent account maintenance. Required work appears before optional choices. Progressive disclosure must not hide an error or make a saved service impossible to find. Mobile layouts preserve task order and fit the viewport without horizontal scrolling. Secondary public pages share keyboard access to their main content.

## Elevation & Depth

Use existing restrained surfaces and borders to group related controls. Reserve overlays for a protected decision or a guided spotlight; avoid nesting cards to manufacture hierarchy.

## Shapes

Keep existing rectangular controls with modest rounding. Inputs and actions have consistent sizes and visible interaction states. Logos preserve intrinsic proportions and the correct light/dark variant. Photos keep the subject visible and never substitute for workflow evidence.

## Components

Primary actions state the next result. Form fields show specific errors and retain valid work. Saves distinguish pending, confirmed and uncertain outcomes. Empty states teach the next useful action. Setup stages derive from real saved status; tutorial navigation cannot complete setup. Help stays available in context. Dialogs retain keyboard focus, close reliably and restore the user's place.

## Do's and Don'ts

Preserve proven behavior and existing DOM hooks while simplifying presentation. Inspect the actual rendered page at desktop and mobile sizes after ordinary actions, including error and empty states. Keep transitions brief and honor reduced motion. Avoid decorative statistics, unsupported proof, generic AI claims and implementation memos in product copy. Do not use the design document to change commercial terms, activate a provider or claim full launch readiness.
