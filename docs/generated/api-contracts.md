# FigCraft API Contracts

This document is generated from `schema/tools.yaml`, `packages/core-mcp/src/tools/_contracts.ts`, and `packages/core-mcp/src/tools/_registry.ts`.

## Tool Response Coverage

Covered flat/custom tools: 115

### `add_collection_mode`

- Example payloads: 1

```json
{
  "ok": true,
  "modeId": "1:1",
  "name": "Dark"
}
```

### `add_component_property`

- Example payloads: 1

```json
{
  "ok": true,
  "properties": [
    "State",
    "Label"
  ]
}
```

### `analyze_prototype_flow`

- Example payloads: 1

```json
{
  "graph": {
    "stats": {
      "totalScreens": 2,
      "totalInteractions": 1
    },
    "nodes": [],
    "edges": []
  },
  "mermaid": "graph TD\n  A --> B",
  "markdown": "# Prototype Flow Documentation"
}
```

### `audit_components`

- Example payloads: 1

```json
{
  "summary": {
    "totalComponents": 4,
    "totalIssues": 1
  },
  "components": [
    {
      "id": "80:1",
      "name": "Button / Primary",
      "propertyCount": 2
    }
  ],
  "issues": [
    {
      "nodeId": "80:1",
      "name": "Button / Primary",
      "issue": "Missing description"
    }
  ]
}
```

### `batch_create_variables`

- Example payloads: 1

```json
{
  "created": 2,
  "skipped": 0,
  "failed": 0,
  "errors": [],
  "collectionId": "VariableCollectionId:1:2",
  "description": "Array of variables to create"
}
```

### `boolean_operation`

- Example payloads: 1

```json
{
  "id": "93:1",
  "name": "Merged Shape",
  "type": "BOOLEAN_OPERATION",
  "width": 160,
  "height": 120,
  "visible": true
}
```

### `cache_tokens`

- Example payloads: 1

```json
{
  "cached": 24,
  "name": "tokens-light"
}
```

### `clear_annotations`

- Example payloads: 1

```json
{
  "cleared": 3
}
```

### `clone_node`

- Example payloads: 1

```json
{
  "id": "60:1",
  "name": "Cloned Card",
  "type": "FRAME",
  "width": 320,
  "height": 180
}
```

### `compliance_report`

- Example payloads: 1

```json
{
  "overallScore": 92,
  "lint": {
    "score": 95,
    "nodesChecked": 20,
    "passed": 19,
    "violations": 1
  },
  "components": {
    "score": 89,
    "total": 8,
    "issues": 1
  }
}
```

### `create_collection`

- Example payloads: 1

```json
{
  "id": "VariableCollectionId:1:2",
  "name": "Semantic",
  "modes": [
    {
      "modeId": "1:0",
      "name": "Mode 1"
    }
  ]
}
```

### `create_component`

- Example payloads: 1

```json
{
  "id": "80:1",
  "name": "Button / Primary",
  "type": "COMPONENT",
  "width": 160,
  "height": 48,
  "visible": true
}
```

### `create_component_set`

- Example payloads: 1

```json
{
  "id": "81:1",
  "name": "Button",
  "type": "COMPONENT_SET",
  "width": 320,
  "height": 48,
  "visible": true
}
```

### `create_document`

- Example payloads: 2

```json
{
  "ok": true,
  "created": [
    {
      "id": "12:34",
      "name": "Auth Screen",
      "type": "FRAME"
    }
  ],
  "postCreateLint": {
    "scopedNodeIds": [
      "12:34"
    ],
    "initial": {
      "violations": 0
    },
    "final": {
      "violations": 0
    }
  }
}
```

### `create_ellipse`

- Example payloads: 1

```json
{
  "id": "50:2",
  "name": "Avatar Dot",
  "type": "ELLIPSE",
  "width": 40,
  "height": 40,
  "autoBound": "surface/accent"
}
```

### `create_frame`

- Example payloads: 1

```json
{
  "id": "30:1",
  "name": "Card Frame",
  "type": "FRAME",
  "x": 64,
  "y": 120,
  "width": 320,
  "height": 180,
  "layoutMode": "VERTICAL",
  "itemSpacing": 16,
  "autoBound": "surface/default"
}
```

### `create_instance`

- Example payloads: 1

```json
{
  "id": "40:1",
  "name": "Button / Primary",
  "type": "INSTANCE",
  "width": 160,
  "height": 48
}
```

### `create_line`

- Example payloads: 1

```json
{
  "id": "90:1",
  "name": "Divider",
  "type": "LINE",
  "width": 320,
  "height": 0,
  "visible": true
}
```

### `create_page`

- Example payloads: 1

```json
{
  "id": "0:3",
  "name": "Marketing"
}
```

### `create_paint_style`

- Example payloads: 1

```json
{
  "id": "Style:10",
  "name": "Color/Brand/Primary"
}
```

### `create_polygon`

- Example payloads: 1

```json
{
  "id": "90:3",
  "name": "Triangle",
  "type": "POLYGON",
  "width": 100,
  "height": 100,
  "visible": true
}
```

### `create_rectangle`

- Example payloads: 1

