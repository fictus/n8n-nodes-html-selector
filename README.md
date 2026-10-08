# n8n-nodes-html-selector

[![npm version](https://img.shields.io/npm/v/n8n-nodes-html-selector.svg)](https://www.npmjs.com/package/n8n-nodes-html-selector)
[![license](https://img.shields.io/npm/l/n8n-nodes-html-selector.svg)](LICENSE)

An [n8n](https://n8n.io) community node that parses an HTML string and extracts data with **CSS selectors**, the same way you would with jQuery (`$(html).find(...)`) or `querySelectorAll`, but without needing a DOM. It uses [Cheerio](https://cheerio.js.org) under the hood.

It exists because the n8n Code node runs in Node.js, where `document`, `DOMParser` and `Range` are not available, and jQuery-style code like this can't run there:

```js
$(html).find("span.lbl-txt").each(function () {
  console.log($(this).text());
});
```

With this node you get the same result without writing any code, including turning repeating blocks of HTML into clean, structured items.

## Features

- Extract **text**, **inner HTML**, **outer HTML**, or any **attribute** (`href`, `src`, `data-id`, ...)
- **Single Selector** mode: one value per matched element
- **Rows With Fields** mode: match repeating blocks and build objects with named keys from each one
- Output **one item per match** or **one item with an array**
- Options to trim whitespace, skip empty values, and rename the output key
- Works with expressions, so the HTML can come from an HTTP Request node, an email, a database, etc.
- Supports "Continue On Fail" and preserves item pairing (`pairedItem`)

## Installation

> This node depends on Cheerio, so it can't be verified by n8n and is intended for **self-hosted** n8n instances.

### Option 1: Community Nodes screen (recommended)

1. In n8n, go to **Settings > Community Nodes > Install**.
2. Enter `n8n-nodes-html-selector`.
3. Accept the unverified-package warning and click **Install**.

Unverified community packages must be allowed on your instance (`N8N_UNVERIFIED_PACKAGES_ENABLED=true`, which is the default today).

### Option 2: Manual install (custom folder)

Useful for Docker setups where the data folder is mounted from the host. Download this repository (or the npm tarball), build it, and place it in n8n's `custom` folder:

```bash
git clone https://github.com/fictus/n8n-nodes-html-selector.git
cd n8n-nodes-html-selector
npm install
npm run build

# copy into n8n's data folder (adjust the path)
mkdir -p ~/.n8n/custom/n8n-nodes-html-selector
cp -r dist package.json ~/.n8n/custom/n8n-nodes-html-selector/
cd ~/.n8n/custom/n8n-nodes-html-selector
npm install --omit=dev --omit=peer
```

Restart n8n afterwards. With Docker, the folder is `/home/node/.n8n/custom` inside the container, so mount your host data folder to `/home/node/.n8n`.

Search for **HTML Selector** in the node panel (it's in the *Transform* group).

## Usage

### Parameters

| Parameter | Mode | Description |
|---|---|---|
| **HTML** | both | The HTML string to parse, usually an expression such as `{{ $json.html }}` |
| **Mode** | both | `Single Selector` or `Rows With Fields` |
| **CSS Selector** | single | Selector for the elements to extract from |
| **Extract** | single | `Text`, `Inner HTML`, `Outer HTML` or `Attribute` |
| **Attribute Name** | single | Attribute to read when Extract is `Attribute` |
| **Row Selector** | rows | Selector for the repeating element. One item is produced per match |
| **Fields** | rows | List of values to pull out of each row (see below) |
| **Output** | both | `One Item per Match` or `Single Item With Array` |

**Fields** (Rows With Fields mode), one entry per value:

| Field setting | Description |
|---|---|
| **Output Key** | Name of the property in the output object |
| **Selector (Relative to Row)** | Searched *inside* the row; the first match is used. Leave empty to read the row element itself |
| **Extract** | `Text`, `Inner HTML`, `Outer HTML` or `Attribute` |
| **Attribute Name** | Attribute to read when Extract is `Attribute` |

**Options**

| Option | Default | Description |
|---|---|---|
| **Trim Whitespace** | on | Trim leading/trailing whitespace from values |
| **Skip Empty Values** | off | Single mode: drop empty values. Rows mode: drop rows where every field is empty |
| **Output Property Name** | `value` | Key for the value in single mode, or for the results array when Output is `Single Item With Array` |

### Example 1: extract a list of values (Single Selector)

Input HTML:

```html
<div>
  <span class="lbl-txt">1</span>
  <span class="lbl-txt">2</span>
  <span class="lbl-txt">3</span>
</div>
```

Settings: **Mode** = Single Selector, **CSS Selector** = `span.lbl-txt`, **Extract** = Text, **Output** = One Item per Match.

Result:

```json
[
  { "value": "1" },
  { "value": "2" },
  { "value": "3" }
]
```

With **Output** = Single Item With Array:

```json
[
  { "value": ["1", "2", "3"], "count": 3 }
]
```

### Example 2: turn repeating blocks into structured objects (Rows With Fields)

Input HTML:

```html
<div class="main-div">
  <div class="child-div">
    <span class="lbl-txt1">1</span>
    <span class="lbl-txt2">2</span>
    <span class="lbl-txt3">3</span>
  </div>
</div>
<div class="child-div">
  <span class="lbl-txt1">4</span>
  <span class="lbl-txt2">5</span>
  <span class="lbl-txt3">6</span>
</div>
```

Settings: **Mode** = Rows With Fields, **Row Selector** = `.child-div`, **Output** = One Item per Match, and these fields:

| Output Key | Selector | Extract |
|---|---|---|
| `text1` | `.lbl-txt1` | Text |
| `text2` | `.lbl-txt2` | Text |
| `text3` | `.lbl-txt3` | Text |

Result:

```json
[
  { "text1": "1", "text2": "2", "text3": "3" },
  { "text1": "4", "text2": "5", "text3": "6" }
]
```

The row selector matches both blocks even though the first is nested inside `.main-div`. Each field selector only searches inside its own row, so values never leak between rows.

### Example 3: extract links (attributes)

Input HTML: `<ul><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul>`

Rows With Fields, **Row Selector** = `li`, with fields:

| Output Key | Selector | Extract | Attribute Name |
|---|---|---|---|
| `title` | `a` | Text | |
| `url` | `a` | Attribute | `href` |

Result:

```json
[
  { "title": "Alpha", "url": "/a" },
  { "title": "Beta", "url": "/b" }
]
```

### Example 4: importable workflow node

Copy this JSON and paste it onto the n8n canvas (`Ctrl+V`) to get a pre-configured node for Example 2:

```json
{
  "nodes": [
    {
      "parameters": {
        "html": "<div class='main-div'><div class='child-div'><span class='lbl-txt1'>1</span><span class='lbl-txt2'>2</span><span class='lbl-txt3'>3</span></div></div><div class='child-div'><span class='lbl-txt1'>4</span><span class='lbl-txt2'>5</span><span class='lbl-txt3'>6</span></div>",
        "mode": "rows",
        "rowSelector": ".child-div",
        "fields": {
          "field": [
            { "name": "text1", "selector": ".lbl-txt1", "extract": "text" },
            { "name": "text2", "selector": ".lbl-txt2", "extract": "text" },
            { "name": "text3", "selector": ".lbl-txt3", "extract": "text" }
          ]
        },
        "output": "items"
      },
      "name": "HTML Selector",
      "type": "n8n-nodes-html-selector.htmlSelector",
      "typeVersion": 1,
      "position": [0, 0]
    }
  ],
  "connections": {}
}
```

### Typical workflow

`HTTP Request` (returns a page in `{{ $json.data }}`) → `HTML Selector` (HTML = `{{ $json.data }}`) → any node that consumes the extracted items.

## Behavior notes

- **Selectors:** anything Cheerio supports, including class, id, attribute selectors, combinators (`>`, `+`, `~`), `:nth-child()`, `:first-child`, `:not()`, `:has()`, and `:contains()`.
- **Missing elements:** in Rows mode, a field whose element isn't found is `null`. In Single mode, elements missing the requested attribute are skipped.
- **Field matches:** each field takes the **first** match inside its row.
- **Fragment parsing:** HTML is parsed as a fragment, so no `<html>`/`<body>` wrapper is added.
- **No JavaScript execution:** the node only parses markup. Content that is rendered client-side by JavaScript won't be present in the HTML.
- **Errors:** invalid selectors, a missing attribute name, or missing field definitions produce a clear error. Enable *Continue On Fail* to get an `error` item instead of stopping the workflow.

## Compatibility

Developed and tested on self-hosted n8n 2.x (Docker). It uses the standard `n8nNodesApiVersion: 1` node interface.

## Development

```bash
git clone https://github.com/fictus/n8n-nodes-html-selector.git
cd n8n-nodes-html-selector
npm install
npm run build     # compiles TypeScript to ./dist and copies the icon
npm run dev       # watch mode
```

Project layout:

```
nodes/HtmlSelector/HtmlSelector.node.ts   # node implementation
nodes/HtmlSelector/htmlSelector.svg       # icon
dist/                                     # build output (published to npm)
```

## Contributing

Issues and pull requests are welcome. Please include a sample HTML input and the expected output when reporting a bug.

## License

[MIT](LICENSE)
