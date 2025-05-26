let snackbarShown = false;
let products = {};

document.getElementById('csvFile').addEventListener('change', function () {
  const convertBtn = document.getElementById('convertBtn');
  const errorBox = document.getElementById('errorBox');
  const downloadSection = document.getElementById('downloadSection');
  const snackbar = document.getElementById('snackbar');
  const templateLink = document.querySelector('.template-link');

  convertBtn.disabled = !this.files.length;
  convertBtn.classList.remove('hide-on-success');
  templateLink?.classList.remove('hide-on-success');
  const previewLink = document.getElementById('previewLink');
  if (previewLink) {
    previewLink.classList.add('hidden');
    previewLink.style.display = 'none';
  }
  errorBox.classList.add('hidden');
  downloadSection.classList.remove('show');
  // Only remove the snackbar if it is showing for previous file
  if (snackbarShown) {
    snackbar.classList.remove('show', 'error');
    snackbarShown = false;
  }
});

document.getElementById('convertBtn').addEventListener('click', function () {
  const fileInput = document.getElementById('csvFile');
  const errorBox = document.getElementById('errorBox');
  const downloadSection = document.getElementById('downloadSection');
  const snackbar = document.getElementById('snackbar');
  errorBox.classList.add('hidden');
  downloadSection.classList.add('hidden');
  snackbar.classList.remove('show');

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.split('\n').filter(Boolean);
    // Remove BOM if present
    lines[0] = lines[0].replace(/^\ufeff/, '');
    // Fix header typo: Produt-ID -> Product-ID
    let headers = lines[0].split(';').map(h => h.trim());
    if (headers[0].toLowerCase() === 'produt-id') {
      headers[0] = 'Product-ID';
      lines[0] = headers.join(';');
    }
    // Re-split headers for further logic
    headers = lines[0].split(';').map(h => h.trim());

    const errors = [];
    let duplicateProductIds = null;
    // Map for gender normalization
    const typeInputMap = {
      man: 'replacement',
      woman: 'cross-sell',
      unisex: 'accessory'
    };
    // Track unique product-ids per normalized gender
    const genderCounts = { man: new Set(), woman: new Set(), unisex: new Set() };
    // For duplicate detection (on normalized Product-ID + normalized gender)
    const seenProductGender = new Set();
    // For XML type mapping
    const genderToType = { man: 'replacement', woman: 'cross-sell', unisex: 'accessory' };
    const typeOrder = { 'replacement': 1, 'cross-sell': 2, 'accessory': 3 };
    products = {};

    // Identify columns: first = product-id, second = gender, rest = styled-with
    const styledWithStart = 2;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      // If all columns are empty, skip
      if (!cols.some(x => x && x.trim())) continue;
      // Identify first two columns
      let productIdRaw = cols[0] !== undefined ? cols[0].trim() : '';
      let genderRaw = cols[1] !== undefined ? cols[1].trim() : '';
      let productId = productIdRaw.toUpperCase();
      let genderNorm = genderRaw.toLowerCase();
      // Map to canonical gender for tallying
      let genderCanonical = (genderNorm === 'man' || genderNorm === 'woman' || genderNorm === 'unisex') ? genderNorm : null;
      // For XML, type is genderToType[genderCanonical]
      // Validate productId
      if (!productId || !/^[A-Z0-9]{6}-[A-Z0-9]{3}$/.test(productId) || productId.includes('_')) {
        if (productIdRaw || genderRaw) errors.push(`Invalid Product ID: ${productIdRaw || '(empty)'} in row ${i + 1}`);
        continue;
      }
      // Validate gender
      if (!genderCanonical) {
        errors.push(`Invalid or missing gender for ${productId} in row ${i + 1}`);
        continue;
      }
      // Duplicate check (productId+gender)
      const dupKey = `${productId}|${genderCanonical}`;
      if (seenProductGender.has(dupKey)) {
        duplicateProductIds = duplicateProductIds || [];
        duplicateProductIds.push(`${productId} (${genderRaw})`);
        continue;
      }
      seenProductGender.add(dupKey);

      // Styled-with: all remaining columns, normalized, valid pids only
      const styledWith = [];
      for (let j = styledWithStart; j < cols.length; j++) {
        let swRaw = cols[j] !== undefined ? cols[j].trim() : '';
        let sw = swRaw.toUpperCase();
        // Only accept valid product-ids (same format as above)
        if (sw && /^[A-Z0-9]{6}-[A-Z0-9]{3}$/.test(sw) && !sw.includes('_')) {
          styledWith.push(sw);
        }
      }
      if (styledWith.length === 0) {
        errors.push(`No valid styled-with links for ${productId} in row ${i + 1}`);
        continue;
      }
      // Accumulate
      if (!products[productId]) products[productId] = [];
      styledWith.forEach(sw => {
        // Store original gender string for preview, and canonical for tally/type
        products[productId].push({ sw, genderOriginal: genderRaw.trim(), genderCanonical });
      });
      genderCounts[genderCanonical].add(productId);
    }

    if (duplicateProductIds?.length) {
      errors.push(`Duplicated product-IDs: ${duplicateProductIds.join(', ')}`);
    }
    if (errors.length) {
      const snackbar = document.getElementById('snackbar');
      const snackbarMessage = document.getElementById('snackbarMessage');
      if (snackbar && snackbarMessage) {
        snackbarMessage.textContent = `Errors:\n• ${errors.slice(0, 5).join('\n• ')}`;
        snackbar.classList.add('show', 'error');
        snackbarShown = true;
      }
      return;
    }

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<catalog xmlns="http://www.demandware.com/xml/impex/catalog/2006-10-31" catalog-id="acne-product-catalog">\n';
    for (const pid in products) {
      xml += `  <product product-id="${pid}">\n    <product-links>\n`;
      const links = products[pid];
      // Sort by XML type order
      links.sort((a, b) => (typeOrder[genderToType[a.genderCanonical]] || 99) - (typeOrder[genderToType[b.genderCanonical]] || 99));
      for (const link of links) {
        xml += `      <product-link product-id="${link.sw}" type="${genderToType[link.genderCanonical]}"/>\n`;
      }
      xml += '    </product-links>\n  </product>\n';
    }
    xml += '</catalog>';

    document.getElementById('convertBtn')?.classList.add('hide-on-success');
    document.querySelector('.template-link')?.classList.add('hide-on-success');

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.getElementById('downloadXml');
    downloadLink.href = url;
    downloadSection.classList.add('show');

    const total = Object.keys(products).length;
    const men = genderCounts['man'].size;
    const women = genderCounts['woman'].size;
    const unisex = genderCounts['unisex'].size;
    // Ensure snackbar and snackbarMessage are defined before using
    const snackbar = document.getElementById('snackbar');
    const snackbarMessage = document.getElementById('snackbarMessage');
    if (snackbar && snackbarMessage && !snackbarShown) {
      snackbar.classList.remove('error');
      snackbarMessage.textContent = `Success. ${total} product-ids, with ${men} men, ${women} women, ${unisex} unisex.`;
      snackbar.classList.add('show');
      snackbarShown = true;
      setTimeout(() => {
        snackbar.classList.remove('show');
        snackbarShown = false;
      }, 6000);
    }
  };
  reader.readAsText(file);
});