```json
{
  "id": "50:1",
  "name": "Card Background",
  "type": "RECTANGLE",
  "width": 320,
  "height": 180,
  "cornerRadius": 24,
  "autoBound": "surface/default"
}
```

### `create_screen`

- Example payloads: 2

```json
{
  "ok": true,
  "screenRootId": "20:1",
  "screen": {
    "ok": true,
    "created": [
      {
        "id": "20:1",
        "name": "Marketing Hero",
        "type": "FRAME"
      }
    ]
  },
  "sections": [
    {
      "index": 0,
      "name": "Hero Section",
      "ok": true,
      "result": {
        "ok": true,
        "created": [
          {
            "id": "20:2",
            "name": "Hero Content",
            "type": "FRAME"
          }
        ]
      }
    }
  ],
  "pipelineStages": [
    {
      "stage": "shell",
      "ok": true,
      "createdCount": 1,
      "nodeIds": [
        "20:1"
      ],
      "warningCount": 0,
      "patchCallCount": 0,
      "patchNodeCount": 0,
      "patchRules": [],
      "structuralErrors": [],
      "debugStats": {}
    },
    {
      "stage": "section:1",
      "ok": true,
      "createdCount": 1,
      "nodeIds": [
        "20:2"
      ],
      "warningCount": 0,
      "patchCallCount": 0,
      "patchNodeCount": 0,
      "patchRules": [],
      "structuralErrors": [],
      "debugStats": {}
    }
  ],
  "pipelineSummary": {
    "stageCount": 2,
    "createdCount": 2,
    "warningCount": 0,
    "remaining": 0
  },
  "finalLint": {
    "scopedNodeIds": [
      "20:1"
    ],
    "remaining": 0
  }
}
```

### `create_section`

- Example payloads: 1

```json
{
  "id": "91:1",
  "name": "Onboarding",
  "x": 0,
  "y": 0
}
```

### `create_star`

- Example payloads: 1

```json
{
  "id": "90:2",
  "name": "Star",
  "type": "STAR",
  "width": 100,
  "height": 100,
  "visible": true
}
```

### `create_text`

- Example payloads: 2

```json
{
  "id": "30:2",
  "name": "Hero Title",
  "type": "TEXT",
  "x": 88,
  "y": 164,
  "width": 220,
  "height": 40,
  "characters": "Ship Faster",
  "fontSize": 32,
  "autoBound": {
    "color": "text/primary",
    "typography": "style:Heading/L"
  }
}
```

### `create_variable`

- Example payloads: 1

```json
{
  "id": "VariableID:1:30",
  "name": "spacing/md",
  "resolvedType": "FLOAT"
}
```

### `create_variable_alias`

- Example payloads: 1

```json
{
  "ok": true,
  "variableId": "VariableID:1:40",
  "aliasTo": "color/brand/primary"
}
```

### `create_vector`

- Example payloads: 1

```json
{
  "id": "70:1",
  "name": "Arrow Icon",
  "type": "FRAME",
  "width": 24,
  "height": 24
}
```

### `delete_cached_tokens`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `delete_collection`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `delete_component`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `delete_component_property`

- Example payloads: 1

```json
{
  "ok": true,
  "properties": [
    "State"
  ]
}
```

### `delete_node`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `delete_nodes`

- Example payloads: 1

```json
{
  "results": [
    {
      "nodeId": "30:1",
      "ok": true
    },
    {
      "nodeId": "999:1",
      "ok": false,
      "error": "Node not found"
    }
  ]
}
```

### `delete_style`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `delete_variable`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `detach_instance`

- Example payloads: 1

```json
{
  "id": "83:1",
  "name": "Button / Primary",
  "type": "FRAME",
  "width": 160,
  "height": 48,
  "visible": true
}
```

### `diff_styles`

- Example payloads: 1

```json
{
  "diff": [
    {
      "path": "color.brand.primary",
      "status": "in-sync",
      "dtcgValue": "#7c3aed",
      "figmaValue": "#7c3aed"
    }
  ],
  "total": 1
}
```

### `diff_tokens`

- Example payloads: 1

```json
{
  "summary": {
    "inSync": 8,
    "dtcgAhead": 1,
    "missingInFigma": 2,
    "missingInDtcg": 0
  },
  "diff": [
    {
      "path": "color.brand.primary",
      "status": "in-sync",
      "dtcgValue": "#7c3aed",
      "figmaValue": "#7c3aed"
    },
    {
      "path": "spacing.lg",
      "status": "missing-in-figma",
      "dtcgValue": 24
    }
  ]
}
```

### `export_image`

- Example payloads: 1

```json
{
  "format": "PNG",
  "size": 18432,
  "base64": "iVBORw0KGgoAAAANSUhEUgAAAAUA"
}
```

### `export_tokens`

- Example payloads: 1

```json
{
  "Design Tokens": {
    "color/brand/primary": {
      "$value": "#7c3aed",
      "$type": "color",
      "$description": "Primary brand color"
    }
  }
}
```

### `export_variables`

- Example payloads: 1

```json
{
  "count": 1,
  "variables": [
    {
      "path": "color.brand.primary",
      "type": "color",
      "valuesByMode": {
        "Default": "#7c3aed"
      },
      "description": "Primary brand color",
      "scopes": [
        "ALL_FILLS"
      ]
    }
  ]
}
```

