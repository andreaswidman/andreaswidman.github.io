

# Styled With File Converter

This tool allows you to convert a specially formatted CSV file into a Commerce Cloud-compatible XML structure.

## Getting Started

1. Open `index.html` in your browser.
2. Upload your CSV file using the file input.
3. Press "Convert to XML".
4. If the file is valid, a download link will appear.
5. Optionally preview the file before downloading.
6. Follow the upload instructions to import the XML into Commerce Cloud.

## CSV Format

The CSV must follow this structure:

- First column: `Product-ID`
- Second column: `Gender` (values: `man`, `woman`, `unisex`)
- Next columns (up to 10): `Styled with` (linked product IDs)

Example:

```
Product-ID;Gender;Styled with;Styled with;...
A20870-AAQ;Man;A10487-BUT;C80236-ADN
```

- All values are case-insensitive and trimmed.
- The script skips invalid or incomplete rows.
- IDs with underscores (e.g., `C80236_ADN`) will cause an error.

## Output

- One `<product>` node per unique `Product-ID`.
- Each link becomes a `<link>` node with `link-type` based on the gender:
  - `man` → `replacement`
  - `woman` → `cross-sell`
  - `unisex` → `accessory`
- Links are sorted in this order: `replacement`, `cross-sell`, `accessory`.

## Errors

- The tool will stop processing and show a red snackbar for:
  - Missing `Product-ID` or `Gender`
  - Invalid characters (e.g., `_`)
  - Duplicate product/gender pairs

## Uploading to SFCC

1. Go to **Merchant Tools > Products and Catalogs > Import & Export**
2. Upload the generated XML file
3. Run the import in **MERGE** mode

## Project Structure

- `index.html`: UI and layout
- `styles.css`: Styling
- `script.js`: CSV parsing, XML generation, error handling
- `template.csv`: Example input
- `readme.txt`: This file

## Notes

- Resetting clears the state for a new upload.
- A preview UI helps visualize how the XML will be structured.
- All links and messages are styled following a minimalist Apple-inspired theme.