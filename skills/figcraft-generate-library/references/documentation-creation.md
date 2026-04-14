> Part of the [figcraft-generate-library skill](../SKILL.md).

# Documentation Creation Reference

> **All examples use FigCraft declarative tools** (`create_frame`, `create_text`, nested `children`). Font loading, FILL ordering, and sizing inference are handled automatically by the Opinion Engine. For raw Plugin API patterns, see the [figcraft-use skill](../../figcraft-use/SKILL.md).

This reference covers Phase 2 of the design system build: the cover page, foundations documentation page (color swatches, type specimens, spacing bars, shadow cards, radius demo), page layout dimensions, and inline component documentation.

---

## 1. Cover Page

The cover page is always the first page in the file. It is a branded title card that sets context for anyone opening the file.

### What to include

- File/system name as a large heading (48-72px)
- Version string or date
- Brief tagline (1 sentence)
- Optional: color block background using the primary brand color variable

### Cover page dimensions

The cover frame should be **1440 x 900px** -- this matches the default Figma canvas and looks correct in the page thumbnail.

### Creating the cover page

First, create the "Cover" page using `set_current_page` (from the `pages` toolset). Then create the cover frame:

```yaml
create_frame:
  name: "Cover"
  width: 1440
  height: 900
  layoutMode: "VERTICAL"
  primaryAxisAlignItems: "CENTER"
  counterAxisAlignItems: "CENTER"
  itemSpacing: 16
  # Background: bind to primary variable if available, else solid dark
  fillVariableName: "color/primary"   # or fall back to fill: "#0F0F12"
  children:
    - type: "text"
      content: "{systemName}"         # e.g. "Acme Design System"
      fontFamily: "Inter"
      fontStyle: "Bold"
      fontSize: 64
      fill: "#FFFFFF"
      textAlignHorizontal: "CENTER"

    - type: "text"
      content: "{tagline}"           # e.g. "A unified design language"
      fontSize: 20
      fill: "#FFFFFFB3"              # white at ~70% opacity
      textAlignHorizontal: "CENTER"

    - type: "text"
      content: "{version}"           # e.g. "v1.0.0"
      fontStyle: "Medium"
      fontSize: 13
      fill: "#FFFFFF73"              # white at ~45% opacity
      textAlignHorizontal: "CENTER"
```

---

## 2. Foundations Page

The Foundations page is always placed **before any component pages**. It visually documents the design tokens -- colors, typography, spacing, shadows, and border radii -- so designers and engineers can see available primitives at a glance.

### Page layout dimensions

The outer documentation frame should be **1440px wide**. Sections stack vertically with **64-100px gaps** between them. Each section frame fills the full 1440px width and hugs its content vertically.

### Full Foundations page skeleton

Create the "Foundations" page using `set_current_page` (from the `pages` toolset), then the root frame:

```yaml
create_frame:
  name: "Foundations"
  width: 1440
  layoutMode: "VERTICAL"
  primaryAxisAlignItems: "MIN"
  counterAxisAlignItems: "MIN"
  itemSpacing: 80
  padding: 80
  paddingBottom: 120
  fill: "#FFFFFF"
  # layoutSizingVertical defaults to HUG via Opinion Engine
```

All foundation sections (colors, typography, spacing, shadows, radius) are appended as children of this root frame using `parentId`.

---

## 3. Color Swatches (bound to variables)

Color swatches must be **bound to actual Figma variables** -- never hardcode hex values in swatch fills. This keeps documentation in sync automatically when variable values change.

### Single color swatch

Each swatch is a vertical stack: a colored rectangle bound to a variable, a short name label, and a full path label.

```yaml
create_frame:
  name: "Swatch/{varName}"
  width: 88
  layoutMode: "VERTICAL"
  itemSpacing: 6
  fill: ""                            # transparent (no fill)
  children:
    - type: "rectangle"
      width: 88
      height: 88
      cornerRadius: 8
      fillVariableName: "{varName}"   # e.g. "color/blue/500" -- bound to variable

    - type: "text"
      content: "{leafName}"          # e.g. "500" (last segment of varName)
      fontSize: 10
      fill: "#595959"
      layoutSizingHorizontal: "FILL"

    - type: "text"
      content: "{varName}"           # e.g. "color/blue/500" (full path)
      fontSize: 9
      fill: "#999999"
      layoutSizingHorizontal: "FILL"
```