### `figma_auth_status`

- Example payloads: 1

```json
{
  "method": "oauth",
  "expiresAt": 1893456000000
}
```

### `figma_login`

- Example payloads: 1

```json
{
  "ok": true,
  "url": "https://www.figma.com/oauth?client_id=example",
  "message": "Please open this URL in your browser to authorize figcraft with Figma."
}
```

### `figma_logout`

- Example payloads: 1

```json
{
  "ok": true,
  "message": "Figma credentials cleared."
}
```

### `flatten_node`

- Example payloads: 1

```json
{
  "id": "92:1",
  "name": "Flattened Shape",
  "type": "VECTOR",
  "width": 120,
  "height": 120,
  "visible": true
}
```

### `get_annotations`

- Example payloads: 1

```json
{
  "nodes": [
    {
      "nodeId": "100:1",
      "nodeName": "Login Form",
      "annotations": [
        {
          "label": "Check spacing",
          "properties": [
            {
              "type": "design"
            }
          ]
        }
      ]
    }
  ],
  "count": 1
}
```

### `get_channel`

- Example payloads: 1

```json
{
  "channel": "design-1",
  "connected": true
}
```

### `get_component`

- Example payloads: 1

```json
{
  "id": "12:1",
  "name": "Button / Primary",
  "type": "COMPONENT",
  "width": 160,
  "height": 48,
  "description": "Main call-to-action button",
  "key": "button-primary-key",
  "componentPropertyDefinitions": {
    "State#1": {
      "type": "VARIANT",
      "defaultValue": "Default"
    }
  }
}
```

### `get_current_page`

- Example payloads: 1

```json
{
  "id": "0:1",
  "name": "Page 1",
  "childCount": 3,
  "returnedNodes": 2,
  "truncated": true,
  "nodes": [
    {
      "id": "1:10",
      "name": "Dashboard",
      "type": "FRAME"
    },
    {
      "id": "1:20",
      "name": "Settings",
      "type": "FRAME"
    }
  ]
}
```

### `get_document_info`

- Example payloads: 1

```json
{
  "name": "Acme Product",
  "currentPage": "Page 1",
  "pages": [
    {
      "id": "0:1",
      "name": "Page 1",
      "childCount": 12
    },
    {
      "id": "0:2",
      "name": "Components",
      "childCount": 48
    }
  ]
}
```

### `get_instance_overrides`

- Example payloads: 1

```json
{
  "nodeId": "82:1",
  "nodeName": "Button / Primary",
  "properties": [
    {
      "key": "State",
      "type": "VARIANT",
      "value": "Default"
    }
  ]
}
```

### `get_library_style_details`

- Example payloads: 1

```json
{
  "count": 1,
  "styles": [
    {
      "key": "StyleKey:1",
      "file_key": "abc123",
      "node_id": "1:2",
      "style_type": "TEXT",
      "name": "Text/Heading/L",
      "description": "Display heading",
      "properties": {
        "fontFamily": "Inter",
        "fontSize": 32
      }
    }
  ]
}
```

### `get_mode`

- Example payloads: 2

```json
{
  "connected": true,
  "latency": "24ms",
  "mode": "library",
  "selectedLibrary": "Acme DS",
  "designContext": {
    "source": "library",
    "collections": [
      {
        "name": "Color",
        "key": "VariableCollectionId:1:2"
      }
    ]
  },
  "libraryComponents": [
    {
      "key": "component-key",
      "name": "Button / Primary",
      "description": "Primary CTA button"
    }
  ],
  "_hint": "Library mode — tokens and components loaded. NEXT: Reply to user to gather missing preferences (UI type, platform). Do NOT call any more tools. If user provided everything, reply with design proposal instead."
}
```

### `get_node_info`

- Example payloads: 1

```json
{
  "id": "1:23",
  "name": "Login Screen",
  "type": "FRAME",
  "width": 402,
  "height": 874,
  "children": [
    {
      "id": "1:24",
      "name": "Login Form",
      "type": "FRAME"
    }
  ]
}
```

### `get_node_variables`

- Example payloads: 1

```json
{
  "nodeId": "1:24",
  "bindings": {
    "fills": [
      {
        "variableId": "VariableID:1:12",
        "variableName": "color/brand/primary",
        "collectionId": "VariableCollectionId:1:2"
      }
    ]
  }
}
```

### `get_reactions`

- Example payloads: 1

```json
{
  "nodes": [
    {
      "nodeId": "101:1",
      "nodeName": "CTA Button",
      "reactions": [
        {
          "trigger": {
            "type": "ON_CLICK"
          },
          "actions": [
            {
              "type": "NODE",
              "destinationId": "101:2"
            }
          ]
        }
      ]
    }
  ],
  "count": 1
}
```

### `get_registered_styles`

- Example payloads: 1

