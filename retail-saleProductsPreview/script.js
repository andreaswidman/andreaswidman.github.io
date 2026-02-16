// Configuration constants
const CONFIG = {
  PASSWORD: "pansy",
  COOKIE_MAXAGE: 86400,              // 1 day
  WISHLIST_MAXAGE: 31536000,         // 1 year
  FILTER_VALUES: {
    ALL: "All",
    SAVED: "Saved",
    UNISEX: "Unisex"
  }
};

// SVG icon constants
const BOOKMARK_ICONS = {
  filled: '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="black"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>',
  outline: '<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>'
};

// Helper function to get bookmark SVG based on saved state
function getBookmarkSvg(isSaved) {
  return isSaved ? BOOKMARK_ICONS.filled : BOOKMARK_ICONS.outline;
}

// Helper function to initialize wishlist filter
function initializeWishlistFilter() {
  const wishlistGroup = document.getElementById("wishlistFilterGroup");
  if (!wishlistGroup?.dataset.initialized) {
    renderChips("wishlistFilter", [CONFIG.FILTER_VALUES.ALL, CONFIG.FILTER_VALUES.SAVED]);
    if (wishlistGroup) wishlistGroup.dataset.initialized = "true";
  }
}

// Helper function to update chip inactive states
function updateChipInactiveState(containerId, enabledValues) {
  document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
    chip.classList.toggle('inactive', !enabledValues.includes(chip.dataset.value));
  });
}

// Utility to update the "Saved" chip state based on wishlist contents
function updateSavedChipState() {
  const savedChip = document.querySelector(`#wishlistFilter .chip[data-value="${CONFIG.FILTER_VALUES.SAVED}"]`);
  if (savedChip) {
    if (wishlist.size === 0) {
      savedChip.classList.add("inactive");
    } else {
      savedChip.classList.remove("inactive");
    }
  }
}
function checkAuth() {
  const cookie = document.cookie.match(/(?:^|;\s*)auth=([^;]*)/);
  return cookie && cookie[1] === CONFIG.PASSWORD;
}

function setAuthCookie() {
  document.cookie = `auth=${CONFIG.PASSWORD}; path=/; max-age=${CONFIG.COOKIE_MAXAGE}`;
}

function showLogin() {
  const loginOverlay = document.createElement("div");
  loginOverlay.className = "login-overlay";

  const form = document.createElement("form");
  form.className = "login-form";

  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Enter password";
  input.className = "login-input";

  const button = document.createElement("button");
  button.textContent = "Login";
  button.type = "submit";
  button.className = "login-button";

  const error = document.createElement("div");
  error.className = "login-error";

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value === CONFIG.PASSWORD) {
      setAuthCookie();
      loginOverlay.remove();
      startApp();
    } else {
      error.textContent = "Incorrect password.";
    }
  });

  form.appendChild(input);
  form.appendChild(button);
  form.appendChild(error);

  loginOverlay.appendChild(form);
  document.body.appendChild(loginOverlay);
  input.focus();
}

function startApp() {
  populateFilters();
  renderGrid();
  document.getElementById("backToFilters").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
const grid = document.getElementById("grid");
const imageCache = new Map();
function getWishlistFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)wishlist=([^;]*)/);
  if (!match) return [];
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return [];
  }
}
const wishlist = new Set(getWishlistFromCookie());

function saveWishlistToLocalStorage() {
  const value = encodeURIComponent(JSON.stringify([...wishlist]));
  document.cookie = `wishlist=${value}; path=/; max-age=${CONFIG.WISHLIST_MAXAGE}`;
}

function normalizeGender(gender) {
  return gender && gender.trim() !== "" ? gender : CONFIG.FILTER_VALUES.UNISEX;
}

function getSelectedValuesFromChips(containerId) {
  const activeValues = Array.from(document.querySelectorAll(`#${containerId} .chip.active`)).map(c => c.dataset.value);
  return activeValues;
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

      // Clear other filters when "wishlistFilter" is clicked
      if (containerId === "wishlistFilter") {
        // Deselect all chips in gender and category
        document.querySelectorAll('#genderFilter .chip.active, #categoryFilter .chip.active').forEach(c => {
          c.classList.remove("active");
        });
      }

      requestAnimationFrame(() => {
        renderGrid();
      });
    });

    container.appendChild(chip);
  });
}

