let snackbarShown = false;

document.getElementById('csvFile').addEventListener('change', function () {
  const convertBtn = document.getElementById('convertBtn');
  const errorBox = document.getElementById('errorBox');
  const downloadSection = document.getElementById('downloadSection');
  const snackbar = document.getElementById('snackbar');
  const templateLink = document.querySelector('.template-link');

  convertBtn.disabled = !this.files.length;
  convertBtn.classList.remove('hide-on-success');
  templateLink?.classList.remove('hide-on-success');
  errorBox.classList.add('hidden');
  downloadSection.classList.remove('show');
  snackbar.classList.remove('show');
  snackbarShown = false;
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
    lines[0] = lines[0].replace(/^\ufeff/, '');
    const headers = lines[0].split(';');
    const errors = [];
    const typeMap = { 'replacement': "men's", 'cross-sell': "women's", 'accessory': "other" };
    const typeOrder = { 'replacement': 1, 'cross-sell': 2, 'accessory': 3 };
    const linkTypeCounts = {};
    const products = {};

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';');
      const productId = cols[0]?.trim().toUpperCase();
      const styledWith = cols[1]?.trim().toUpperCase();
      let linkType = cols[2]?.trim().toLowerCase(); // "gender" column
      const typeInputMap = {
        man: 'replacement',
        woman: 'cross-sell',
        unisex: 'accessory'
      };
      linkType = typeInputMap[linkType] || linkType;

      if (!/^\w{6}-\w{3}$/.test(productId) || productId.includes('_')) {
        errors.push(`Invalid Product ID: ${productId}`);
        continue;
      }
      if (!styledWith || !linkType || !/^\w{6}-\w{3}$/.test(styledWith) || styledWith.includes('_')) {
        errors.push(`Invalid or missing styled with or type in row ${i + 1}`);
        continue;
      }
      if (!products[productId]) {
        products[productId] = [];
      }
      products[productId].push([styledWith, linkType]);
      const label = typeMap[linkType] || linkType;
      linkTypeCounts[label] = (linkTypeCounts[label] || 0) + 1;
    }

    if (errors.length) {
      snackbar.textContent = `Errors:\n• ${errors.slice(0, 5).join('\n• ')}`;
      snackbar.classList.add('show', 'error');
      snackbarShown = true;
      setTimeout(() => {
        snackbar.classList.remove('show');
      }, 6000);
      return;
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<catalog xmlns="http://www.demandware.com/xml/impex/catalog/2006-10-31" catalog-id="acne-product-catalog">\n';
    for (const pid in products) {
      xml += `  <product product-id="${pid}">\n    <product-links>\n`;
      const links = products[pid];
      links.sort((a, b) => (typeOrder[a[1]] || 99) - (typeOrder[b[1]] || 99));
      for (const [linkId, type] of links) {
        xml += `      <product-link product-id="${linkId}" type="${type}"/>\n`;
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
    // Success message now uses user-facing labels directly from linkTypeCounts
    const types = Object.entries(linkTypeCounts).map(([label, count]) => `${count} ${label}`).join(', ');
    if (!snackbarShown) {
      snackbar.classList.remove('error');
      snackbar.textContent = `Success. ${total} product${total !== 1 ? 's' : ''}, styled with ${types}.`;
      snackbar.classList.add('show');
      snackbarShown = true;
      setTimeout(() => {
        snackbar.classList.remove('show');
      }, 6000); // matches total animation time: fadein 0.3s, fadeout 0.5s after 6s delay
    }
  };
  reader.readAsText(file);
});