```json
{
  "textStyles": [
    {
      "key": "S:1",
      "name": "Text/Heading/L",
      "fontSize": 32,
      "fontFamily": "Inter",
      "fontWeight": "Bold"
    }
  ],
  "paintStyles": [
    {
      "key": "S:2",
      "name": "Color/Brand/Primary",
      "hex": "#7c3aed"
    }
  ],
  "effectStyles": [
    {
      "key": "S:3",
      "name": "Shadow/Card/Default",
      "effectType": "DROP_SHADOW"
    }
  ],
  "_loaded": {
    "text": 1,
    "paint": 1,
    "effect": 1
  }
}
```

### `get_selection`

- Example payloads: 1

```json
{
  "count": 2,
  "nodes": [
    {
      "id": "1:10",
      "name": "CTA Button",
      "type": "FRAME"
    },
    {
      "id": "1:11",
      "name": "Headline",
      "type": "TEXT"
    }
  ]
}
```

### `get_style`

- Example payloads: 1

```json
{
  "id": "Style:1",
  "name": "Color/Brand/Primary",
  "type": "PAINT",
  "description": "Primary brand color",
  "paints": [
    {
      "type": "SOLID",
      "visible": true,
      "opacity": 1,
      "color": "#7c3aed"
    }
  ]
}
```

### `get_variable`

- Example payloads: 1

```json
{
  "id": "VariableID:1:12",
  "name": "color/brand/primary",
  "resolvedType": "COLOR",
  "description": "Primary brand color",
  "collectionId": "VariableCollectionId:1:2",
  "collectionName": "Primitives",
  "scopes": [
    "ALL_FILLS"
  ],
  "codeSyntax": {
    "WEB": "var(--color-brand-primary)"
  },
  "valuesByMode": {
    "Default": "#7c3aed"
  }
}
```

### `import_library_style`

- Example payloads: 1

```json
{
  "id": "Style:21",
  "name": "Text/Heading/L",
  "type": "TEXT",
  "key": "StyleKey:1",
  "description": "Display heading"
}
```

### `import_library_variable`

- Example payloads: 1

```json
{
  "id": "VariableID:9:1",
  "name": "color/brand/primary",
  "resolvedType": "COLOR",
  "description": "Primary brand color",
  "key": "VariableKey:1"
}
```

### `insert_child`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `join_channel`

- Example payloads: 1

```json
{
  "ok": true,
  "channel": "design-1",
  "message": "Joined channel \"design-1\". Commands will now target this document."
}
```

### `lint_check`

- Example payloads: 1

```json
{
  "summary": {
    "total": 10,
    "pass": 8,
    "violations": 2
  },
  "categories": [
    {
      "rule": "default-name",
      "count": 1,
      "nodes": [
        {
          "nodeId": "1:2",
          "nodeName": "Frame 1",
          "suggestion": "Rename the frame semantically.",
          "autoFixable": false
        }
      ]
    }
  ],
  "scope": {
    "type": "page",
    "count": 1,
    "pageName": "Page 1"
  }
}
```

### `lint_fix`

- Example payloads: 1

```json
{
  "fixed": 2,
  "failed": 0,
  "errors": []
}
```

### `lint_fix_all`

- Example payloads: 1

```json
{
  "lint": {
    "total": 24,
    "pass": 20,
    "violations": 4,
    "bySeverity": {
      "warning": 3,
      "error": 1
    }
  },
  "fixable": 3,
  "fixed": 3,
  "fixFailed": 0,
  "remaining": 1
}
```

### `lint_rules`

- Example payloads: 1

```json
{
  "rules": [
    {
      "name": "default-name",
      "description": "Flags default Figma layer names.",
      "category": "naming",
      "severity": "warning"
    }
  ]
}
```

### `list_cached_tokens`

- Example payloads: 1

```json
{
  "entries": [
    "tokens-light",
    "tokens-dark"
  ]
}
```

### `list_collections`

- Example payloads: 1

```json
[
  {
    "id": "VariableCollectionId:1:2",
    "name": "Primitives",
    "modes": [
      {
        "modeId": "1:0",
        "name": "Default"
      }
    ],
    "variableCount": 12
  }
]
```

### `list_component_properties`

- Example payloads: 1

```json
{
  "properties": [
    {
      "key": "State",
      "type": "VARIANT",
      "defaultValue": "Default",
      "variantOptions": [
        "Default",
        "Pressed",
        "Disabled"
      ]
    },
    {
      "key": "Has Icon",
      "type": "BOOLEAN",
      "defaultValue": false
    }
  ]
}
```

### `list_components`

- Example payloads: 1

```json
{
  "count": 2,
  "components": [
    {
      "id": "12:1",
      "name": "Button / Primary",
      "description": "Main call-to-action button",
      "key": "button-primary-key"
    },
    {
      "id": "12:2",
      "name": "Input / Default",
      "key": "input-default-key"
    }
  ]
}
```

### `list_fonts`

- Example payloads: 2

```json
{
  "families": [
    "Inter",
    "SF Pro Display",
    "JetBrains Mono"
  ],
  "total": 3
}
```

### `list_library_collections`

- Example payloads: 1

```json
[
  {
    "key": "VarCollectionKey:1",
    "name": "Color",
    "libraryName": "Acme DS"
  }
]
```

### `list_library_components`

- Example payloads: 1

