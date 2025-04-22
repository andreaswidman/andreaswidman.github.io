const grid = document.getElementById("grid");
const brandFilter = document.getElementById("brandFilter");
const categoryFilter = document.getElementById("categoryFilter");

let products = [];

fetch('products.json')
  .then(response => response.json())
  .then(data => {
    products = data;
    populateFilters();
    renderGrid();
  });

function populateFilters() {
  const brands = [...new Set(products.map(p => p.Brand))];
  const categories = [...new Set(products.map(p => p.Category))];

  brands.forEach(b => {
    const option = document.createElement("option");
    option.value = b;
    option.textContent = b;
    brandFilter.appendChild(option);
  });

  categories.forEach(c => {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    categoryFilter.appendChild(option);
  });
}

function getSelectedValues(select) {
  return Array.from(select.selectedOptions).map(o => o.value);
}

function renderGrid() {
  const selectedBrands = getSelectedValues(brandFilter);
  const selectedCategories = getSelectedValues(categoryFilter);

  const filtered = products.filter(p => {
    const brandMatch = selectedBrands.length === 0 || selectedBrands.includes(p.Brand);
    const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(p.Category);
    return brandMatch && categoryMatch;
  });

  grid.innerHTML = "";
  filtered.forEach(product => {
    const div = document.createElement("div");
    div.className = "grid-item";
    div.innerHTML = `
      <img src="${product.image_link}" alt="${product['Article name']}">
      <div>${product['Internal name']}</div>
    `;
    grid.appendChild(div);
  });
}

brandFilter.addEventListener("change", renderGrid);
categoryFilter.addEventListener("change", renderGrid);