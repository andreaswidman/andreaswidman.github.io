// Utility to update the "Saved" chip state based on wishlist contents
function updateSavedChipState() {
  const savedChip = document.querySelector('#wishlistFilter .chip[data-value="Saved"]');
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
  return cookie && cookie[1] === "pansy";
}

function setAuthCookie() {
  document.cookie = "auth=pansy; path=/; max-age=86400"; // 1 day
}

function showLogin() {
  const loginOverlay = document.createElement("div");
  loginOverlay.id = "login-overlay";
  loginOverlay.style.position = "fixed";
  loginOverlay.style.top = 0;
  loginOverlay.style.left = 0;
  loginOverlay.style.width = "100vw";
  loginOverlay.style.height = "100vh";
  loginOverlay.style.backgroundColor = "#fff";
  loginOverlay.style.display = "flex";
  loginOverlay.style.flexDirection = "column";
  loginOverlay.style.alignItems = "center";
  loginOverlay.style.justifyContent = "center";
  loginOverlay.style.zIndex = 9999;

  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.flexDirection = "column";
  form.style.alignItems = "center";

  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Enter password";
  input.style.fontSize = "20px";
  input.style.padding = "12px 20px";
  input.style.marginBottom = "10px";
  input.style.width = "300px";
  input.style.textAlign = "center";

  const button = document.createElement("button");
  button.textContent = "Login";
  button.type = "submit";
  button.style.background = "black";
  button.style.color = "white";
  button.style.border = "none";
  button.style.padding = "12px 24px";
  button.style.fontSize = "16px";
  button.style.cursor = "pointer";
  button.style.width = input.style.width;
  button.style.borderRadius = "999px";

  const error = document.createElement("div");
  error.style.color = "red";
  error.style.marginTop = "10px";
  error.style.fontSize = "14px";

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value === "pansy") {
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
  document.cookie = `wishlist=${value}; path=/; max-age=31536000`; // 1 year
}

function normalizeGender(gender) {
  return gender && gender.trim() !== "" ? gender : "Unisex";
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
      const preloadImg = new Image();
      preloadImg.src = preloadSrc;
      preloadImg.onload = () => imageCache.set(preloadSrc, true);
      preloadImg.onerror = () => imageCache.set(preloadSrc, false);
    }
  });
}

function renderGrid(lastInteractedGroup = null) {
  const wishlistGroup = document.getElementById("wishlistFilterGroup");
  if (wishlistGroup) {
    wishlistGroup.style.display = "flex";

    if (!wishlistGroup.dataset.initialized) {
      renderChips("wishlistFilter", ["All", "Saved"]);
      wishlistGroup.dataset.initialized = "true";
    }

    updateSavedChipState();
  }

  const selectedGenders = getSelectedValuesFromChips("genderFilter");
  const selectedCategories = getSelectedValuesFromChips("categoryFilter");
  const savedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || "All";

  const expandedGenders = expandGenders(selectedGenders);
  let filtered = products.filter(p => {
    const gender = normalizeGender(p.Gender);
    const genderMatch = expandedGenders.length === 0 || expandedGenders.includes(gender);
    const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(p.Category);
    const savedMatch = savedFilter === "All" || wishlist.has(p["Article number"]);
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
      const rewritten = articleBase.replace(/^AD/, "A*");
      articleBase = rewritten;
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
    // Image cycling on click
    // Detect which suffix is currently in use for the image
    for (let i = 0; i < imageSuffixes.length; i++) {
      if (img.src.includes(imageSuffixes[i])) {
        currentIndex = i;
        break;
      }
    }
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
    save.innerHTML = isSaved
      ? `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="black"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>`;
    save.addEventListener("click", () => {
      const articleId = product["Article number"];
      const isCurrentlySaved = wishlist.has(articleId);

      if (isCurrentlySaved) {
        wishlist.delete(articleId);
        save.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>`;
      } else {
        wishlist.add(articleId);
        save.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="12" height="12" viewBox="0 0 24 24" fill="black"><path d="M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2z"/></svg>`;
      }

      saveWishlistToLocalStorage();
      updateSavedChipState();

      const currentSavedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || "All";
      if (wishlist.size === 0) {
        document.querySelectorAll('.chip.active').forEach(chip => chip.classList.remove('active'));
        renderGrid(); // Reset all if wishlist is empty
      } else if (currentSavedFilter === "Saved") {
        renderGrid(); // Update grid when in saved filter mode
      }

      const wishlistGroup = document.getElementById("wishlistFilterGroup");
      if (wishlistGroup && wishlist.size === 1) {
        wishlistGroup.style.display = "flex";
        if (!wishlistGroup.dataset.initialized) {
          renderChips("wishlistFilter", ["All", "Saved"]);
          wishlistGroup.dataset.initialized = "true";
        }
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
  const savedFilter = getSelectedValuesFromChips("wishlistFilter")[0] || "All";

  if (savedFilter === "Saved") {
    const savedProducts = products.filter(p => wishlist.has(p["Article number"]));
    const gendersInSaved = [...new Set(savedProducts.map(p => normalizeGender(p.Gender)))];
    const categoriesInSaved = [...new Set(savedProducts.map(p => p.Category))];

    document.querySelectorAll('#genderFilter .chip').forEach(chip => {
      const value = chip.dataset.value;
      chip.classList.toggle('inactive', !gendersInSaved.includes(value));
    });

    document.querySelectorAll('#categoryFilter .chip').forEach(chip => {
      const value = chip.dataset.value;
      chip.classList.toggle('inactive', !categoriesInSaved.includes(value));
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