```json
{
  "count": 2,
  "components": [
    {
      "key": "library-button-primary",
      "name": "Button / Primary",
      "description": "Primary CTA button"
    },
    {
      "key": "library-input-default",
      "name": "Input / Default",
      "description": "Default text field"
    }
  ]
}
```

### `list_library_styles`

- Example payloads: 1

```json
{
  "count": 1,
  "styles": [
    {
      "key": "StyleKey:1",
      "file_key": "abc123",
      "node_id": "1:2",
      "style_type": "TEXT",
      "name": "Text/Heading/L",
      "description": "Display heading"
    }
  ]
}
```

### `list_library_variables`

- Example payloads: 1

```json
{
  "count": 1,
  "variables": [
    {
      "key": "VariableKey:1",
      "name": "color/brand/primary",
      "resolvedType": "COLOR"
    }
  ]
}
```

### `list_styles`

- Example payloads: 1

```json
{
  "count": 2,
  "styles": [
    {
      "id": "Style:1",
      "name": "Color/Brand/Primary",
      "type": "PAINT",
      "description": "Primary brand color",
      "paints": [
        {
          "type": "SOLID",
          "visible": true,
          "opacity": 1,
          "color": "#7c3aed"
        }
      ]
    },
    {
      "id": "Style:2",
      "name": "Text/Heading/L",
      "type": "TEXT",
      "fontName": {
        "family": "Inter",
        "style": "Bold"
      },
      "fontSize": 32
    }
  ]
}
```

### `list_tokens`

- Example payloads: 1

```json
{
  "total": 2,
  "showing": 2,
  "tokens": [
    {
      "path": "color.brand.primary",
      "type": "color",
      "value": "#7c3aed",
      "description": "Primary brand color"
    },
    {
      "path": "text.heading.l",
      "type": "typography",
      "value": {
        "fontFamily": "Inter",
        "fontWeight": 700,
        "fontSize": 32
      }
    }
  ]
}
```

### `list_variables`

- Example payloads: 1

```json
{
  "count": 1,
  "variables": [
    {
      "id": "VariableID:1:12",
      "name": "color/brand/primary",
      "resolvedType": "COLOR",
      "description": "Primary brand color",
      "collectionId": "VariableCollectionId:1:2",
      "collectionName": "Primitives",
      "scopes": [
        "ALL_FILLS"
      ],
      "valuesByMode": {
        "Default": "#7c3aed"
      }
    }
  ]
}
```

### `patch_nodes`

- Example payloads: 1

```json
{
  "results": [
    {
      "nodeId": "30:1",
      "ok": true
    },
    {
      "nodeId": "30:2",
      "ok": false,
      "error": "Node not found"
    }
  ]
}
```

### `ping`

- Example payloads: 2

```json
{
  "connected": true,
  "latency": "18ms",
  "serverVersion": "0.1.0",
  "pluginVersion": "0.1.0",
  "_hint": "Connection OK. Proceed with your task — do NOT stop here.",
  "result": {
    "ok": true,
    "channel": "design-1"
  }
}
```

### `register_library_styles`

- Example payloads: 1

```json
{
  "ok": true,
  "registered": {
    "textStyles": 8,
    "paintStyles": 12,
    "effectStyles": 3
  }
}
```

### `remove_collection_mode`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `rename_collection`

- Example payloads: 1

```json
{
  "ok": true,
  "id": "VariableCollectionId:1:2",
  "name": "Semantic"
}
```

### `rename_collection_mode`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `rename_page`

- Example payloads: 1

```json
{
  "ok": true,
  "id": "0:3",
  "name": "Marketing"
}
```

### `reset_instance_overrides`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `reverse_sync_tokens`

- Example payloads: 1

```json
{
  "ok": true,
  "filePath": "/tmp/tokens.json",
  "tokenCount": 24
}
```

### `save_version_history`

- Example payloads: 1

```json
{
  "ok": true,
  "title": "Before refactor",
  "description": "Checkpoint before layout cleanup"
}
```

### `scan_styles`

- Example payloads: 1

```json
{
  "paint": [
    {
      "id": "Style:1",
      "name": "Color/Brand/Primary",
      "paints": 1
    }
  ],
  "text": [
    {
      "id": "Style:2",
      "name": "Text/Heading/L",
      "fontSize": 32,
      "fontName": {
        "family": "Inter",
        "style": "Bold"
      }
    }
  ],
  "effect": [
    {
      "id": "Style:3",
      "name": "Shadow/Card/Default",
      "effects": 1
    }
  ],
  "summary": {
    "paintCount": 1,
    "textCount": 1,
    "effectCount": 1
  }
}
```

### `search_nodes`

- Example payloads: 1

```json
{
  "count": 2,
  "nodes": [
    {
      "id": "1:10",
      "name": "Login Button",
      "type": "FRAME"
    },
    {
      "id": "1:11",
      "name": "Login Title",
      "type": "TEXT"
    }
  ]
}
```

### `set_annotation`

- Example payloads: 1

```json
{
  "ok": true,
  "nodeId": "100:1",
  "count": 2
}
```

### `set_current_page`

- Example payloads: 1

```json
{
  "ok": true,
  "pageId": "0:2",
  "pageName": "Components"
}
```

### `set_explicit_variable_mode`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `set_image_fill`

- Example payloads: 1

