const grid = document.getElementById("grid");

function normalizeGender(gender) {
  return gender && gender.trim() !== "" ? gender : "Unisex";
}

function getSelectedValuesFromChips(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .chip.active`)).map(chip => chip.dataset.value);
}

function renderChips(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  items.forEach(item => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = item;
    chip.dataset.value = item;
    chip.dataset.filterType = containerId;

    chip.addEventListener("click", () => {
      if (!chip.classList.contains("inactive")) {
        chip.classList.toggle("active");
        renderGrid(containerId);
      }
    });

    container.appendChild(chip);
  });
}

function populateFilters() {
  const allGenders = [...new Set(products.map(p => normalizeGender(p.Gender)))];
  const genderOrder = ["Women", "Men", "Unisex"];
  const genders = genderOrder.filter(g => allGenders.includes(g));

  const categories = [...new Set(products.map(p => p.Category))].sort((a, b) =>
    a.localeCompare(b)
  );

  renderChips("genderFilter", genders);
  renderChips("categoryFilter", categories);
}

function expandGenders(selectedGenders) {
  if (selectedGenders.length === 0) return [];

  const includesMen = selectedGenders.includes("Men");
  const includesWomen = selectedGenders.includes("Women");
  const includesUnisex = selectedGenders.includes("Unisex");

  const result = [...selectedGenders];
  if ((includesMen || includesWomen) && !includesUnisex) {
    result.push("Unisex");
  }

  return [...new Set(result)];
}

function renderGrid(lastInteractedGroup = null) {
  const selectedGenders = getSelectedValuesFromChips("genderFilter");
  const selectedCategories = getSelectedValuesFromChips("categoryFilter");

  const expandedGenders = expandGenders(selectedGenders);

  let filtered = products.filter(p => {
    const gender = normalizeGender(p.Gender);
    const genderMatch = expandedGenders.length === 0 || expandedGenders.includes(gender);
    const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(p.Category);
    return genderMatch && categoryMatch;
  });

  // Sort filtered products by category alphabetically
  filtered.sort((a, b) => a.Category.localeCompare(b.Category));

  const itemCount = document.getElementById("itemCount");
  itemCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;

  grid.innerHTML = "";
  filtered.forEach(product => {
    const div = document.createElement("div");
    div.className = "grid-item";

    const cleanUrl = product.image_link.replace(/^"|"$/g, "");

    const link = document.createElement("a");
    link.href = `https://www.acnestudios.com/${product["Article number"]}.html`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    const spinner = document.createElement("div");
    spinner.className = "spinner";
    wrapper.appendChild(spinner);

    const img = document.createElement("img");
    img.src = cleanUrl;
    img.alt = product["Article name"];
    img.loading = "lazy";

    img.onload = () => spinner.remove();
    img.onerror = () => {
      wrapper.classList.add("error");
      spinner.remove();
    };

    wrapper.appendChild(img);
    link.appendChild(wrapper);
    div.appendChild(link);

    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = product["Article name"];

    name.addEventListener("click", () => {
      navigator.clipboard.writeText(product["Article name"]).then(() => {
        const existing = name.querySelector(".copied-label");
        if (existing) existing.remove();

        const copiedSpan = document.createElement("span");
        copiedSpan.textContent = " Copied";
        copiedSpan.className = "copied-label";
        name.appendChild(copiedSpan);

        setTimeout(() => {
          copiedSpan.remove();
        }, 2000);
      });
    });

    div.appendChild(name);

    const gender = document.createElement("div");
    gender.className = "brand";
    gender.textContent = normalizeGender(product.Gender);
    div.appendChild(gender);

    grid.appendChild(div);
  });

  updateInactiveChips(lastInteractedGroup);
}

function updateInactiveChips(lastGroup = null) {
  const selectedGenders = getSelectedValuesFromChips("genderFilter");
  const selectedCategories = getSelectedValuesFromChips("categoryFilter");
  const expandedGenders = expandGenders(selectedGenders);

  const shouldDisableGender = lastGroup !== "genderFilter" && selectedCategories.length > 0;
  const shouldDisableCategory = lastGroup !== "categoryFilter" && selectedGenders.length > 0;

  if (lastGroup !== "genderFilter") {
    document.querySelectorAll('#genderFilter .chip').forEach(chip => {
      const testValue = chip.dataset.value;
      if (!shouldDisableGender) {
        chip.classList.remove('inactive');
        return;
      }
      const testExpanded = expandGenders([testValue]);
      const wouldMatch = products.some(p =>
        testExpanded.includes(normalizeGender(p.Gender)) &&
        selectedCategories.includes(p.Category)
      );
      chip.classList.toggle('inactive', !wouldMatch);
    });
  }

  if (lastGroup !== "categoryFilter") {
    document.querySelectorAll('#categoryFilter .chip').forEach(chip => {
      const testValue = chip.dataset.value;
      if (!shouldDisableCategory) {
        chip.classList.remove('inactive');
        return;
      }
      const wouldMatch = products.some(p =>
        expandedGenders.includes(normalizeGender(p.Gender)) &&
        p.Category === testValue
      );
      chip.classList.toggle('inactive', !wouldMatch);
    });
  }
}

// Initialize
populateFilters();
renderGrid();

document.getElementById("backToFilters").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const gridHeader = document.querySelector(".grid-header");
const sentinel = document.getElementById("sentinel");

const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting) {
      gridHeader.classList.remove("sticky");
    } else {
      gridHeader.classList.add("sticky");
    }
  },
  {
    root: null,
    threshold: 0,
  }
);

observer.observe(sentinel);