# Multi-Screen Flow Architecture

Multi-screen flows (login, onboarding, checkout, etc.) MUST use create_frame + children.

## Hierarchy (do not skip levels)

```
Wrapper (VERTICAL, HUG/HUG, counterAxisAlignItems=MIN, clipsContent=false, cornerRadius=20-40, fill=lightGray, padding, itemSpacing)
  ├── Header (title + description)
  └── Flow Row (HORIZONTAL, HUG/HUG, clipsContent=false, itemSpacing between screens)
        └── Stage / {label} (VERTICAL, HUG/HUG, clipsContent=false) — one per screen
              ├── Step Pill (badge: "01 Welcome")
              └── Screen / {label} (VERTICAL, FIXED 402×874, cornerRadius=28, clipsContent=true, padding, SPACE_BETWEEN, shadow:{y:4, blur:16})
                    ├── Top Content (VERTICAL, FILL/HUG)
                    └── Bottom Content (HORIZONTAL or VERTICAL, FILL/HUG)
```

## Build Order

1. create_frame: Wrapper + children with full skeleton (Header + Flow Row + Stages + Screens) → check _children in response to confirm structure
2. ⚠️ MUST export_image(scale:0.3) to verify all screens are laid out horizontally in Flow Row — do NOT proceed to fill screens until this is confirmed
3. create_frame: Fill Screen 1 (parentId=screen1Id, children=[TopContent, BottomContent]) → export_image to verify layout
4. create_frame: Fill remaining screens one by one → export_image as needed
5. lint_fix_all → done

The Opinion Engine automatically handles: sizing inference, FILL ordering, conflict detection, cross-level validation, and failure cleanup. No need to manually handle these Figma API details.

## Key Rules

- Screen uses primaryAxisAlignItems: "SPACE_BETWEEN" for top/bottom distribution (use "MIN" for sparse content screens)
- Shadow elements: ALL ancestor containers must have clipsContent: false
- Screen dimensions: iOS 402×874, Android 412×915
- Use dryRun: true when uncertain about parameters