```json
{
  "ok": true,
  "imageHash": "b2f7c1d4a9"
}
```

### `set_instance_overrides`

- Example payloads: 1

```json
{
  "succeeded": 3,
  "failed": 0
}
```

### `set_mode`

- Example payloads: 1

```json
{
  "mode": "library",
  "description": "Using Figma shared library as token source. Lint checks variable/style bindings."
}
```

### `set_multiple_annotations`

- Example payloads: 1

```json
{
  "succeeded": 2,
  "failed": 0,
  "results": [
    {
      "nodeId": "100:1",
      "ok": true
    },
    {
      "nodeId": "100:2",
      "ok": true
    }
  ]
}
```

### `set_selection`

- Example payloads: 2

```json
{
  "ok": true,
  "selectedCount": 2,
  "notFound": []
}
```

### `set_text_content`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `set_variable_binding`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `swap_instance`

- Example payloads: 1

```json
{
  "id": "82:1",
  "name": "Button / Primary",
  "type": "INSTANCE",
  "width": 160,
  "height": 48,
  "visible": true
}
```

### `sync_library_styles`

- Example payloads: 1

```json
{
  "ok": true,
  "discovered": {
    "total": 12,
    "text": 4,
    "fill": 6,
    "effect": 2
  },
  "diff": {
    "added": [],
    "removed": [],
    "modified": [],
    "unchanged": 12
  },
  "registered": {
    "ok": true,
    "registered": {
      "textStyles": 4,
      "paintStyles": 6,
      "effectStyles": 2
    }
  }
}
```

### `sync_styles`

- Example payloads: 1

```json
{
  "created": 2,
  "updated": 1,
  "skipped": 0,
  "failed": 0,
  "failures": []
}
```

### `sync_tokens`

- Example payloads: 1

```json
{
  "variables": {
    "created": 10,
    "updated": 2,
    "skipped": 1,
    "failed": 0,
    "failures": []
  },
  "styles": {
    "created": 2,
    "updated": 0,
    "skipped": 0,
    "failed": 0,
    "failures": []
  },
  "totalTokens": 15
}
```

### `sync_tokens_multi_mode`

- Example payloads: 1

```json
{
  "collectionId": "VariableCollectionId:1:2",
  "modes": [
    {
      "modeId": "1:0",
      "name": "Light"
    },
    {
      "modeId": "1:1",
      "name": "Dark"
    }
  ],
  "results": {
    "Light": {
      "variables": {
        "created": 8,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "failures": []
      },
      "styles": {
        "created": 2,
        "updated": 0,
        "skipped": 0,
        "failed": 0,
        "failures": []
      },
      "totalTokens": 10
    }
  }
}
```

### `update_component`

- Example payloads: 1

```json
{
  "id": "80:1",
  "name": "Button / Secondary",
  "type": "COMPONENT",
  "width": 160,
  "height": 48,
  "visible": true
}
```

### `update_component_property`

- Example payloads: 1

```json
{
  "ok": true,
  "properties": [
    "State",
    "Label"
  ]
}
```

### `update_effect_style`

- Example payloads: 1

```json
{
  "id": "Style:12",
  "name": "Shadow/Card/Default"
}
```

### `update_paint_style`

- Example payloads: 1

```json
{
  "id": "Style:10",
  "name": "Color/Brand/Accent"
}
```

### `update_text_style`

- Example payloads: 1

```json
{
  "id": "Style:11",
  "name": "Text/Heading/L",
  "fontSize": 32
}
```

### `update_variable`

- Example payloads: 1

```json
{
  "ok": true,
  "id": "VariableID:1:30"
}
```

## Endpoint Response Coverage

Covered endpoint methods: 37

### `components.create_instance`

- Example payloads: 1

```json
{
  "id": "40:1",
  "name": "Button / Primary",
  "type": "INSTANCE",
  "width": 160,
  "height": 48
}
```

### `components.get`

- Example payloads: 1

```json
{
  "id": "12:1",
  "name": "Button / Primary",
  "type": "COMPONENT",
  "description": "Main call-to-action button",
  "key": "button-primary-key"
}
```

### `components.list`

- Example payloads: 1

```json
{
  "count": 1,
  "components": [
    {
      "id": "12:1",
      "name": "Button / Primary",
      "key": "button-primary-key"
    }
  ]
}
```

### `components.list_library`

- Example payloads: 1

```json
{
  "count": 1,
  "components": [
    {
      "key": "library-button-primary",
      "name": "Button / Primary",
      "description": "Primary CTA button"
    }
  ]
}
```

### `components.list_properties`

- Example payloads: 1

```json
{
  "properties": [
    {
      "key": "State",
      "type": "VARIANT",
      "defaultValue": "Default",
      "variantOptions": [
        "Default",
        "Pressed"
      ]
    }
  ]
}
```

### `nodes.clone`

- Example payloads: 1

```json
{
  "id": "60:1",
  "name": "Cloned Card",
  "type": "FRAME",
  "width": 320,
  "height": 180
}
```

### `nodes.delete`

- Example payloads: 1

```json
{
  "results": [
    {
      "nodeId": "30:1",
      "ok": true
    }
  ]
}
```