### Color section builder (primitives row + semantic grid)

The complete color documentation section has a heading, description, and wrapping rows for primitive and semantic swatches.

```yaml
create_frame:
  name: "Section/Colors"
  layoutMode: "VERTICAL"
  itemSpacing: 24
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  parentId: "{rootFrameId}"
  children:
    # Section heading
    - type: "text"
      content: "Colors"
      fontStyle: "Bold"
      fontSize: 32
      fill: "#121212"

    # Description
    - type: "text"
      content: "Primitive color palette and semantic color tokens. Semantic tokens reference primitives -- always use semantic tokens in components."
      fontSize: 14
      fill: "#666666"
      layoutSizingHorizontal: "FILL"

    # Primitives sub-heading
    - type: "text"
      content: "Primitives"
      fontStyle: "Bold"
      fontSize: 13
      fill: "#8C8C8C"

    # Primitives row (wrapping)
    - type: "frame"
      name: "Primitives/Row"
      layoutMode: "HORIZONTAL"
      itemSpacing: 12
      layoutSizingHorizontal: "FILL"
      layoutWrap: "WRAP"
      fill: ""
      children: []                    # Populate with swatch frames per primitive variable

    # Semantic sub-heading (include only if semantic vars exist)
    - type: "text"
      content: "Semantic"
      fontStyle: "Bold"
      fontSize: 13
      fill: "#8C8C8C"

    # Semantic row (wrapping)
    - type: "frame"
      name: "Semantic/Row"
      layoutMode: "HORIZONTAL"
      itemSpacing: 12
      layoutSizingHorizontal: "FILL"
      layoutWrap: "WRAP"
      fill: ""
      children: []                    # Populate with swatch frames per semantic variable
```

For each variable, create a swatch using the single swatch pattern above and append it to the appropriate row via `parentId`.

---

## 4. Type Specimens

Typography specimens show each text style rendered at its actual size with a sample string, the style name, and its specifications.

### Single type specimen row

Each specimen is a vertical stack: style name label, sample text in the actual font, specification line, and a divider.

```yaml
create_frame:
  name: "Type/{styleName}"
  layoutMode: "VERTICAL"
  itemSpacing: 6
  paddingTop: 16
  paddingBottom: 16
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  children:
    # Style name label (small, muted)
    - type: "text"
      content: "{styleName}"         # e.g. "Display Large"
      fontStyle: "Medium"
      fontSize: 11
      fill: "#8C8C8C"
      layoutSizingHorizontal: "FILL"

    # Sample text rendered in the actual style
    - type: "text"
      content: "The quick brown fox jumps over the lazy dog"
      fontFamily: "{fontFamily}"     # e.g. "Inter"
      fontStyle: "{fontStyle}"       # e.g. "Bold"
      fontSize: "{fontSize}"         # e.g. 48
      lineHeight: "{lineHeight}"     # e.g. 56
      fill: "#121212"
      layoutSizingHorizontal: "FILL"

    # Specification line
    - type: "text"
      content: "{fontFamily} {fontStyle} . {fontSize}px . {lineHeight}px line height"
      fontSize: 11
      fill: "#A6A6A6"
      layoutSizingHorizontal: "FILL"

    # Divider line
    - type: "rectangle"
      height: 1
      fill: "#E6E6E6"
      layoutSizingHorizontal: "FILL"
```

### Typography section builder

The full typography section has a heading followed by one specimen row per text style.

```yaml
create_frame:
  name: "Section/Typography"
  layoutMode: "VERTICAL"
  itemSpacing: 0
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  parentId: "{rootFrameId}"
  children:
    - type: "text"
      content: "Typography"
      fontStyle: "Bold"
      fontSize: 32
      fill: "#121212"

    # Then append one specimen row per text style using parentId
```

For each text style, create a specimen row using the pattern above and append it to the section via `parentId`.

---

## 5. Spacing Bars

Spacing bars show each spacing token as a filled rectangle whose width equals the spacing value. Shorter bars for small values, longer bars for large values -- the visual encoding is immediate.

### Spacing bar row

Each spacing bar is a horizontal row: a colored rectangle sized to the spacing value, plus a label with name, pixel value, and code syntax.

