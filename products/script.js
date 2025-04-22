const grid = document.getElementById("grid");
const imageCache = new Map();

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
      if (chip.classList.contains("inactive")) return;
    
      const groupChips = document.querySelectorAll(`#${containerId} .chip`);
    
      const isActive = chip.classList.contains("active");
      groupChips.forEach(c => c.classList.remove("active"));
    
      if (!isActive) {
        chip.classList.add("active");
      }
    
      renderGrid(containerId);
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

function preloadAllImages(imagePrefix, suffixes) {
  suffixes.forEach((suffix) => {
    const preloadSrc = `${imagePrefix}${suffix}.jpg?sw=560,sh=840`;
    if (!imageCache.has(preloadSrc)) {
      console.log("Preloading image:", preloadSrc);
      const preloadImg = new Image();
      preloadImg.src = preloadSrc;
      preloadImg.onload = () => imageCache.set(preloadSrc, true);
      preloadImg.onerror = () => imageCache.set(preloadSrc, false);
    }
  });
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

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    const spinner = document.createElement("div");
    spinner.className = "spinner";
    wrapper.appendChild(spinner);

    const img = document.createElement("img");
    img.src = cleanUrl;
    img.alt = product["Article name"];
    img.loading = "lazy";

    img.onload = () => {
      if (!wrapper.dataset.preloading) spinner.remove();
    };
    img.onerror = () => {
      wrapper.classList.add("error");
      spinner.remove();
    };

    wrapper.appendChild(img);
    div.appendChild(wrapper);

    // Image cycling on click
    const imageSuffixes = ["_FLAT", "_A", "_B", "_C", "_D", "_E"];
    let currentIndex = 0;
    const articleBase = product["Article number"];
    const basePath = product.image_link.split(articleBase)[0];
    const baseFile = articleBase.split("-")[0];
    const imagePrefix = `${basePath}/${articleBase}`;

    // New tryNext implementation: cycles forward to next available image, wrapping, never reverting to original unless part of cycle.
    const tryNext = (startIndex) => {
      const tryFrom = startIndex;
      const tryImage = (index) => {
        if (index >= imageSuffixes.length) {
          // Wrap around and continue from beginning, but not the one just shown
          const wrapIndex = 0;
          if (wrapIndex === tryFrom) {
            // No valid alternative image found, stay on current image
            spinner.style.display = "none";
            img.style.display = "block";
            wrapper.dataset.preloading = "";
            return;
          }
          tryImage(wrapIndex);
          return;
        }

        const testSrc = `${imagePrefix}${imageSuffixes[index]}.jpg?sw=560,sh=840`;
        console.log("Trying image:", testSrc);

        // Show spinner immediately, before cache check
        wrapper.dataset.preloading = "true";
        spinner.style.display = "block";
        img.style.display = "none";

        const finalizeImage = () => {
          img.src = testSrc;
          currentIndex = index;
          spinner.style.display = "none";
          img.style.display = "block";
          wrapper.dataset.preloading = "";

          if (!wrapper.dataset.preloaded) {
            wrapper.dataset.preloaded = "true";
            setTimeout(() => {
              preloadAllImages(imagePrefix, imageSuffixes);
            }, 100);
          }
        };

        if (imageCache.has(testSrc)) {
          if (imageCache.get(testSrc)) {
            finalizeImage();
          } else {
            tryImage(index + 1);
          }
          return;
        }

        const testImg = new Image();
        testImg.src = testSrc;
        testImg.onload = () => {
          imageCache.set(testSrc, true);
          finalizeImage();
        };
        testImg.onerror = () => {
          imageCache.set(testSrc, false);
          tryImage(index + 1);
        };
      };
      tryImage(startIndex);
    };

    function handleImageAdvance() {
      currentIndex = (currentIndex + 1) % imageSuffixes.length;
      tryNext(currentIndex);
    }

    wrapper.addEventListener("click", handleImageAdvance);

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