function populateFilters() {
  const allGenders = [...new Set(products.map(p => normalizeGender(p.Gender)))];
  const genderOrder = ["Women", "Men", CONFIG.FILTER_VALUES.UNISEX];
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
  const includesUnisex = selectedGenders.includes(CONFIG.FILTER_VALUES.UNISEX);

  const result = [...selectedGenders];
  if ((includesMen || includesWomen) && !includesUnisex) {
    result.push(CONFIG.FILTER_VALUES.UNISEX);
  }

  return [...new Set(result)];
}

function preloadAllImages(imagePrefix, suffixes) {
  suffixes.forEach((suffix) => {
    const preloadSrc = `${imagePrefix}${suffix}.jpg?sw=560,sh=840`;
    if (!imageCache.has(preloadSrc)) {
      const preloadImg = new Image();
      preloadImg.src = preloadSrc;
      preloadImg.onload = () => imageCache.set(preloadSrc, true);
      preloadImg.onerror = () => imageCache.set(preloadSrc, false);
    }
  });
}

function renderGrid(lastInteractedGroup = null) {
  if (!grid) return; // Early exit if grid doesn't exist

  const wishlistGroup = document.getElementById("wishlistFilterGroup");
  if (wishlistGroup) {
    wishlistGroup.style.display = "flex";
    initializeWishlistFilter();

    updateCONFIG.FILTER_VALUES.SAVEDChipState();
  }

  const selectedGenders = getSelectedValuesFromChips("genderFilter");
  const selectedCategories = getSelectedValuesFromChips("categoryFilter");
  const savedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || "CONFIG.FILTER_VALUES.ALL";

  const expandedGenders = expandGenders(selectedGenders);
  let filtered = products.filter(p => {
    const gender = normalizeGender(p.Gender);
    const genderMatch = expandedGenders.length === 0 || expandedGenders.includes(gender);
    const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(p.Category);
    const savedMatch = savedFilter === "CONFIG.FILTER_VALUES.ALL" || wishlist.has(p["Article number"]);
    return genderMatch && categoryMatch && savedMatch;
  });

  filtered.sort((a, b) => a.Category.localeCompare(b.Category));

  const itemCount = document.getElementById("itemCount");
  itemCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;

  grid.innerHTML = "";
  filtered.forEach(product => {
    const div = document.createElement("div");
    div.className = "grid-item";

    let imageUrl = product.image_link;
    let articleBase = product["Article number"];
    if (articleBase.startsWith("AD")) {
      articleBase = articleBase.replace(/^AD/, "A*");
      imageUrl = product.image_link.replaceAll(/AD/g, "A*");
    }

    const cleanUrl = imageUrl.replace(/^"|"$/g, "");

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    const spinner = document.createElement("div");
    spinner.className = "spinner";
    wrapper.appendChild(spinner);

    const img = document.createElement("img");
    img.alt = `${product["Article name"]} - ${product["Article number"]}`;
    img.loading = "lazy";

    // Fallback logic for loading images with suffixes
    const imageSuffixes = ["_FLAT", "_A", "_B", "_C", "_D", "_E"];
    const basePath = imageUrl.split(articleBase)[0];
    const imagePrefix = `${basePath}${articleBase}`;
    let currentIndex = 0;

    const tryLoadImage = (index) => {
      currentIndex = index; // Track current index as we load
      const testSrc = `${imagePrefix}${imageSuffixes[index]}.jpg?sw=560,sh=840`;
      img.src = testSrc;

      img.onload = () => {
        if (!wrapper.dataset.preloading) spinner.remove();
      };

      img.onerror = () => {
        if (index + 1 < imageSuffixes.length) {
          tryLoadImage(index + 1);
        } else {
          wrapper.classList.add("error");
          wrapper.style.animation = "none";
          spinner.remove();
          img.remove(); // Remove the image element completely if all attempts fail
          gender.textContent += `, ${product["Article number"]}`;
        }
      };
    };

    tryLoadImage(0);

    wrapper.appendChild(img);

    // Image cycling on click
    function handleImageAdvance() {
      const startIndex = (currentIndex + 1) % imageSuffixes.length;
      let attempts = 0;

      const advanceToNextAvailable = (index) => {
        if (attempts >= imageSuffixes.length) {
          spinner.style.display = "none";
          img.style.display = "block";
          wrapper.dataset.preloading = "";
          return;
        }

        attempts++;
        const testSrc = `${imagePrefix}${imageSuffixes[index]}.jpg?sw=560,sh=840`;

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

        const testImg = new Image();
        testImg.src = testSrc;
        testImg.onload = () => {
          imageCache.set(testSrc, true);
          finalizeImage();
        };
        testImg.onerror = () => {
          imageCache.set(testSrc, false);
          advanceToNextAvailable((index + 1) % imageSuffixes.length);
        };
      };

      advanceToNextAvailable(startIndex);
    }

    img.addEventListener("click", handleImageAdvance);

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

    const gender = document.createElement("div");
    gender.className = "brand";
    gender.textContent = `${normalizeGender(product.Gender)}, ${product.Color}`;

    const save = document.createElement("div");
    save.className = "save-icon";
    const isSaved = wishlist.has(product["Article number"]);
    save.innerHTML = getBookmarkSvg(isSaved);

    save.addEventListener("click", () => {
      const articleId = product["Article number"];
      const isCurrentlySaved = wishlist.has(articleId);

      if (isCurrentlySaved) {
        wishlist.delete(articleId);
      } else {
        wishlist.add(articleId);
      }

      save.innerHTML = getBookmarkSvg(!isCurrentlySaved);
      saveWishlistToLocalStorage();
      updateSavedChipState();

      const currentSavedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || CONFIG.FILTER_VALUES.ALL;
      if (wishlist.size === 0) {
        document.querySelectorAll('.chip.active').forEach(chip => chip.classList.remove('active'));
        renderGrid(); // Reset all if wishlist is empty
      } else if (currentSavedFilter === CONFIG.FILTER_VALUES.SAVED) {
        renderGrid(); // Update grid when in saved filter mode
      }

      const wishlistGroup = document.getElementById("wishlistFilterGroup");
      if (wishlistGroup && wishlist.size === 1) {
        wishlistGroup.style.display = "flex";
        initializeWishlistFilter();
      }
    });

    div.appendChild(wrapper);
    div.appendChild(name);
    div.appendChild(gender);
    wrapper.appendChild(save);

    grid.appendChild(div);
  });

  updateInactiveChips(lastInteractedGroup);
}

function updateInactiveChips(lastGroup = null) {
  const savedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || "CONFIG.FILTER_VALUES.ALL";

  if (savedFilter === "CONFIG.FILTER_VALUES.SAVED") {
    const savedProducts = products.filter(p => wishlist.has(p["Article number"]));
    const gendersInCONFIG.FILTER_VALUES.SAVED = [...new Set(savedProducts.map(p => normalizeGender(p.Gender)))];
    const categoriesInCONFIG.FILTER_VALUES.SAVED = [...new Set(savedProducts.map(p => p.Category))];

    document.querySelectorAll('#genderFilter .chip').forEach(chip => {
      const value = chip.dataset.value;
      chip.classList.toggle('inactive', !gendersInCONFIG.FILTER_VALUES.SAVED.includes(value));
    });

    document.querySelectorAll('#categoryFilter .chip').forEach(chip => {
      const value = chip.dataset.value;
      chip.classList.toggle('inactive', !categoriesInCONFIG.FILTER_VALUES.SAVED.includes(value));
    });

    return; // Skip regular logic
  }

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

// Initialize with authentication
if (checkAuth()) {
  startApp();
} else {
  showLogin();
}

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