document.getElementById("previewLink").addEventListener("click", () => {
  const previewContainer = document.getElementById("previewContainer");
  previewContainer.innerHTML = "";
  previewContainer.style.display = "block";

  // For each productId row
  Object.entries(products).forEach(([productId, links]) => {
    const row = document.createElement("div");
    row.className = "preview-row";

    const pidCol = document.createElement("div");
    pidCol.className = "preview-cell";

    const pidImg = document.createElement("img");
    const basePidUrl = `https://www.acnestudios.com/dw/image/v2/AAXV_PRD/on/demandware.static/-/Sites-acne-product-catalog/default/dwedd7b2e7/images/${productId.slice(0, 2)}/${productId.split('-')[0]}-/2000x/${productId}`;
    pidImg.src = `${basePidUrl}_FLAT.jpg?sw=200&sh=300`;
    pidImg.onerror = () => {
      pidImg.onerror = null;
      pidImg.src = `${basePidUrl}_A.jpg?sw=200&sh=300`;
    };
    pidImg.alt = productId;
    pidImg.className = "preview-image preview-product";
    pidCol.appendChild(pidImg);

    const pidLabel = document.createElement("div");
    pidLabel.textContent = productId;
    pidLabel.className = "preview-label";
    pidCol.appendChild(pidLabel);

    row.appendChild(pidCol);

    // Sort styled-with left-to-right (by sw ascending)
    const sortedLinks = [...links].sort((a, b) => {
      // Sort by sw string, then by canonical gender (for stable order)
      if (a.sw < b.sw) return -1;
      if (a.sw > b.sw) return 1;
      if (a.genderCanonical < b.genderCanonical) return -1;
      if (a.genderCanonical > b.genderCanonical) return 1;
      return 0;
    });

    sortedLinks.forEach(link => {
      const cell = document.createElement("div");
      cell.className = "preview-cell";

      const img = document.createElement("img");
      const sw = link.sw;
      const baseSwUrl = `https://www.acnestudios.com/dw/image/v2/AAXV_PRD/on/demandware.static/-/Sites-acne-product-catalog/default/dwedd7b2e7/images/${sw.slice(0, 2)}/${sw.split('-')[0]}-/2000x/${sw}`;
      img.src = `${baseSwUrl}_FLAT.jpg?sw=200&sh=300`;
      img.onerror = () => {
        img.onerror = null;
        img.src = `${baseSwUrl}_A.jpg?sw=200&sh=300`;
      };
      img.alt = sw;
      img.className = "preview-image";
      cell.appendChild(img);

      const label = document.createElement("div");
      label.textContent = sw;
      label.className = "preview-label";
      cell.appendChild(label);

      // Show original gender (input), only once per styled-with entry
      const genderDiv = document.createElement("div");
      genderDiv.textContent = (link.genderOriginal || '').trim();
      genderDiv.className = "preview-gender";
      cell.appendChild(genderDiv);

      row.appendChild(cell);
    });

    previewContainer.appendChild(row);
  });
  previewContainer.scrollIntoView({ behavior: "smooth" });
});
// Snackbar close button logic
document.getElementById('snackbarClose').addEventListener('click', () => {
  const snackbar = document.getElementById('snackbar');
  snackbar.classList.remove('show', 'error');
  snackbarShown = false;
});