# UI Design System and Code Generation Rules

Apply these rules whenever creating or changing user-facing UI, styles, or UI-related content in this project. Treat them as the project-wide design baseline unless the user explicitly requests a different direction.

## 1. Typography and icons

- Use clean, modern sans-serif typography and professional, meaningful wording.
- Keep user-facing text free of Unicode emoji characters, including headings, body text, buttons, form labels, and placeholders.
- When an icon is needed, use an SVG or an established icon library such as Lucide, Feather, or Heroicons; never use an emoji as an icon.

## 2. Visual style

- Use a restrained, eye-comfortable palette: neutral slates, soft grays, warm whites, and muted brand accents. Favor legibility over visual intensity.
- Give components subtle depth with soft, diffused shadows or thin, clean borders. Avoid heavy drop shadows, text shadows, neon effects, glow, and cyberpunk-style gradients.
- Use solid, flat button backgrounds, subtle outlines, and gentle low-contrast hover states. Avoid pulsing, radiating, or glowing button treatments.

## 3. Layout and spacing

- Build page structure in natural document flow with Flexbox or CSS Grid.
- Reserve absolute positioning for overlays such as modals, dropdown popovers, and tooltips. Do not use fixed or absolute positioning for ordinary page sections, content, or card stacking.
- Do not use negative margins to position or nudge neighboring elements.
- Set spacing between sibling elements with `gap` on their parent container. Use padding for internal component spacing.
- Keep components in normal flow so content does not overlap neighboring content.

## 4. Sizing and overflow

- Let containers holding text or dynamic content size naturally. Use `min-height` when a minimum is needed; avoid fixed heights on content containers.
- Ensure text can wrap within its container, using appropriate wrapping such as `overflow-wrap: anywhere` or `word-break: break-word` where needed.
- Check long words, user-provided content, and narrow viewports to ensure text does not overflow into neighboring components.

## 5. Layering

- Use a consistent z-index hierarchy: base content `0`, sticky navigation `10`, dropdowns `20`, modals `50`, and toasts or snackbars `100`.
- Keep z-index values within this hierarchy; do not introduce arbitrary or extreme values.

## 6. Interaction & Action Hierarchy
- Establish a clear hierarchy for actions: exactly one Primary action per section/modal, distinct Secondary actions, and visually separated Destructive actions.
- Provide clear visual affordances for interactive elements (hover, focus, active, disabled states).
- Ensure all interactive touch/click targets meet minimum ergonomic sizes (at least 40x40px).

## 7. System Feedback & Status
- Every asynchronous action must have a visual feedback loop: loading spinners/skeletons during fetching, disabled button states during submission to prevent double-clicks, and clear success/error toasts or banners.
- When an error occurs, provide human-readable inline messages stating what went wrong and how to fix it—never leave the user guessing.

## 8. Form Ergonomics & Data Entry
- Always pair input fields with persistent, explicit <label> tags (never rely solely on placeholders).
- Group related fields logically and mark required vs. optional fields clearly.
- Provide sensible defaults, autofocus on the primary field where appropriate, and use proper HTML input types (e.g., email, number, tel) to trigger correct mobile keyboards.

## 9. State Completeness (The 4 States Rule)
Whenever generating or updating a component/view, explicitly account for all 4 states:
- Default/Populated: Normal data view.
- Loading/Skeleton: Data fetching state.
- Empty State: When no data exists, provide a friendly message and a clear call-to-action (e.g., "No items found. Create your first item").
- Error/Broken State: Clear explanation with a retry mechanism.