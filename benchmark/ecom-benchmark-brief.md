# Claude Code Brief: Ecom Competitive Benchmarking Tool

## Objective
Build a CLI tool that crawls ecommerce competitor sites, captures full-page screenshots at desktop and mobile viewports, extracts strategic metadata, and generates a self-contained HTML report with toggleable Gallery and Strategy views.

---

## How It Works

1. User passes one or more URLs as arguments
2. Claude Code connects to Chrome via `--chrome` flag
3. For each URL, Claude navigates like a real user to find and capture: Homepage, PLP, PDP, and Checkout
4. Screenshots + metadata are saved locally and appended to a shared `benchmark.json`
5. A self-contained `report.html` is generated (or updated) from the JSON

---

## Inputs

```bash
node benchmark.js https://competitor-a.com https://competitor-b.com --category competition
node benchmark.js https://brand-a.com --category inspiration
```

- Accepts one or more URLs per run
- `--category` flag accepts any string; defaults to `"uncategorized"` if omitted
- Predefined values: `competition`, `inspiration` — but the field is free-text to allow future expansion (e.g. `"direct"`, `"adjacent"`, `"aspirational"`)
- Category is set at the run level, applied to all URLs passed in that command
- To assign different categories to different URLs, run the script separately per group
- Each run appends to existing data — does not overwrite previous competitors
- Re-running a URL that already exists prompts: overwrite or skip. If overwriting, category can be updated

---

## Page Navigation Logic

Do NOT hardcode URL paths like `/plp` or `/checkout`. Navigate like a user:

1. **Homepage** — land on root URL
2. **PLP** — find and click a top-level category nav link
3. **PDP** — find and click a product from the PLP
4. **Checkout** — add product to cart, proceed to checkout (stop before payment entry)

If a page cannot be reached, log it as `"status": "unreachable"` in the JSON and continue.

---

## Screenshots

For each page, capture two screenshots:

| Viewport | Width | Label |
|---|---|---|
| Desktop | 1440px | `desktop` |
| Mobile | 390px | `mobile` |

Screenshots must be **full-page** (scroll height), not just the visible viewport.

**File naming:**
```
/benchmark/competitors/{domain}/{YYYY-MM-DD}/{page}-{device}.png
```

Example:
```
/benchmark/competitors/nike.com/2026-02-24/homepage-desktop.png
/benchmark/competitors/nike.com/2026-02-24/pdp-mobile.png
```

---

## Metadata Extraction

During each page visit, extract and log:

```json
{
  "page": "homepage",
  "url_visited": "https://competitor.com",
  "captured_at": "2026-02-24T10:00:00Z",
  "hero_headline": "string",
  "hero_cta": "string",
  "active_promotions": ["string"],
  "navigation_structure": ["string"],
  "trust_signals": ["string"],
  "page_load_seconds": 2.4,
  "status": "captured | unreachable"
}
```

Additional fields for specific pages:

- **PDP**: `product_name`, `price_display`, `review_score`, `usp_callouts`
- **Checkout**: `steps_count`, `guest_checkout_available`, `payment_methods_visible`, `friction_notes`

---

## Data Structure

All data lives in `/benchmark/benchmark.json`:

```json
{
  "last_updated": "2026-02-24T10:00:00Z",
  "competitors": [
    {
      "domain": "nike.com",
      "category": "competition",
      "runs": [
        {
          "date": "2026-02-24",
          "pages": [
            {
              "page": "homepage",
              "url_visited": "...",
              "captured_at": "...",
              "hero_headline": "...",
              "hero_cta": "...",
              "active_promotions": [],
              "navigation_structure": [],
              "trust_signals": [],
              "page_load_seconds": 2.1,
              "status": "captured",
              "screenshots": {
                "desktop": "competitors/nike.com/2026-02-24/homepage-desktop.png",
                "mobile": "competitors/nike.com/2026-02-24/homepage-mobile.png"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

New competitors are appended. New runs for existing competitors are appended under `runs[]`. Always preserve historical data.

---

## Output: report.html

A single self-contained HTML file at `/benchmark/report.html`. No external dependencies — all CSS and JS inline.

### Toggle Behaviour
A persistent header bar with two toggle buttons: **Gallery View** and **Strategy View**. One active at a time. State does not persist between sessions.

---

### Gallery View

Designed for visual/design audience.

- Columns = competitors (most recently added on the left)
- Rows = page types (Homepage, PLP, PDP, Checkout)
- Each cell = desktop screenshot on top, mobile below
- Clicking a screenshot opens it full-size in a lightbox
- A date selector (dropdown) allows switching between historical run dates per competitor
- Missing/unreachable pages show a placeholder with the logged reason

---

### Strategy View

Designed for strategic audience.

- One card per competitor
- Card sections: Value Prop & Messaging, Navigation, Promotions, PDP Signals, Checkout Experience
- Data pulled directly from the extracted metadata fields
- If a field is empty or page was unreachable, display "—"
- Cards are sortable by competitor name or date added

---

### Shared UI Requirements

- Clean, minimal design — white background, dark text, subtle borders
- Responsive layout (usable on laptop and large monitor)
- **Category filter:** pill toggle — `All`, `Competition`, `Inspiration`, plus any custom values present in the JSON. Applies globally across both views simultaneously
- Each competitor card/column is visually tagged with its category (subtle badge, consistent color per category)
- Competitor filter: multi-select checkboxes to show/hide individual competitors
- Page filter: toggle which page types are visible (Homepage, PLP, PDP, Checkout)
- All three filters (category, competitor, page) work in combination
- Export button: downloads current view as a timestamped ZIP (screenshots + JSON), respecting active filters

---

## File Structure

```
/benchmark
  /competitors
    /nike.com
      /2026-02-24
        homepage-desktop.png
        homepage-mobile.png
        plp-desktop.png
        plp-mobile.png
        pdp-desktop.png
        pdp-mobile.png
        checkout-desktop.png
        checkout-mobile.png
  benchmark.json
  report.html
  benchmark.js
```

---

## Error Handling

- If Chrome connection fails: exit with clear message — "Run `claude --chrome` first"
- If a page navigation fails: log as unreachable, continue to next page
- If a screenshot fails: retry once, then log as failed
- All errors written to `/benchmark/benchmark.log` with timestamps

---

## Constraints

- Use Claude Code + Claude in Chrome only — no Playwright, Puppeteer, or headless browser libraries
- No external npm dependencies beyond Node.js built-ins
- The HTML report must work offline (all assets relative paths or inline)
- Do not capture or store any personal data, login credentials, or payment information
- Stop at checkout page — do not proceed past payment method selection

---

## Acceptance Criteria

- [ ] Running the script against 2+ URLs produces screenshots for all 4 page types at both viewports
- [ ] `--category` flag correctly tags competitors in `benchmark.json`
- [ ] Category filter in the report correctly shows/hides competitors across both Gallery and Strategy views
- [ ] `benchmark.json` is correctly structured and appendable across multiple runs
- [ ] `report.html` opens in Chrome without errors and both views render correctly
- [ ] Adding a new competitor via CLI updates the report without breaking existing data
- [ ] Unreachable pages are handled gracefully with no script crash