### `nodes.get`

- Example payloads: 1

```json
{
  "id": "1:23",
  "name": "Auth Screen",
  "type": "FRAME",
  "width": 402,
  "height": 874,
  "children": [
    {
      "id": "1:24",
      "name": "Login Form",
      "type": "FRAME"
    }
  ]
}
```

### `nodes.insert_child`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `nodes.list`

- Example payloads: 1

```json
{
  "count": 1,
  "nodes": [
    {
      "id": "1:10",
      "name": "Login Button",
      "type": "FRAME"
    }
  ]
}
```

### `nodes.update`

- Example payloads: 1

```json
{
  "results": [
    {
      "nodeId": "30:1",
      "ok": true
    }
  ]
}
```

### `shapes.create_ellipse`

- Example payloads: 1

```json
{
  "id": "50:2",
  "name": "Avatar Dot",
  "type": "ELLIPSE",
  "width": 40,
  "height": 40
}
```

### `shapes.create_frame`

- Example payloads: 1

```json
{
  "id": "30:1",
  "name": "Card Frame",
  "type": "FRAME",
  "width": 320,
  "height": 180,
  "layoutMode": "VERTICAL",
  "autoBound": "surface/default"
}
```

### `shapes.create_rectangle`

- Example payloads: 1

```json
{
  "id": "50:1",
  "name": "Card Background",
  "type": "RECTANGLE",
  "width": 320,
  "height": 180,
  "cornerRadius": 24
}
```

### `shapes.create_vector`

- Example payloads: 1

```json
{
  "id": "70:1",
  "name": "Arrow Icon",
  "type": "FRAME",
  "width": 24,
  "height": 24
}
```

### `styles_ep.create_paint`

- Example payloads: 1

```json
{
  "id": "Style:10",
  "name": "Color/Brand/Primary"
}
```

### `styles_ep.delete`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `styles_ep.get`

- Example payloads: 1

```json
{
  "id": "Style:1",
  "name": "Color/Brand/Primary",
  "type": "PAINT",
  "description": "Primary brand color",
  "paints": [
    {
      "type": "SOLID",
      "visible": true,
      "opacity": 1,
      "color": "#7c3aed"
    }
  ]
}
```

### `styles_ep.list`

- Example payloads: 1

```json
{
  "count": 2,
  "styles": [
    {
      "id": "Style:1",
      "name": "Color/Brand/Primary",
      "type": "PAINT",
      "description": "Primary brand color",
      "paints": [
        {
          "type": "SOLID",
          "visible": true,
          "opacity": 1,
          "color": "#7c3aed"
        }
      ]
    },
    {
      "id": "Style:2",
      "name": "Text/Heading/L",
      "type": "TEXT",
      "fontName": {
        "family": "Inter",
        "style": "Bold"
      },
      "fontSize": 32
    }
  ]
}
```

### `styles_ep.sync`

- Example payloads: 1

```json
{
  "created": 2,
  "updated": 1,
  "skipped": 0,
  "failed": 0,
  "failures": []
}
```

### `styles_ep.update_effect`

- Example payloads: 1

```json
{
  "id": "Style:12",
  "name": "Shadow/Card/Default"
}
```

### `styles_ep.update_paint`

- Example payloads: 1

```json
{
  "id": "Style:10",
  "name": "Color/Brand/Accent"
}
```

### `styles_ep.update_text`

- Example payloads: 1

```json
{
  "id": "Style:11",
  "name": "Text/Heading/L",
  "fontSize": 32
}
```

### `text.create`

- Example payloads: 1

```json
{
  "id": "30:2",
  "name": "Hero Title",
  "type": "TEXT",
  "characters": "Ship Faster",
  "fontSize": 32,
  "autoBound": {
    "color": "text/primary"
  }
}
```

### `text.set_content`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `variables_ep.batch_create`

- Example payloads: 1

```json
{
  "created": 2,
  "skipped": 0,
  "failed": 0,
  "errors": [],
  "collectionId": "VariableCollectionId:1:2"
}
```

### `variables_ep.create`

- Example payloads: 1

```json
{
  "id": "VariableID:1:30",
  "name": "spacing/md",
  "resolvedType": "FLOAT"
}
```

### `variables_ep.create_collection`

- Example payloads: 1

```json
{
  "id": "VariableCollectionId:1:2",
  "name": "Semantic",
  "modes": [
    {
      "modeId": "1:0",
      "name": "Mode 1"
    }
  ]
}
```

### `variables_ep.delete`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `variables_ep.delete_collection`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `variables_ep.export`

- Example payloads: 1

```json
{
  "count": 1,
  "variables": [
    {
      "path": "color.brand.primary",
      "type": "color",
      "valuesByMode": {
        "Default": "#7c3aed"
      },
      "description": "Primary brand color",
      "scopes": [
        "ALL_FILLS"
      ]
    }
  ]
}
```

### `variables_ep.get`

- Example payloads: 1

```json
{
  "id": "VariableID:1:12",
  "name": "color/brand/primary",
  "resolvedType": "COLOR",
  "description": "Primary brand color",
  "collectionId": "VariableCollectionId:1:2",
  "collectionName": "Primitives",
  "scopes": [
    "ALL_FILLS"
  ],
  "codeSyntax": {
    "WEB": "var(--color-brand-primary)"
  },
  "valuesByMode": {
    "Default": "#7c3aed"
  }
}
```