```yaml
create_frame:
  name: "Spacing/{name}"
  layoutMode: "HORIZONTAL"
  counterAxisAlignItems: "CENTER"
  itemSpacing: 16
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  children:
    # The bar rectangle -- width matches the spacing value
    - type: "rectangle"
      width: "{value}"               # e.g. 8 for spacing/sm
      height: 16
      cornerRadius: 3
      fill: "#3878FA"
      # Note: to bind width to a spacing variable, use nodes(method:"update")
      # after creation to call setBoundVariable('width', variableId)

    # Label: "spacing/sm  8px  var(--spacing-sm)"
    - type: "text"
      content: "{name}  {value}px  {codeSyntax}"
      fontSize: 12
      fill: "#595959"
```

### Spacing section builder

The full spacing section has a heading followed by one bar row per spacing token.

```yaml
create_frame:
  name: "Section/Spacing"
  layoutMode: "VERTICAL"
  itemSpacing: 12
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  parentId: "{rootFrameId}"
  children:
    - type: "text"
      content: "Spacing"
      fontStyle: "Bold"
      fontSize: 32
      fill: "#121212"

    # Then append one spacing bar row per token using parentId
```

For each spacing token, create a bar row using the pattern above and append it to the section via `parentId`.

---

## 6. Shadow Cards (Elevation)

Elevation documentation shows cards with progressively stronger drop shadows, labeled with name and effect parameters.

### Single shadow card

Each shadow card is a white square with a drop shadow effect, containing the elevation name and shadow parameters.

```yaml
create_frame:
  name: "ShadowCard/{name}"
  width: 120
  height: 120
  layoutMode: "VERTICAL"
  primaryAxisAlignItems: "CENTER"
  counterAxisAlignItems: "CENTER"
  itemSpacing: 8
  paddingTop: 16
  paddingBottom: 16
  cornerRadius: 8
  fill: "#FFFFFF"
  shadow:
    x: "{offsetX}"                    # e.g. 0
    y: "{offsetY}"                    # e.g. 4
    blur: "{blurRadius}"              # e.g. 12
    color: "{shadowColor}"            # e.g. "#00000040"
  children:
    # Elevation name
    - type: "text"
      content: "{leafName}"          # e.g. "Medium"
      fontStyle: "Medium"
      fontSize: 12
      fill: "#333333"
      textAlignHorizontal: "CENTER"

    # Effect parameters
    - type: "text"
      content: "x:{offsetX} y:{offsetY}\nblur:{blurRadius}"
      fontSize: 10
      fill: "#8C8C8C"
      textAlignHorizontal: "CENTER"
```

### Shadow section builder

The full elevation section has a heading and a horizontal card row with a light background.

```yaml
create_frame:
  name: "Section/Elevation"
  layoutMode: "VERTICAL"
  itemSpacing: 24
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  parentId: "{rootFrameId}"
  children:
    - type: "text"
      content: "Elevation"
      fontStyle: "Bold"
      fontSize: 32
      fill: "#121212"

    # Cards row -- extra padding so shadows are visible
    - type: "frame"
      name: "Elevation/Row"
      layoutMode: "HORIZONTAL"
      itemSpacing: 32
      paddingTop: 24
      paddingBottom: 40
      paddingLeft: 24
      paddingRight: 24
      layoutSizingHorizontal: "FILL"
      fill: "#F7F7F7"
      cornerRadius: 8
      children: []                    # Populate with shadow card frames
```

For each shadow token, create a card using the pattern above and append it to the row via `parentId`.

---

## 7. Border Radius Demo

Border radius documentation shows rectangles at each corner radius value, labeled with the token name and pixel value.

### Single radius card

Each radius card is a vertical stack: a styled rectangle with the corner radius applied, the token name, and the pixel value.

```yaml
create_frame:
  name: "Radius/{name}"
  width: 96
  layoutMode: "VERTICAL"
  primaryAxisAlignItems: "CENTER"
  counterAxisAlignItems: "CENTER"
  itemSpacing: 8
  fill: ""                            # transparent
  children:
    # Demo rectangle with corner radius
    - type: "rectangle"
      width: 72
      height: 72
      fill: "#3878FA26"              # brand blue at ~15% opacity
      strokeColor: "#3878FA"
      strokeWeight: 1.5
      cornerRadius: "{displayRadius}" # min(value, 36) -- cap for display
      # Note: to bind cornerRadius to a variable, use nodes(method:"update")
      # after creation to call setBoundVariable('cornerRadius', variableId)

    # Token name
    - type: "text"
      content: "{leafName}"          # e.g. "md"
      fontStyle: "Medium"
      fontSize: 11
      fill: "#333333"
      textAlignHorizontal: "CENTER"

    # Pixel value
    - type: "text"
      content: "{displayValue}"      # e.g. "8px" or "full" for 9999
      fontSize: 10
      fill: "#8C8C8C"
      textAlignHorizontal: "CENTER"
```