### `variables_ep.get_bindings`

- Example payloads: 1

```json
{
  "nodeId": "1:24",
  "bindings": {
    "fills": [
      {
        "variableId": "VariableID:1:12",
        "variableName": "color/brand/primary",
        "collectionId": "VariableCollectionId:1:2"
      }
    ]
  }
}
```

### `variables_ep.list`

- Example payloads: 1

```json
{
  "count": 1,
  "variables": [
    {
      "id": "VariableID:1:12",
      "name": "color/brand/primary",
      "resolvedType": "COLOR",
      "description": "Primary brand color",
      "collectionId": "VariableCollectionId:1:2",
      "collectionName": "Primitives",
      "scopes": [
        "ALL_FILLS"
      ],
      "valuesByMode": {
        "Default": "#7c3aed"
      }
    }
  ]
}
```

### `variables_ep.list_collections`

- Example payloads: 1

```json
[
  {
    "id": "VariableCollectionId:1:2",
    "name": "Primitives",
    "modes": [
      {
        "modeId": "1:0",
        "name": "Default"
      }
    ],
    "variableCount": 12
  }
]
```

### `variables_ep.set_binding`

- Example payloads: 1

```json
{
  "ok": true
}
```

### `variables_ep.update`

- Example payloads: 1

```json
{
  "ok": true,
  "id": "VariableID:1:30"
}
```

## Flat To Endpoint Migration Map

Mapped flat tools: 37

| Flat Tool | Replacement | Toolset | Write | Access |
| --- | --- | --- | --- | --- |
| `batch_create_variables` | `variables_ep(method: "batch_create")` | `variables` | `true` | `create` |
| `clone_node` | `nodes(method: "clone")` | `core` | `true` | `create` |
| `create_collection` | `variables_ep(method: "create_collection")` | `variables` | `true` | `create` |
| `create_ellipse` | `shapes(method: "create_ellipse")` | `core` | `true` | `create` |
| `create_frame` | `shapes(method: "create_frame")` | `core` | `true` | `create` |
| `create_instance` | `components(method: "create_instance")` | `core` | `true` | `create` |
| `create_paint_style` | `styles_ep(method: "create_paint")` | `styles` | `true` | `create` |
| `create_rectangle` | `shapes(method: "create_rectangle")` | `core` | `true` | `create` |
| `create_text` | `text(method: "create")` | `core` | `true` | `create` |
| `create_variable` | `variables_ep(method: "create")` | `variables` | `true` | `create` |
| `create_vector` | `shapes(method: "create_vector")` | `core` | `true` | `create` |
| `delete_collection` | `variables_ep(method: "delete_collection")` | `variables` | `true` | `edit` |
| `delete_nodes` | `nodes(method: "delete")` | `core` | `true` | `edit` |
| `delete_style` | `styles_ep(method: "delete")` | `styles` | `true` | `edit` |
| `delete_variable` | `variables_ep(method: "delete")` | `variables` | `true` | `edit` |
| `export_variables` | `variables_ep(method: "export")` | `variables` | `false` | `read` |
| `get_component` | `components(method: "get")` | `core` | `false` | `read` |
| `get_node_info` | `nodes(method: "get")` | `core` | `false` | `read` |
| `get_node_variables` | `variables_ep(method: "get_bindings")` | `variables` | `false` | `read` |
| `get_style` | `styles_ep(method: "get")` | `styles` | `false` | `read` |
| `get_variable` | `variables_ep(method: "get")` | `variables` | `false` | `read` |
| `insert_child` | `nodes(method: "insert_child")` | `core` | `true` | `edit` |
| `list_collections` | `variables_ep(method: "list_collections")` | `variables` | `false` | `read` |
| `list_component_properties` | `components(method: "list_properties")` | `core` | `false` | `read` |
| `list_components` | `components(method: "list")` | `core` | `false` | `read` |
| `list_library_components` | `components(method: "list_library")` | `core` | `false` | `read` |
| `list_styles` | `styles_ep(method: "list")` | `styles` | `false` | `read` |
| `list_variables` | `variables_ep(method: "list")` | `variables` | `false` | `read` |
| `patch_nodes` | `nodes(method: "update")` | `core` | `true` | `edit` |
| `search_nodes` | `nodes(method: "list")` | `core` | `false` | `read` |
| `set_text_content` | `text(method: "set_content")` | `core` | `true` | `edit` |
| `set_variable_binding` | `variables_ep(method: "set_binding")` | `variables` | `true` | `edit` |
| `sync_styles` | `styles_ep(method: "sync")` | `styles` | `true` | `create` |
| `update_effect_style` | `styles_ep(method: "update_effect")` | `styles` | `true` | `edit` |
| `update_paint_style` | `styles_ep(method: "update_paint")` | `styles` | `true` | `edit` |
| `update_text_style` | `styles_ep(method: "update_text")` | `styles` | `true` | `edit` |
| `update_variable` | `variables_ep(method: "update")` | `variables` | `true` | `edit` |