### Radius section builder

The full border radius section has a heading and a horizontal card row with a light background.

```yaml
create_frame:
  name: "Section/Radius"
  layoutMode: "VERTICAL"
  itemSpacing: 24
  layoutSizingHorizontal: "FILL"
  fill: ""                            # transparent
  parentId: "{rootFrameId}"
  children:
    - type: "text"
      content: "Border Radius"
      fontStyle: "Bold"
      fontSize: 32
      fill: "#121212"

    # Cards row
    - type: "frame"
      name: "Radius/Row"
      layoutMode: "HORIZONTAL"
      itemSpacing: 24
      padding: 24
      layoutSizingHorizontal: "FILL"
      fill: "#F7F7F7"
      cornerRadius: 8
      children: []                    # Populate with radius card frames
```

For each radius token, create a card using the pattern above and append it to the row via `parentId`.

---

## 8. Documentation Alongside Components

Each component page should include a documentation frame directly on the canvas, placed to the left of the component set. This keeps docs and the component in sync without requiring a separate file.

### Component page documentation frame

The documentation frame contains the component name, description, a divider, and usage bullet points.

```yaml
create_frame:
  name: "_Doc"
  width: 360
  layoutMode: "VERTICAL"
  itemSpacing: 16
  padding: 40
  fill: ""                            # transparent
  x: 0
  y: 0
  children:
    # Component name -- large heading
    - type: "text"
      content: "{componentName}"     # e.g. "Button"
      fontStyle: "Bold"
      fontSize: 28
      fill: "#121212"
      layoutSizingHorizontal: "FILL"

    # Description
    - type: "text"
      content: "{description}"       # e.g. "Primary action trigger for forms and dialogs."
      fontSize: 13
      lineHeight: 20
      fill: "#595959"
      layoutSizingHorizontal: "FILL"

    # Divider
    - type: "rectangle"
      height: 1
      fill: "#E0E0E0"
      layoutSizingHorizontal: "FILL"

    # Usage heading
    - type: "text"
      content: "Usage"
      fontStyle: "Bold"
      fontSize: 13
      fill: "#121212"

    # Usage notes -- one text node per bullet point
    - type: "text"
      content: "* {usageNote1}"
      fontSize: 12
      lineHeight: 18
      fill: "#666666"
      layoutSizingHorizontal: "FILL"

    - type: "text"
      content: "* {usageNote2}"
      fontSize: 12
      lineHeight: 18
      fill: "#666666"
      layoutSizingHorizontal: "FILL"

    # ... one child per usage note
```

---

## 9. Critical Rules

1. **Bind swatches to variables** -- use `fillVariableName` for color fills in `create_frame` children. For spacing bar widths and radius card corner radii, use `nodes(method:"update")` after creation to bind via `setBoundVariable`. Never hardcode values that have corresponding variables.
2. **Foundations page comes before component pages** -- always insert it between the file structure separators and the first component page.
3. **Show both primitive and semantic layers** -- if the system has a Primitives collection and a semantic Color collection, document both on the Foundations page with clear section labels.
4. **Page frame width = 1440px** -- this is the convention across Simple DS, Polaris, and Material 3. Use it unless you detect a different existing convention via `get_current_page(maxDepth:2)`.
5. **Section spacing = 64-80px** -- the gap between color / typography / spacing / shadow / radius sections should be at minimum 64px so the page is scannable.
6. **Match existing page style** -- if the target file uses emoji page name prefixes or a decorative separator style, carry that through to the Foundations page name.
7. **Include code syntax in labels** -- where variables have code syntax set, display the CSS variable name in the swatch/bar label so developers can copy it directly.
8. **Opinion Engine handles font loading** -- never manually load fonts. The Opinion Engine pre-loads all fonts referenced in `create_frame` children automatically.
9. **Use nested children for atomic groups** -- collapse multi-step create-then-append sequences into a single `create_frame(children:[...])` call. Only use `parentId` when appending to an existing frame created in a prior call.
