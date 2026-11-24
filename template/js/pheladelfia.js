/* Pheladelfia V6: existing Zoho pages and native Zoho catalog cards. */
(function () {
  "use strict";
  var siteLocation = window.location;
  window.phRoutePath = function (href) {
    var url = new URL(href || siteLocation.href, siteLocation.href);
    return url.pathname.replace(/\/+$/, "") || "/";
  };
  function amount(value) {
    if (value == null || String(value).trim() === "") return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }
  function money(value) {
    var currency = window.zs_currency || {};
    return String(currency.symbol || currency.currency_symbol || "AED").trim() + " " + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  window.phFormatPrices = function (root) {
    var nodes = Array.from((root || document).querySelectorAll("[data-zs-selling-price]"));
    if (root && root.matches && root.matches("[data-zs-selling-price]")) nodes.unshift(root);
    nodes.forEach(function (node) {
      var min = amount(node.getAttribute("data-ph-price-min"));
      var max = amount(node.getAttribute("data-ph-price-max"));
      var price = amount(node.getAttribute("data-zs-selling-price"));
      var text = min !== null && max !== null && min !== max ? money(min) + " – " + money(max) : (price !== null ? money(price) : "");
      if (!text) return;
      var value = node.querySelector("[data-ph-price-value]");
      if (value) value.textContent = text;
      else node.textContent = text;
      var previous = node.querySelector("[data-ph-price-old]");
      if (previous && amount(previous.getAttribute("data-ph-price-old")) !== null) previous.textContent = money(amount(previous.getAttribute("data-ph-price-old")));
    });
  };
  async function getDocument(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("Catalog unavailable");
      return new DOMParser().parseFromString(await response.text(), "text/html");
    } finally { clearTimeout(timer); }
  }
  async function loadCatalog() {
    var grid = document.querySelector("[data-ph-best-sellers]");
    if (!grid) return;
    var section = grid.closest("[data-ph-best-section]");
    var seenPages = new Set(), seenProducts = new Set(), requests = 0;
    var queue = Array.from(document.querySelectorAll('.ph-cat-grid a[href*="/categories/"]')).map(function (link) { return link.href; });
    async function visit(href) {
      var url = new URL(href, siteLocation.href);
      if (url.origin !== siteLocation.origin || seenPages.has(url.href) || requests >= 10) return;
      seenPages.add(url.href);
      requests++;
      try {
        var doc = await getDocument(url.href);
        var jobs = [];
        doc.querySelectorAll("[data-ph-product-card]").forEach(function (card) {
          var link = card.querySelector('a[href*="/products/"]');
          if (!link || seenProducts.size >= 8) return;
          var productUrl = new URL(link.getAttribute("href"), url.href);
          if (productUrl.origin !== siteLocation.origin) return;
          var key = card.getAttribute("data-ph-product-id") || productUrl.pathname;
          if (seenProducts.has(key)) return;
          seenProducts.add(key);
          var copy = document.importNode(card, true);
          copy.querySelectorAll("[href], [src]").forEach(function (node) {
            ["href", "src"].forEach(function (attribute) {
              var value = node.getAttribute(attribute);
              if (value && !/^(data:|#)/i.test(value)) node.setAttribute(attribute, new URL(value, url.href).href);
            });
          });
          window.phFormatPrices(copy);
          grid.appendChild(copy);
          // Product detail provides the authoritative range when category cards
          // expose only the first variant's price. Never hardcode a product.
          var price = copy.querySelector("[data-zs-selling-price]");
          if (price && !price.hasAttribute("data-ph-price-min")) jobs.push(getDocument(productUrl.href).then(function (detail) {
            var original = detail.querySelector("[data-ph-price]");
            if (!original) return;
            ["data-zs-selling-price", "data-ph-price-min", "data-ph-price-max"].forEach(function (attribute) {
              if (original.hasAttribute(attribute)) price.setAttribute(attribute, original.getAttribute(attribute));
            });
            window.phFormatPrices(copy);
          }).catch(function () { /* Retain the server-rendered price. */ }));
        });
        doc.querySelectorAll('[data-ph-subcats] a[href*="/categories/"]').forEach(function (link) { queue.push(new URL(link.getAttribute("href"), url.href).href); });
        await Promise.all(jobs);
      } catch (error) { /* An unavailable collection does not hide other collections. */ }
    }
    while (queue.length && seenProducts.size < 8 && requests < 10) await Promise.all(queue.splice(0, 3).map(visit));
    grid.setAttribute("aria-busy", "false");
    grid.hidden = seenProducts.size === 0;
    var loading = section.querySelector("[data-ph-catalog-loading]");
    var status = section.querySelector("[data-ph-catalog-status]");
    var controls = section.querySelector(".ph-carousel-nav");
    if (loading) loading.hidden = true;
    if (status) status.hidden = seenProducts.size > 0;
    if (controls) controls.hidden = seenProducts.size < 2;
  }
  function initHeroSlider() {
    var root = document.querySelector("[data-ph-slider]");
    if (!root) return;
    var slides = Array.prototype.slice.call(root.querySelectorAll(".ph-hero-slide"));
    if (!slides.length) return;
    var count = slides.length;
    var dotsHost = root.querySelector("[data-ph-dots]");
    var status = root.querySelector("[data-ph-slide-status]");
    var prevBtn = root.querySelector("[data-ph-slide-prev]");
    var nextBtn = root.querySelector("[data-ph-slide-next]");
    var toggleBtn = root.querySelector("[data-ph-slide-toggle]");
    var playIcon = toggleBtn && toggleBtn.querySelector("[data-ph-icon-play]");
    var pauseIcon = toggleBtn && toggleBtn.querySelector("[data-ph-icon-pause]");
    var index = 0;
    var timer = null;
    var playing = true;
    var hover = false;
    var focused = false;
    var touching = false;
    var touchX = 0;
    var reduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var dots = [];

    function rtl() {
      return document.documentElement.dir === "rtl" || document.documentElement.lang === "ar";
    }
    function autoplayAllowed() {
      return playing && !reduced && !hover && !focused && !touching;
    }
    function slideLabel(i) {
      return (i + 1) + " of " + count;
    }
    function render() {
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
        slide.setAttribute("aria-label", slideLabel(i));
      });
      dots.forEach(function (dot, i) {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (status && !autoplayAllowed()) status.textContent = "Slide " + slideLabel(index);
    }
    function arm() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (autoplayAllowed()) timer = setTimeout(function () { goTo(index + 1); }, 6000);
    }
    function goTo(i) {
      index = (i + count) % count;
      if (index < 0) index += count;
      render();
      arm();
    }

    if (dotsHost && count > 1) {
      for (var d = 0; d < count; d++) {
        (function (i) {
          var dot = document.createElement("button");
          dot.type = "button";
          dot.className = "ph-hero-dot";
          dot.setAttribute("aria-label", "Slide " + (i + 1));
          dot.addEventListener("click", function () { goTo(i); });
          dotsHost.appendChild(dot);
          dots.push(dot);
        })(d);
      }
    }
    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(index - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(index + 1); });
    if (toggleBtn) {
      function syncToggle() {
        var paused = !autoplayAllowed();
        toggleBtn.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
        if (playIcon) playIcon.hidden = !paused;
        if (pauseIcon) pauseIcon.hidden = paused;
      }
      toggleBtn.addEventListener("click", function () {
        playing = !playing;
        syncToggle();
        arm();
      });
      syncToggle();
      if (reduced && toggleBtn.parentNode) toggleBtn.hidden = true;
    }

    root.addEventListener("mouseenter", function () { hover = true; arm(); });
    root.addEventListener("mouseleave", function () { hover = false; arm(); });
    root.addEventListener("focusin", function () { focused = true; arm(); });
    root.addEventListener("focusout", function (event) {
      if (!root.contains(event.relatedTarget)) { focused = false; arm(); }
    });
    root.addEventListener("pointerdown", function (event) {
      touching = true;
      touchX = event.clientX;
      arm();
    });
    function endTouch(event) {
      if (!touching) return;
      touching = false;
      var dx = event.clientX - touchX;
      var delta = rtl() ? -dx : dx;
      if (delta < -40) goTo(index + 1);
      else if (delta > 40) goTo(index - 1);
      else arm();
    }
    window.addEventListener("pointerup", endTouch);
    window.addEventListener("pointercancel", endTouch);
    root.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var backwards = (event.key === "ArrowLeft") !== rtl();
      goTo(index + (backwards ? -1 : 1));
    });

    render();
    arm();
  }
  function ready() {
    document.querySelectorAll("style").forEach(function (style) {
      var text = style.textContent || "";
      if (text.indexOf("ph-footer__inner") !== -1 && /direction\s*:\s*rtl/.test(text)) style.remove();
    });
    var path = window.phRoutePath();
    var route = ["/", "/home", "/index", "/index.html"].indexOf(path) >= 0 ? "home" : path.slice(1);
    var main = document.querySelector("[data-ph-page-body]");
    var fallback = document.querySelector('[data-ph-route="' + route.replace(/[^a-z-]/g, "") + '"]');
    if (main && fallback && fallback.content) main.replaceChildren(fallback.content.cloneNode(true));
    if (main) document.body.classList.toggle("is-home", !!main.querySelector(".ph-hero"));
    var fallbacks = document.querySelector("[data-ph-route-fallbacks]");
    if (fallbacks) fallbacks.remove();
    document.querySelectorAll("[data-ph-logo-track]").forEach(function (track) {
      if (track.dataset.phLogoCloned) return;
      track.dataset.phLogoCloned = "1";
      Array.prototype.slice.call(track.children).forEach(function (item) {
        track.appendChild(item.cloneNode(true));
      });
    });
    window.phFormatPrices(document);
    initHeroSlider();
    loadCatalog();
    var grid = document.querySelector("[data-ph-best-sellers]");
    if (grid) [["[data-ph-carousel-prev]", -1], ["[data-ph-carousel-next]", 1]].forEach(function (entry) {
      var button = document.querySelector(entry[0]);
      if (!button) return;
      button.addEventListener("click", function () {
        grid.scrollBy({ left: grid.clientWidth * entry[1] * (document.documentElement.dir === "rtl" ? -1 : 1), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    });
    // Anchor targets belong to the newly selected page rather than Home.
    if (location.hash) requestAnimationFrame(function () {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();

/* Existing storefront behavior. */
if (!window.__phJsOnce) {
window.__phJsOnce = true;
(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var drawerOpener = null;

  function cartHeaders() {
    var headers = { "Content-Type": "application/json", "x-zs-cart-cookie-httponly": "true" };
    if (window.zsUtils && zsUtils.getCSRFHeader) {
      Object.assign(headers, zsUtils.getCSRFHeader());
    }
    return headers;
  }

  function cartItemsFrom(data) {
    if (!data) return [];
    if (data.payload && data.payload.items) return data.payload.items;
    if (data.cart_details && data.cart_details.items) return data.cart_details.items;
    return [];
  }

  function updateCartBadge(data) {
    var items = cartItemsFrom(data);
    var count = items.reduce(function (sum, item) {
      return sum + (parseInt(item.quantity, 10) || 1);
    }, 0);
    if (!count && data && data.payload) {
      count = Number(data.payload.count || data.payload.cart_count || data.payload.total_count || 0);
    }
    var badge = qs("[data-ph-cart-count]");
    var link = qs("[data-ph-cart-link]") || qs("a[href='/cart']");
    if (!badge && link) {
      badge = document.createElement("span");
      badge.className = "ph-cart-count";
      badge.setAttribute("data-ph-cart-count", "");
      link.appendChild(badge);
    }
    if (badge) {
      badge.hidden = !count;
      badge.textContent = count ? String(count) : "";
    }
    var ids = {};
    items.forEach(function (item) {
      if (item.variant_id) ids[String(item.variant_id)] = true;
    });
    qsa("[data-ph-size-chip]").forEach(function (chip) {
      chip.classList.toggle("is-in-cart", !!ids[chip.getAttribute("data-ph-variant-id")]);
    });
    return count;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cartPayload(data) {
    return (data && (data.payload || data.cart_details)) || {};
  }

  function itemSize(item) {
    var option = ((item && item.options) || []).filter(function (entry) {
      return entry && entry.value;
    })[0];
    return option ? option.value : "";
  }

  function itemTitle(item) {
    var name = (item && item.name) || "Specimen";
    var size = itemSize(item);
    if (size) {
      name = name.replace(" - " + size, "").replace(size, "").replace(/\s+-\s*$/, "").trim();
    }
    return name || "Specimen";
  }

  function itemPhotoUrl(item) {
    var image = item && item.images && item.images[0];
    return (image && isRealSrc(image.url)) ? hdImageUrl(image.url) : "";
  }

  function renderCartDrawer(data) {
    var host = qs("[data-ph-drawer-items]");
    var foot = qs("[data-ph-drawer-foot]");
    var sub = qs("[data-ph-drawer-subtotal]");
    var checkout = qs("[data-ph-drawer-checkout]");
    if (!host) return data;
    var payload = cartPayload(data);
    var items = payload.items || [];
    updateCartBadge(data);
    if (!items.length) {
      host.innerHTML = '<div class="ph-drawer-empty"><p>Your selection is empty.</p><a class="ph-btn" href="/all-collections">Browse collections</a></div>';
      if (foot) foot.hidden = true;
      return data;
    }
    host.innerHTML = items.map(function (item) {
      var photo = itemPhotoUrl(item);
      var size = itemSize(item);
      var bits = [];
      if (size) bits.push(size);
      if (item.sku) bits.push(item.sku);
      return (
        '<article class="ph-drawer-item" data-ph-drawer-row data-zs-product-variant-id="' + esc(item.variant_id || "") + '" data-zs-product-wrapper-lineitem-id="' + esc(item.line_item_id || "") + '">' +
          '<div class="ph-drawer-photo"' + (photo ? ' style="background-image:url(\'' + esc(photo) + '\')"' : "") + "></div>" +
          "<div>" +
            '<a class="ph-drawer-name" href="' + esc(item.url || "/cart") + '">' + esc(itemTitle(item)) + "</a>" +
            (bits.length ? '<p class="ph-drawer-meta">' + esc(bits.join(" · ")) + "</p>" : "") +
            '<div class="ph-drawer-row">' +
              '<div class="ph-qty-box">' +
                '<button type="button" class="ph-qty-btn" data-ph-drawer-minus aria-label="Decrease quantity">−</button>' +
                '<input class="ph-qty" data-zs-quantity type="number" min="1"' + (lineStockMax(item) !== null ? ' max="' + lineStockMax(item) + '"' : '') + ' value="' + esc(item.quantity || 1) + '" aria-label="Quantity">' +
                '<button type="button" class="ph-qty-btn" data-ph-drawer-plus aria-label="Increase quantity">+</button>' +
              "</div>" +
              '<div class="ph-drawer-price">' + esc(money(item.total_price != null ? item.total_price : item.selling_price)) + "</div>" +
            "</div>" +
            '<button type="button" class="ph-drawer-remove" data-ph-drawer-remove>Remove</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");
    if (foot) foot.hidden = false;
    if (sub) sub.textContent = money(payload.sub_total);
    if (checkout) checkout.href = payload.checkout_url || "/checkout";
    return data;
  }

  function loadCartBadge() {
    fetch("/storefront/api/v1/cart", {
      credentials: "same-origin",
      headers: cartHeaders()
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (data) {
      if (data) updateCartBadge(data);
    }).catch(function () {});
  }

  function loadCartDrawer() {
    return fetch("/storefront/api/v1/cart", {
      credentials: "same-origin",
      headers: cartHeaders()
    }).then(function (res) {
      if (!res.ok) throw new Error("Cart request failed: " + res.status);
      return res.json();
    }).then(renderCartDrawer).catch(function () {
      var host = qs("[data-ph-drawer-items]");
      var foot = qs("[data-ph-drawer-foot]");
      if (host) {
        host.innerHTML = '<div class="ph-drawer-empty" role="alert"><p>Could not load your selection. You can view the cart page instead.</p><a class="ph-btn" href="/cart">View full selection</a></div>';
      }
      if (foot) foot.hidden = true;
    });
  }

  function openCartDrawer() {
    var drawer = qs("[data-ph-drawer]");
    if (!drawer) return;
    if (!drawer.classList.contains("is-open")) drawerOpener = document.activeElement;
    drawer.removeAttribute("inert");
    drawer.setAttribute("aria-hidden", "false");
    drawer.classList.add("is-open");
    document.body.classList.add("ph-drawer-open");
    var panel = qs(".ph-drawer-panel", drawer);
    if (panel) panel.focus();
    loadCartDrawer();
  }

  function closeCartDrawer() {
    var drawer = qs("[data-ph-drawer]");
    if (!drawer || !drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    document.body.classList.remove("ph-drawer-open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    if (drawerOpener && drawerOpener.isConnected) drawerOpener.focus();
    drawerOpener = null;
  }

  function lineStockMax(item) {
    if (!item || item.is_stock_managed === false) return null;
    var stock = Number(item.stock_available);
    if (!isFinite(stock)) return null;
    if (item.is_out_of_stock || item.is_available_for_purchase === false) return 0;
    return Math.max(0, Math.floor(stock));
  }

  function capLineQty(qty, next) {
    var value = Math.max(1, parseInt(next, 10) || 1);
    if (qty && qty.hasAttribute("max")) {
      var max = parseInt(qty.getAttribute("max"), 10);
      if (isFinite(max)) {
        if (max < 1) return null;
        value = Math.min(value, max);
      }
    }
    return value;
  }

  function changeDrawerQty(row, next) {
    var qty = qs("[data-zs-quantity]", row);
    var variantId = row.getAttribute("data-zs-product-variant-id");
    var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
    if (!qty || !variantId) return;
    var capped = capLineQty(qty, next);
    if (capped === null) return;
    qty.value = String(capped);
    var body = { product_variant_id: variantId, quantity: qty.value };
    if (lineId) body.line_item_id = lineId;
    fetch("/storefront/api/v1/cart", {
      method: "PUT",
      headers: cartHeaders(),
      credentials: "same-origin",
      body: JSON.stringify(body)
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data && (data.payload || data.cart_details)) renderCartDrawer(data);
      else loadCartDrawer();
    }).catch(loadCartDrawer);
  }

  function removeDrawerRow(row) {
    var variantId = row.getAttribute("data-zs-product-variant-id");
    var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
    if (!variantId) return;
    var url = "/storefront/api/v1/cart?product_variant_id=" + encodeURIComponent(variantId);
    if (lineId) url += "&line_item_id=" + encodeURIComponent(lineId);
    fetch(url, {
      method: "DELETE",
      headers: cartHeaders(),
      credentials: "same-origin"
    }).then(loadCartDrawer).catch(loadCartDrawer);
  }

  function bindCartDrawer() {
    if (!qs("[data-ph-drawer]")) return;
    qsa("[data-ph-cart-link], [data-ph-open-cart]").forEach(function (el) {
      el.addEventListener("click", function (event) {
        event.preventDefault();
        openCartDrawer();
      });
    });
    qsa("[data-ph-drawer-close]").forEach(function (el) {
      el.addEventListener("click", closeCartDrawer);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeCartDrawer();
    });
    var host = qs("[data-ph-drawer-items]");
    var panel = qs(".ph-drawer-panel");
    if (panel) {
      panel.addEventListener("keydown", function (event) {
        if (event.key !== "Tab") return;
        var focusable = qsa("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])", panel)
          .filter(function (el) { return !el.closest("[hidden]"); });
        if (!focusable.length) {
          event.preventDefault();
          panel.focus();
          return;
        }
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
    if (!host) return;
    host.addEventListener("click", function (event) {
      var row = event.target.closest("[data-ph-drawer-row]");
      if (!row) return;
      var qty = qs("[data-zs-quantity]", row);
      var current = parseInt((qty && qty.value) || "1", 10);
      if (event.target.closest("[data-ph-drawer-minus]")) changeDrawerQty(row, current - 1);
      if (event.target.closest("[data-ph-drawer-plus]")) changeDrawerQty(row, current + 1);
      if (event.target.closest("[data-ph-drawer-remove]")) removeDrawerRow(row);
    });
    host.addEventListener("change", function (event) {
      if (!event.target || !event.target.hasAttribute("data-zs-quantity")) return;
      var row = event.target.closest("[data-ph-drawer-row]");
      if (row) changeDrawerQty(row, parseInt(event.target.value || "1", 10));
    });
  }

  function realImages(list) {
    return (list || []).filter(function (image) {
      return image && image.url && !image.is_placeholder_image && image.url.indexOf("no-preview-image") === -1;
    });
  }

  function isRealSrc(src) {
    if (!src) return false;
    var value = String(src);
    return value.indexOf("no-preview-image") === -1
      && value.indexOf("unsplash") === -1
      && value.indexOf("zcstock-images") === -1
      && value.indexOf("zfcommerce/stock-images") === -1
      && value.indexOf("/stock-images/") === -1;
  }

  function hdImageUrl(url, size) {
    if (!url) return "";
    var value = String(url).replace(/&amp;/g, "&").replace(/\/(original|\d{2,4}x\d{2,4})\/?(?=\?|$)/i, "");
    if (!isRealSrc(value)) return value;
    var sized = size || "1600x1600";
    var match = value.match(/^(https?:\/\/[^/?#]+)?(\/(?:product-images|category-images)\/[^/?#]+\.(?:jpe?g|png|webp|gif)\/\d+)/i);
    if (match) return (match[1] || "") + match[2] + "/" + sized;
    return value;
  }

  function upgradeStoreImages(root) {
    qsa("img", root || document).forEach(function (img) {
      var src = img.getAttribute("src") || "";
      var hd = hdImageUrl(src);
      if (hd && hd !== src) img.setAttribute("src", hd);
    });
    qsa("[style*='background-image']", root || document).forEach(function (el) {
      var bg = el.style.backgroundImage || "";
      var found = bg.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (!found) return;
      var hd = hdImageUrl(found[1]);
      if (hd && hd !== found[1]) el.style.backgroundImage = "url('" + hd + "')";
    });
    qsa("[data-ph-real-photo]", root || document).forEach(function (el) {
      var src = el.getAttribute("data-ph-real-photo") || "";
      var hd = hdImageUrl(src);
      if (hd && hd !== src) el.setAttribute("data-ph-real-photo", hd);
    });
  }

  function isImageUrl(url) {
    return /^data:image\//i.test(url) || /(?:product|category)-images\//i.test(url) || /\.(?:jpe?g|png|webp|gif|avif|svg)(?:[/?#]|$)/i.test(url);
  }

  function setPhoto(el, url) {
    if (!el || !url || !isRealSrc(url) || !isImageUrl(url)) return;
    el.style.backgroundImage = "url('" + hdImageUrl(url) + "')";
  }

  function hasPhoto(el) {
    var bg = (el && el.style && el.style.backgroundImage) || "";
    return !!(bg && bg !== "none" && bg.indexOf("unsplash") === -1);
  }

  function photoCacheGet() {
    try {
      var cache = JSON.parse(sessionStorage.getItem("phCatPhotosV2") || "{}");
      Object.keys(cache).forEach(function (key) {
        cache[key] = hdImageUrl(cache[key]);
      });
      return cache;
    } catch (err) { return {}; }
  }

  function photoCacheSet(cache) {
    try { sessionStorage.setItem("phCatPhotosV2", JSON.stringify(cache)); } catch (err) {}
  }

  function photoFromHtml(html) {
    var urls = String(html || "").match(/https?:[^"'\\\s<>]+(?:product-images|category-images)[^"'\\\s<>]*/gi) || [];
    var i;
    for (i = 0; i < urls.length; i++) {
      var url = urls[i].replace(/&amp;/g, "&");
      if (isRealSrc(url)) return hdImageUrl(url);
    }
    return "";
  }

  function loadCatPhoto(id, href) {
    var cache = photoCacheGet();
    if (cache[id]) return Promise.resolve(cache[id]);
    function remember(url) {
      if (url) {
        cache[id] = url;
        photoCacheSet(cache);
      }
      return url || "";
    }
    var pageUrl = href && href.indexOf("/categories/") === 0 ? href : "/categories/" + id;
    return fetch(pageUrl, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("Category page request failed: " + res.status);
      return res.text();
    }).then(function (html) {
      return remember(photoFromHtml(html));
    }).catch(function () { return ""; });
  }

  function fillFileSlots() {
    var slots = qsa("[data-ph-file-slot]");
    if (!slots.length) return;
    function tryNames(names) {
      var exts = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".PNG"];
      var queue = [];
      names.forEach(function (name) {
        name = (name || "").trim();
        if (!name) return;
        exts.forEach(function (ext) {
          queue.push("/" + encodeURIComponent(name + ext).replace(/%2F/g, "/"));
          queue.push("/" + name + ext);
        });
      });
      return queue.reduce(function (prev, url) {
        return prev.then(function (found) {
          if (found) return found;
          return fetch(url, { credentials: "same-origin" }).then(function (res) {
            var type = (res.headers.get("content-type") || "").toLowerCase();
            return (res.ok && type.indexOf("image/") === 0) ? url : "";
          }).catch(function () { return ""; });
        });
      }, Promise.resolve(""));
    }
    slots.forEach(function (el) {
      if (hasPhoto(el)) return;
      var names = (el.getAttribute("data-ph-file-names") || "").split(/\s+/);
      tryNames(names).then(function (url) {
        if (url && isRealSrc(url)) setPhoto(el, url);
      });
    });
  }

  function fillPagePhotos() {
    var hosts = qsa("[data-ph-page-content]:not([data-ph-home-content])");
    var slots = qsa("[data-ph-page-photo]");
    var urls = [];
    hosts.forEach(function (host) {
      qsa("img", host).forEach(function (img) {
        var src = img.currentSrc || img.getAttribute("src") || "";
        if (!isRealSrc(src)) return;
        urls.push(src);
        img.setAttribute("data-ph-used-in-slot", "true");
      });
      var text = (host.textContent || "").replace(/\s+/g, "");
      var leftover = qsa("img", host).filter(function (img) { return !img.getAttribute("data-ph-used-in-slot"); });
      if (!text && !leftover.length) host.classList.add("is-empty");
    });
    slots.forEach(function (el, index) {
      if (urls[index]) setPhoto(el, urls[index]);
    });
    qsa("[data-ph-used-in-slot]").forEach(function (img) {
      img.style.display = "none";
    });
  }

  function fillMissingCatPhotos() {
    qsa("[data-ph-cat-photo]").forEach(function (el) {
      if (hasPhoto(el)) return;
      var marked = qs("[data-ph-real-photo]", el);
      if (marked && isRealSrc(marked.getAttribute("data-ph-real-photo"))) {
        setPhoto(el, marked.getAttribute("data-ph-real-photo"));
        return;
      }
      var id = el.getAttribute("data-ph-cat-photo") || "";
      var card = el.closest("a[href], [data-ph-cat-id]");
      var href = (card && (card.getAttribute("href") || "")) || "";
      if (!id) return;
      loadCatPhoto(id, href).then(function (url) {
        if (url) setPhoto(el, url);
      });
    });
  }

  function fillImgList(host, images, alt) {
    if (!host) return;
    host.innerHTML = "";
    images.forEach(function (image, index) {
      var img = document.createElement("img");
      img.src = hdImageUrl(image.url);
      img.alt = image.alternate_text || alt || "";
      img.setAttribute("data-zs-image", "");
      if (index > 0) img.className = "ph-gallery-more";
      host.appendChild(img);
    });
  }

  function fillProductImages() {
    var product = window.zs_product;
    var images = realImages(product && product.images);
    if (product && !images.length) {
      var variants = product.variants || [];
      variants.forEach(function (variant) {
        images = images.concat(realImages(variant.images));
      });
    }
    if (images.length) {
      qsa("[data-ph-gallery]").forEach(function (gal) {
        if (gal.hasAttribute("data-ph-product-gallery")) {
          if (!gal.querySelector("img[src*='product-images']")) {
            var list = qs("[data-ph-product-images]", gal) || qs("[data-ph-main-image]", gal) || gal;
            fillImgList(list, images, product.name);
          }
          enhanceProductGallery(gal);
          return;
        }
        if (gal.querySelector("img[src*='product-images']")) return;
        var list = qs("[data-ph-product-images]", gal) || gal;
        fillImgList(list, images, product.name);
      });
    } else {
      qsa("[data-ph-product-gallery]").forEach(enhanceProductGallery);
    }
    var category = window.zs_category;
    var byCategory = {};
    ((category && category.products) || []).forEach(function (item) {
      var photos = realImages(item.images);
      if (item.category_id && photos.length) byCategory[item.category_id] = photos[0].url;
    });
    qsa("[data-ph-cat-photo]").forEach(function (el, index) {
      var sub = ((category && category.sub_categories) || [])[index] || {};
      var id = el.getAttribute("data-ph-cat-photo") || sub.id || sub.category_id || "";
      if (id) {
        el.setAttribute("data-ph-cat-photo", id);
        var card = el.closest("[data-ph-cat-id], a.ph-product-card");
        if (card && !card.getAttribute("data-ph-cat-id")) card.setAttribute("data-ph-cat-id", id);
      }
      var marked = qs("[data-ph-real-photo]", el);
      var url = (marked && marked.getAttribute("data-ph-real-photo")) || byCategory[id] || "";
      if (url) setPhoto(el, url);
    });

    var products = (category && category.products) || [];
    products.forEach(function (item) {
      var card = qs("[data-ph-product-id='" + item.product_id + "']");
      if (!card) return;
      var photos = realImages(item.images);
      var gal = qs("[data-ph-gallery]", card);
      if (gal && photos.length && !gal.querySelector("img[src*='product-images']")) {
        var list = qs("[data-ph-product-images]", gal) || gal;
        fillImgList(list, photos, item.name);
      }
      var source = qs("[data-ph-option-source]", card);
      var ids = [];
      if (source && source.textContent.trim()) {
        ids = source.textContent.trim().split(/\s+/);
      } else {
        (item.attributes || []).forEach(function (attribute) {
          (attribute.options || []).forEach(function (option) {
            if (option.id) ids.push(String(option.id));
          });
        });
        (item.variants || []).forEach(function (variant) {
          (variant.options || []).forEach(function (option) {
            if (option.id) ids.push(String(option.id));
          });
        });
      }
      if (ids.length) card.setAttribute("data-ph-options", ids.join(" "));
      var wishBtn = qs("[data-ph-wish-btn]", card);
      if (wishBtn && item.variants && item.variants.length) {
        var firstVariant = item.variants.filter(function (v) { return v && v.variant_id; })[0];
        if (firstVariant) wishBtn.setAttribute("data-zs-wishlist-variant-id", firstVariant.variant_id);
      }
    });
    if (window.__phWishlistSync) window.__phWishlistSync();
  }

  function stripNoise(root) {
    if (!root || !root.childNodes) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var doomed = [];
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue || "";
      if (/^[nN\s]+$/.test(value) && /[nN]/.test(value)) {
        doomed.push(node);
        continue;
      }
      if (/\/template\/[a-f0-9]{16,}/i.test(value) && !/\.(svg|png|jpe?g|css|js|webp)/i.test(value)) {
        doomed.push(node);
      }
    }
    doomed.forEach(function (textNode) {
      if (textNode.parentNode) textNode.parentNode.removeChild(textNode);
    });
    qsa("a[href], img[src]", root).forEach(function (el) {
      var v = el.getAttribute("href") || el.getAttribute("src") || "";
      if (/\/template\/[a-f0-9]+\/?$/i.test(v) && !/\.(svg|png|jpe?g|webp|ico)/i.test(v) && v.indexOf("/canvas/") === -1) {
        el.style.display = "none";
      }
    });
  }

  function tidyCategoryCatalog() {
    var cat = window.zs_category;
    var subCards = qsa(".ph-category-grid .ph-product-card");
    var hasSubs = subCards.length > 0 || !!(cat && cat.sub_categories && cat.sub_categories.length);
    var subGroup = qs("[data-ph-subcats]") || qs(".ph-cat-group");
    if (subGroup && !hasSubs) subGroup.hidden = true;
  }

  function markCurrentNav() {
    var path = window.phRoutePath ? window.phRoutePath() : ((location.pathname || "/").replace(/\/+$/, "") || "/");
    qsa(".ph-nav-list a").forEach(function (link) {
      var href = window.phRoutePath ? window.phRoutePath(link.href) : ((link.getAttribute("href") || "").replace(/\/+$/, "") || "/");
      if (href === path || (href !== "/" && path.indexOf(href) === 0)) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function enhanceProductGallery(gal) {
    if (!gal) return;
    var imgs = qsa("img", gal).filter(function (img) { return isRealSrc(img.currentSrc || img.src); });
    if (!imgs.length) return;
    var mainHost = qs("[data-ph-main-image]", gal);
    var thumbs = qs("[data-ph-thumbs]", gal) || qs("[data-ph-thumbs]");
    if (!mainHost) return;
    var urls = [];
    imgs.forEach(function (img) {
      var src = img.currentSrc || img.src;
      if (src && urls.indexOf(src) === -1) urls.push(src);
    });
    var sourceList = qs("[data-ph-product-images]", gal);
    if (sourceList && sourceList !== mainHost) sourceList.style.display = "none";
    var alt = (imgs[0] && imgs[0].alt) || "";
    mainHost.innerHTML = "";
    var main = document.createElement("img");
    main.src = hdImageUrl(urls[0], "original");
    main.alt = alt;
    mainHost.appendChild(main);
    if (!thumbs) return;
    thumbs.innerHTML = "";
    urls.forEach(function (src, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ph-thumb" + (index === 0 ? " is-active" : "");
      var thumb = document.createElement("img");
      thumb.src = hdImageUrl(src);
      thumb.alt = "";
      btn.appendChild(thumb);
      btn.addEventListener("click", function () {
        main.src = hdImageUrl(src, "original");
        qsa(".ph-thumb", thumbs).forEach(function (el) { el.classList.remove("is-active"); });
        btn.classList.add("is-active");
      });
      thumbs.appendChild(btn);
    });
  }

  function money(amount) {
    var num = Number(amount);
    if (!isFinite(num)) return "";
    var symbol = (window.zs_currency && (zs_currency.symbol || zs_currency.currency_symbol)) || "AED ";
    return String(symbol).trim() + " " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function productVariants() {
    return (window.zs_product && zs_product.variants) || [];
  }

  function findVariant(id) {
    return productVariants().filter(function (variant) {
      return String(variant.variant_id) === String(id);
    })[0] || null;
  }

  function findVariantByOptions(selected) {
    var wanted = (selected || []).map(String).sort().join();
    if (!wanted) return null;
    return productVariants().filter(function (variant) {
      var ids = (variant.options || []).map(function (option) { return String(option.id); }).sort().join();
      return ids === wanted;
    })[0] || null;
  }

  function variantStockCap(variant) {
    if (!variant || variant.is_stock_managed === false) return null;
    var stock = Number(variant.stock_available);
    return variant.stock_available == null || variant.stock_available === "" ? null : (isFinite(stock) ? Math.max(0, Math.floor(stock)) : null);
  }

  function variantIsUnavailable(variant) {
    if (!variant) return true;
    if (variant.is_available_for_purchase === false || variant.hide_add_to_cart) return true;
    if (variant.is_out_of_stock) return true;
    var stock = variantStockCap(variant);
    return stock !== null && stock <= 0;
  }

  function clampQty(qty) {
    if (!qty) return 1;
    var min = parseInt(qty.getAttribute("min") || "1", 10);
    if (!isFinite(min) || min < 1) min = 1;
    var next = parseInt(qty.value || String(min), 10);
    if (!isFinite(next) || next < min) next = min;
    if (qty.hasAttribute("max")) {
      var max = parseInt(qty.getAttribute("max"), 10);
      if (isFinite(max) && max >= min) next = Math.min(next, max);
    }
    qty.value = String(next);
    return next;
  }

  function applyVariant(variant, options) {
    if (!variant) return;
    options = options || {};
    var button = qs("[data-zs-add-to-cart]");
    if (button) button.setAttribute("data-zs-product-variant-id", variant.variant_id);
    qsa("[data-zs-wishlist-element]").forEach(function (el) {
      el.setAttribute("data-zs-wishlist-variant-id", variant.variant_id);
      markWishlist(el, false);
    });
    if (window.__phWishlistSync) window.__phWishlistSync();
    var price = qs("[data-ph-price]");
    if (price && !variant.hide_price && (variant.selling_price || variant.selling_price === 0)) {
      price.setAttribute("data-zs-selling-price", variant.selling_price);
      price.textContent = money(variant.selling_price);
    }
    var size = ((variant.options || [])[0] && variant.options[0].value) || "";
    var sizeLabel = qs("[data-ph-size-label]");
    if (sizeLabel) sizeLabel.textContent = size ? "· " + size : "";
    var sku = qs("[data-ph-sku]");
    if (sku) sku.textContent = variant.sku ? "SKU " + variant.sku : "";
    var specSize = qs("[data-ph-spec-size]");
    if (specSize) specSize.textContent = size || "—";
    var specSku = qs("[data-ph-spec-sku]");
    if (specSku) specSku.textContent = variant.sku || "—";
    var stock = variantStockCap(variant);
    var unavailable = variantIsUnavailable(variant);
    var stockEl = qs("[data-ph-stock]");
    var specStock = qs("[data-ph-spec-stock]");
    var stockText = unavailable ? "Out of stock" : (stock > 0 ? stock + " in nursery" : "Available");
    if (stockEl) {
      stockEl.hidden = false;
      stockEl.className = "ph-stock" + (unavailable ? " is-oos" : (stock > 0 && stock <= 3 ? " is-low" : ""));
      stockEl.textContent = stockText;
    }
    if (specStock) specStock.textContent = unavailable ? "Out of stock" : (stock > 0 ? stock + " NOS" : "Available");
    if (button) {
      button.disabled = unavailable;
      button.textContent = unavailable ? "Out of stock" : "Add to selection";
    }
    var qty = qs(".ph-product-page [data-zs-quantity]");
    if (qty) {
      if (stock !== null && stock > 0) {
        qty.disabled = false;
        qty.setAttribute("max", String(stock));
      } else if (unavailable) {
        qty.disabled = true;
        qty.setAttribute("max", "1");
        qty.value = "1";
      } else {
        qty.disabled = false;
        qty.removeAttribute("max");
      }
      clampQty(qty);
    }
    qsa("[data-ph-size-chip]").forEach(function (chip) {
      var on = String(chip.getAttribute("data-ph-variant-id")) === String(variant.variant_id);
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
    qsa("[data-zs-attribute-select]").forEach(function (sel) {
      (variant.options || []).forEach(function (option) {
        if (Array.from(sel.options).some(function (choice) { return String(choice.value) === String(option.id); })) {
          sel.value = String(option.id);
        }
      });
    });
    var pick = qs("[data-ph-variant-pick]");
    if (pick) pick.value = variant.variant_id;
    if (options.updateUrl !== false) {
      try {
        var url = new URL(location.href);
        url.searchParams.set("variant", variant.variant_id);
        history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
      } catch (err) {}
    }
  }

  function ensureSizeChips() {
    var host = qs("[data-ph-size-chips]");
    var variants = productVariants();
    if (!host || !variants.length) return;
    if (!host.children.length) {
      variants.forEach(function (variant) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ph-size-chip";
        chip.setAttribute("data-ph-size-chip", "");
        chip.setAttribute("data-ph-variant-id", variant.variant_id);
        chip.textContent = ((variant.options || [])[0] && variant.options[0].value) || variant.sku || "Size";
        host.appendChild(chip);
      });
    }
    qsa("[data-ph-size-chip]").forEach(function (chip) {
      var variant = findVariant(chip.getAttribute("data-ph-variant-id"));
      var blocked = variantIsUnavailable(variant);
      chip.classList.toggle("is-oos", blocked);
      chip.disabled = false;
      chip.setAttribute("aria-disabled", "false");
      chip.title = blocked ? "Out of stock — enquire about availability" : "";
    });
  }

  function bindProductBuy() {
    qsa("[data-zs-variants] option[data-ph-option-ids]").forEach(function (opt) {
      var ids = (opt.getAttribute("data-ph-option-ids") || "").trim().split(/\s+/).filter(Boolean);
      opt.setAttribute("data-zs-attributes", JSON.stringify(ids));
    });
    var button = qs("[data-zs-add-to-cart]");
    var hidden = qs("[data-zs-variants]");
    ensureSizeChips();
    function resolveVariant(updateUrl) {
      var pick = qs("[data-ph-variant-pick]");
      var variant = null;
      if (pick && pick.value) variant = findVariant(pick.value);
      if (!variant) {
        var selected = qsa("[data-zs-attribute-select]").map(function (sel) { return sel.value; }).filter(Boolean);
        variant = findVariantByOptions(selected);
      }
      if (!variant && hidden && button) {
        var selected = [];
        qsa("[data-zs-attribute-select]").forEach(function (sel) {
          if (sel.value) selected.push(String(sel.value));
        });
        selected.sort();
        Array.from(hidden.options).forEach(function (opt) {
          var ids = [];
          try { ids = JSON.parse(opt.getAttribute("data-zs-attributes") || "[]"); } catch (err) { ids = []; }
          ids = (ids || []).map(String).sort();
          if (selected.length && ids.join() === selected.join() && opt.value && opt.value !== "-1") {
            variant = findVariant(opt.value) || { variant_id: opt.value };
          }
        });
      }
      if (variant) applyVariant(variant, { updateUrl: updateUrl !== false });
      else if (button) button.removeAttribute("data-zs-product-variant-id");
    }
    var wanted = new URLSearchParams(location.search).get("variant");
    qsa("[data-ph-size-chip]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var variant = findVariant(chip.getAttribute("data-ph-variant-id"));
        if (!variant) return;
        applyVariant(variant);
      });
    });
    qsa("[data-zs-attribute-select], [data-ph-variant-pick]").forEach(function (sel) {
      sel.addEventListener("change", function () { resolveVariant(true); });
    });
    var qty = qs(".ph-product-page [data-zs-quantity]");
    var minus = qs(".ph-product-page [data-ph-qty-minus]");
    var plus = qs(".ph-product-page [data-ph-qty-plus]");
    if (qty && minus) {
      minus.addEventListener("click", function () {
        qty.value = String(Math.max(1, parseInt(qty.value || "1", 10) - 1));
      });
    }
    if (qty && plus) {
      plus.addEventListener("click", function () {
        if (qty.disabled) return;
        var current = parseInt(qty.value || "1", 10);
        var max = qty.hasAttribute("max") ? parseInt(qty.getAttribute("max"), 10) : current + 1;
        if (!isFinite(max)) max = current;
        qty.value = String(Math.min(max, current + 1));
        clampQty(qty);
      });
    }
    if (qty) {
      qty.addEventListener("input", function () { clampQty(qty); });
      qty.addEventListener("change", function () { clampQty(qty); });
    }
    qsa("[data-zs-attribute-select] option").forEach(function (choice) {
      if (!choice.value) return;
      var matches = productVariants().filter(function (variant) {
        return (variant.options || []).some(function (option) { return String(option.id) === String(choice.value); });
      });
      if (matches.length) choice.disabled = false;
    });
    if (wanted && findVariant(wanted)) applyVariant(findVariant(wanted), { updateUrl: false });
    else {
      resolveVariant(false);
      var chosen = findVariant(button && button.getAttribute("data-zs-product-variant-id"));
      if (variantIsUnavailable(chosen)) {
        var open = productVariants().filter(function (variant) { return !variantIsUnavailable(variant); })[0];
        if (open || productVariants()[0]) applyVariant(open || productVariants()[0], { updateUrl: false });
      }
    }
    if (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        resolveVariant();
        var variantId = button.getAttribute("data-zs-product-variant-id");
        var err = qs("[data-theme-error]");
        if (!variantId) {
          if (err) {
            err.style.display = "block";
            err.textContent = "Select a size first.";
          }
          var size = qs("[data-zs-attribute-select], [data-ph-variant-pick]");
          if (size) size.focus();
          return;
        }
        if (err) {
          err.style.display = "none";
          err.textContent = "";
        }
        var qtyEl = qs("[data-zs-quantity]");
        if (variantIsUnavailable(findVariant(variantId))) {
          button.disabled = true;
          button.textContent = "Out of stock";
          return;
        }
        var note = qs("[data-ph-buy-ok]");
        var variant = findVariant(variantId);
        var sizeLabel = ((variant && variant.options && variant.options[0]) && variant.options[0].value) || "Size";
        button.disabled = true;
        fetch("/storefront/api/v1/cart", {
          method: "POST",
          headers: cartHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({
            product_variant_id: variantId,
            quantity: String(variantIsUnavailable(variant) ? 0 : clampQty(qtyEl))
          })
        }).then(function (res) { return res.json(); }).then(function (data) {
          var ok = data && ((data.payload && data.payload.items) || (data.cart_details && data.cart_details.items) || data.status_code === "0" || data.status_message === "success");
          button.disabled = variantIsUnavailable(variant);
          if (ok) {
            updateCartBadge(data);
            renderCartDrawer(data);
            openCartDrawer();
            if (note) {
              note.hidden = false;
              note.textContent = sizeLabel + " added to your selection.";
            }
            return;
          }
          if (err) {
            err.style.display = "block";
            err.textContent = (data.error && data.error.message) || (data.cart_details && data.cart_details.message) || "Could not add this specimen.";
          }
        }).catch(function () {
          button.disabled = variantIsUnavailable(findVariant(variantId));
          if (err) {
            err.style.display = "block";
            err.textContent = "Could not add this specimen.";
          }
        });
      });
    }
  }

  function collectSizeOptions() {
    var seen = {};
    var options = [];
    function add(id, name) {
      var label = (name || id || "").trim();
      var key = label.toLowerCase();
      if (!id || seen[id] || seen[key]) return;
      seen[id] = true;
      seen[key] = true;
      options.push({ id: String(id), name: label });
    }
    qsa("[data-ph-filter='attribute']").forEach(function (input) {
      add(input.getAttribute("data-ph-id"), (input.nextElementSibling && input.nextElementSibling.textContent) || "");
    });
    var products = ((window.zs_category && zs_category.products) || []).concat(window.zs_product ? [zs_product] : []);
    products.forEach(function (item) {
      var fromAttrs = false;
      (item.attributes || []).forEach(function (attribute) {
        if (!/size/i.test(attribute.name || "")) return;
        fromAttrs = true;
        (attribute.options || []).forEach(function (option) {
          add(option.id, option.value || option.name);
        });
      });
      if (fromAttrs) return;
      (item.variants || []).forEach(function (variant) {
        (variant.options || []).forEach(function (option) {
          add(option.id, option.value || option.name);
        });
      });
    });
    return options;
  }

  function bindFilters() {
    var host = qs("[data-ph-filters]");
    if (!host) return;
    qsa(".ph-filter-group", host).forEach(function (group) {
      if (group.getAttribute("data-ph-size-host") !== null) return;
      var type = group.getAttribute("data-ph-filter-type") || "";
      var hasOpt = qs(".ph-filter-opt, .ph-filter-list a", group);
      if (!hasOpt || type === "colours") group.style.display = "none";
      if (type === "category" && qs("[data-ph-filter-group='species']")) group.style.display = "none";
    });
    var sizeHost = qs("[data-ph-size-host]");
    var sizeBox = qs("[data-ph-size-options]");
    if (sizeHost && sizeBox && !sizeBox.children.length) {
      collectSizeOptions().forEach(function (option) {
        var label = document.createElement("label");
        label.className = "ph-filter-opt";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("data-ph-filter", "attribute");
        input.setAttribute("data-ph-id", String(option.id || ""));
        var span = document.createElement("span");
        span.textContent = option.name || "";
        label.appendChild(input);
        label.appendChild(span);
        sizeBox.appendChild(label);
      });
      if (sizeBox.children.length) sizeHost.hidden = false;
    }
    qsa("[data-ph-filter='category']").forEach(function (input) {
      input.addEventListener("change", function () {
        if (!input.checked) return;
        var id = input.getAttribute("data-ph-id");
        var link = qs("[data-ph-cat-id='" + id + "']");
        if (link && link.href) {
          window.location.href = link.href;
          return;
        }
        window.location.href = "/categories/" + id;
      });
    });
    qsa("[data-ph-product-card]").forEach(function (card) {
      var source = qs("[data-ph-option-source]", card);
      if (source && source.textContent.trim()) {
        card.setAttribute("data-ph-options", source.textContent.trim());
      }
    });
    function apply() {
      var ids = qsa("[data-ph-filter='attribute']:checked").map(function (input) {
        return input.getAttribute("data-ph-id");
      });
      qsa("[data-ph-product-card]").forEach(function (card) {
        var opts = (card.getAttribute("data-ph-options") || "").split(/\s+/).filter(Boolean);
        var ok = !ids.length || ids.some(function (id) { return opts.indexOf(id) >= 0; });
        card.style.display = ok ? "" : "none";
      });
    }
    host.addEventListener("change", function (event) {
      if (event.target && event.target.getAttribute("data-ph-filter") === "attribute") apply();
    });
    apply();
  }

  function variantFromUrl(url) {
    try {
      return new URL(url, location.origin).searchParams.get("variant") || "";
    } catch (err) {
      return "";
    }
  }

  function bindCart() {
    var root = qs("[data-cart-items]");
    if (!root) return;

    function updateRow(row) {
      var qty = qs("[data-zs-quantity]", row);
      var variantId = row.getAttribute("data-zs-product-variant-id");
      var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
      if (!variantId || !qty) return;
      var cappedQty = capLineQty(qty, qty.value);
      if (cappedQty === null) return;
      qty.value = String(cappedQty);
      var body = { product_variant_id: variantId, quantity: String(cappedQty) };
      if (lineId) body.line_item_id = lineId;
      fetch("/storefront/api/v1/cart", {
        method: "PUT",
        headers: cartHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(body)
      }).then(function () { window.location.reload(); });
    }

    function removeRow(row) {
      var variantId = row.getAttribute("data-zs-product-variant-id");
      var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
      if (!variantId) return;
      var url = "/storefront/api/v1/cart?product_variant_id=" + encodeURIComponent(variantId);
      if (lineId) url += "&line_item_id=" + encodeURIComponent(lineId);
      fetch(url, {
        method: "DELETE",
        headers: cartHeaders(),
        credentials: "same-origin"
      }).then(function () { window.location.reload(); });
    }

    fetch("/storefront/api/v1/cart", {
      credentials: "same-origin",
      headers: cartHeaders()
    }).then(function (res) { return res.json(); }).then(function (data) {
      var payload = data.payload || data.cart_details || {};
      var items = payload.items || [];
      var rows = qsa("[data-ph-cart-row]", root);
      items.forEach(function (item) {
        var row = rows.filter(function (el) {
          var url = el.getAttribute("data-ph-item-url") || "";
          return variantFromUrl(url) === String(item.variant_id) || url.indexOf(item.variant_id) >= 0;
        })[0] || rows[items.indexOf(item)];
        if (!row) return;
        row.setAttribute("data-zs-product-id", item.product_id || "");
        row.setAttribute("data-zs-product-variant-id", item.variant_id || "");
        row.setAttribute("data-zs-product-wrapper-lineitem-id", item.line_item_id || "");
        var sflBtn = row.querySelector("[data-zs-save-for-later]");
        if (sflBtn) {
          sflBtn.setAttribute("data-zs-product-variant-id", item.variant_id || "");
          sflBtn.setAttribute("data-zs-product-lineitem-id", item.line_item_id || "");
        }
        var qty = qs("[data-zs-quantity]", row);
        if (qty) {
          qty.setAttribute("data-zs-product-id", item.product_id || "");
          qty.setAttribute("data-zs-product-variant-id", item.variant_id || "");
          qty.setAttribute("data-zs-product-lineitem-id", item.line_item_id || "");
          var lineMax = lineStockMax(item);
          if (lineMax !== null) qty.setAttribute("max", String(lineMax));
          qty.value = item.quantity;
        }
        var del = qs("[data-zs-delete]", row);
        if (del) {
          del.setAttribute("data-zs-product-id", item.product_id || "");
          del.setAttribute("data-zs-product-variant-id", item.variant_id || "");
          del.setAttribute("data-zs-product-lineitem-id", item.line_item_id || "");
        }
        var photo = (item.images && item.images[0] && item.images[0].url) || "";
        if (photo && photo.indexOf("no-preview-image") === -1) setPhoto(qs("[data-ph-cart-photo]", row), photo);
        var meta = qs("[data-ph-cart-meta]", row);
        if (meta) {
          var bits = [];
          if (item.sku) bits.push(item.sku);
          (item.options || []).forEach(function (option) {
            if (option.value) bits.push(option.value);
          });
          meta.textContent = bits.join(" · ");
        }
        var unit = qs("[data-ph-cart-unit]", row);
        if (unit && (item.selling_price || item.selling_price === 0)) {
          unit.textContent = (payload.symbol || "AED") + item.selling_price;
        }
      });
    });

    root.addEventListener("click", function (event) {
      var row = event.target.closest("[data-ph-cart-row]");
      if (!row) return;
      var qty = qs("[data-zs-quantity]", row);
      if (event.target.closest("[data-ph-qty-minus]") && qty) {
        qty.value = Math.max(1, parseInt(qty.value || "1", 10) - 1);
        updateRow(row);
      }
      if (event.target.closest("[data-ph-qty-plus]") && qty) {
        var raised = capLineQty(qty, parseInt(qty.value || "1", 10) + 1);
        if (raised === null) return;
        qty.value = String(raised);
        updateRow(row);
      }
      if (event.target.closest("[data-ph-remove]")) removeRow(row);
    });
    root.addEventListener("change", function (event) {
      if (event.target && event.target.hasAttribute("data-zs-quantity")) {
        var row = event.target.closest("[data-ph-cart-row]");
        if (row) updateRow(row);
      }
    });
  }

  function bindHero() {
    var root = document.querySelector("[data-ph-hero]");
    if (!root || root.getAttribute("data-ph-hero-ready")) return;
    root.setAttribute("data-ph-hero-ready", "true");
    var slides = root.querySelectorAll("[data-ph-slide]");
    var dots = root.querySelectorAll("[data-ph-hero-dot]");
    var sources = root.querySelectorAll("[data-ph-hero-source]");
    var kicker = root.querySelector("[data-ph-hero-kicker]");
    var title = root.querySelector("[data-ph-hero-title]");
    var lead = root.querySelector("[data-ph-hero-lead]");
    var primary = root.querySelector("[data-ph-hero-primary]");
    if (!slides.length) return;
    var index = 0;
    var timer = 0;
    var delay = 6500;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function textOf(source, name) {
      var node = source.querySelector("[data-" + name + "]");
      return node ? node.textContent : "";
    }
    function show(next) {
      index = (next + slides.length) % slides.length;
      for (var i = 0; i < slides.length; i++) {
        var on = i === index;
        slides[i].classList.toggle("is-active", on);
        if (dots[i]) {
          dots[i].classList.toggle("is-active", on);
          if (on) dots[i].setAttribute("aria-current", "true");
          else dots[i].removeAttribute("aria-current");
        }
      }
      var source = sources[index];
      if (source && title) {
        if (kicker) kicker.textContent = textOf(source, "kicker");
        title.textContent = textOf(source, "title");
        if (lead) lead.textContent = textOf(source, "lead");
        if (primary) {
          primary.textContent = textOf(source, "label");
          primary.setAttribute("href", source.getAttribute("data-href") || "#collections");
        }
      }
    }
    function play() {
      if (timer) clearInterval(timer);
      timer = 0;
      if (reduce) return;
      timer = setInterval(function () { show(index + 1); }, delay);
    }
    var prev = root.querySelector("[data-ph-hero-prev]");
    var nextBtn = root.querySelector("[data-ph-hero-next]");
    if (prev) prev.addEventListener("click", function () { show(index - 1); play(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { show(index + 1); play(); });
    for (var d = 0; d < dots.length; d++) {
      dots[d].addEventListener("click", function () {
        show(parseInt(this.getAttribute("data-ph-hero-dot"), 10) || 0);
        play();
      });
    }
    root.addEventListener("mouseenter", function () { if (timer) clearInterval(timer); timer = 0; });
    root.addEventListener("mouseleave", play);
    root.addEventListener("focusin", function () { if (timer) clearInterval(timer); timer = 0; });
    root.addEventListener("focusout", function (event) {
      if (!root.contains(event.relatedTarget)) play();
    });
    show(0);
    play();
  }

  var WISHLIST_LEGACY_API = "/wishlists";
  var WISHLIST_STOREFRONT_API = "/storefront/api/v1/wishlists";
  var wishlistBusy = {};

  function wishlistVariantId(el) {
    return el.getAttribute("data-zs-wishlist-variant-id") || "";
  }

  function wishlistFeatureOn() {
    if (window.zs_wishlist_enabled === false) return false;
    if (window.is_portal_site === "false") return false;
    return true;
  }

  function wishlistSignedIn() {
    if (window.isLoggedInUser === true || window.isLoggedInUser === "true") return true;
    if (window.isLoggedInUser === false || window.isLoggedInUser === "false") return false;
    var html = document.documentElement;
    if (html.classList.contains("ph-auth-in")) return true;
    if (html.classList.contains("ph-auth-out") || html.classList.contains("ph-auth-pending")) return false;
    return true;
  }

  function markWishlist(el, on) {
    el.setAttribute("data-zs-wishlisted", on ? "true" : "false");
    el.classList.toggle("is-wishlisted", !!on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
    var label = el.querySelector(".ph-wish-label");
    if (label) label.textContent = on ? "Saved" : "Save to wishlist";
    var iconBtn = el.classList.contains("ph-wish-btn") ? el : null;
    if (iconBtn) iconBtn.setAttribute("aria-label", on ? "Remove from wishlist" : "Save to wishlist");
    if (window.zs_wishlist_variants) window.zs_wishlist_variants[wishlistVariantId(el)] = !!on;
  }

  function wishlistToast(message) {
    var toast = qs("[data-ph-wish-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "ph-wish-toast";
      toast.setAttribute("data-ph-wish-toast", "");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toast._phTimer);
    toast._phTimer = setTimeout(function () { toast.hidden = true; }, 3200);
  }

  function wishlistHeaders(extra) {
    var headers = extra ? Object.assign({}, extra) : {};
    if (window.zsUtils && zsUtils.getCSRFHeader) {
      Object.assign(headers, zsUtils.getCSRFHeader());
    } else {
      var csrfMatch = document.cookie.match(/(?:^|;\s*)csrfc=([^;]+)/);
      if (csrfMatch) headers["X-ZCSRF-TOKEN"] = "csrfp=" + decodeURIComponent(csrfMatch[1]);
    }
    return headers;
  }

  function wishlistCountsFrom(data) {
    if (!data || typeof data !== "object") return null;
    var candidates = [data.wishlists_count, data.payload && data.payload.wishlists_count,
      data.wishlists_count_map, data.payload && data.payload.wishlists,
      data.variants, data.payload && data.payload.variants];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c && typeof c === "object") return c;
    }
    if (Array.isArray(data.wishlist_variant_ids)) {
      var map = {};
      data.wishlist_variant_ids.forEach(function (id) { map[String(id)] = true; });
      return map;
    }
    return null;
  }

  function applyWishlistCounts(counts) {
    if (!counts) return;
    qsa("[data-zs-wishlist-element]").forEach(function (el) {
      var id = wishlistVariantId(el);
      if (id) markWishlist(el, !!counts[id] || !!counts[String(id)]);
    });
  }

  var wishBadgeCount = null;
  function wishlistBadgeEl() { return qs("[data-ph-wish-count]"); }
  function setWishlistBadge(count) {
    wishBadgeCount = Math.max(0, parseInt(count, 10) || 0);
    var badge = wishlistBadgeEl();
    if (!badge) return;
    badge.hidden = wishBadgeCount <= 0;
    badge.textContent = wishBadgeCount > 0 ? String(wishBadgeCount) : "";
  }
  function adjustWishlistBadge(delta) {
    var current = wishBadgeCount;
    if (current == null) {
      var badge = wishlistBadgeEl();
      var parsed = badge ? parseInt(badge.textContent, 10) : 0;
      current = isNaN(parsed) ? 0 : parsed;
    }
    setWishlistBadge(current + delta);
  }

  function syncWishlistState() {
    if (!wishlistFeatureOn()) return;
    if (!wishlistSignedIn()) return;
    var ids = [];
    qsa("[data-zs-wishlist-element]").forEach(function (el) {
      var id = wishlistVariantId(el);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (!ids.length) return;
    var chunks = [];
    for (var i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    chunks.forEach(function (chunk) {
      var query = "?variant_ids=" + chunk.map(encodeURIComponent).join(",");
      var urls = [
        WISHLIST_STOREFRONT_API + "/wishlist-enabled" + query,
        WISHLIST_LEGACY_API + "/wishlist-enabled" + query
      ];
      function readStatus(index) {
        if (index >= urls.length) return Promise.resolve(null);
        return window.fetch(urls[index], { credentials: "same-origin" }).then(function (res) {
        if (res.redirected && /\/signin/.test(res.url || "")) return null;
        if (!res.ok) {
          if (res.status === 404 || res.status === 405) return readStatus(index + 1);
          return null;
        }
        var type = res.headers.get("content-type") || "";
        if (type.indexOf("json") === -1) return null;
        return res.json();
        }).catch(function () {
          return readStatus(index + 1);
        });
      }
      readStatus(0).then(function (data) {
        applyWishlistCounts(wishlistCountsFrom(data));
      }).catch(function () {});
    });
  }

  function wishlistSigninRedirect() {
    window.location.href = "/signin?uri=" + encodeURIComponent(window.location.pathname + window.location.search);
  }

  function bindSearchSuggest() {
    var inputs = qsa('.ph-search input[name="q"], .ph-nav-search input[name="q"]');
    if (!inputs.length) return;
    function closeAll() {
      qsa("[data-ph-suggest]").forEach(function (box) { box.hidden = true; });
      inputs.forEach(function (input) { input.setAttribute("aria-expanded", "false"); });
    }
    inputs.forEach(function (input) {
      var form = input.closest("form");
      var box = form && form.querySelector("[data-ph-suggest]");
      if (!box) return;
      var timer = null;
      var seq = 0;
      input.addEventListener("input", function () {
        clearTimeout(timer);
        var query = (input.value || "").trim();
        if (query.length < 3) { box.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
        timer = setTimeout(function () {
          var mine = ++seq;
          box.hidden = false;
          box.classList.add("is-loading");
          box.innerHTML = '<p class="ph-suggest-status">Searching…</p>';
          input.setAttribute("aria-expanded", "true");
          fetch("/storefront/api/v1/products?search=" + encodeURIComponent(query), { credentials: "same-origin" })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
              if (mine !== seq) return;
              box.classList.remove("is-loading");
              var payload = data && data.payload;
              var products = payload && payload.products;
              if (!products || !products.length) { box.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
              var symbol = (payload.currency && payload.currency.symbol) || (window.zs_currency && (zs_currency.symbol || zs_currency.currency_symbol)) || "AED";
              var html = '<div class="ph-product-grid">';
              products.slice(0, 6).forEach(function (product) {
                var photo = "";
                var images = product.images || [];
                for (var i = 0; i < images.length; i++) {
                  if (images[i] && images[i].url && !images[i].is_placeholder_image) { photo = images[i].url + "/400x400"; break; }
                }
                var price = product.has_variant_price
                  ? symbol + product.starts_with + " – " + symbol + product.ends_with
                  : symbol + product.selling_price;
                html += '<article class="ph-product-card">'
                  + '<a href="' + esc(product.url || "#") + '">'
                  + '<div class="ph-product-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(product.name || "") + '" loading="lazy">' : "") + '</div>'
                  + '<div class="ph-card-body"><h3 class="ph-h3">' + esc(product.name || "") + '</h3><p class="ph-suggest-price">' + esc(price) + '</p></div>'
                  + '</a></article>';
              });
              html += '</div>';
              var action = form.getAttribute("action") || "/search";
              var sep = action.indexOf("?") === -1 ? "?" : "&";
              box.innerHTML = html + '<a class="ph-suggest-all" href="' + esc(action + sep + "q=" + encodeURIComponent(query)) + '">View all results</a>';
              box.hidden = false;
            })
            .catch(function () {
              if (mine !== seq) return;
              box.classList.remove("is-loading");
              box.hidden = true;
              input.setAttribute("aria-expanded", "false");
            });
        }, 300);
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { box.hidden = true; input.setAttribute("aria-expanded", "false"); input.blur(); }
      });
      input.addEventListener("focus", function () {
        if (box.innerHTML && (input.value || "").trim().length >= 3) { box.hidden = false; input.setAttribute("aria-expanded", "true"); }
      });
      box.addEventListener("click", function (event) {
        var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
        if (link) box.hidden = true;
      });
    });
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest("form.ph-search, form.ph-nav-search")) return;
      closeAll();
    });
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (form && form.querySelector && form.querySelector("[data-ph-suggest]")) closeAll();
    }, true);
  }

  function bindWishlist() {
    if (!wishlistFeatureOn()) {
      qsa("[data-zs-wishlist-element]").forEach(function (el) {
        el.hidden = true;
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      });
      return;
    }
    window.__phWishlistSync = syncWishlistState;
    syncWishlistState();
    window.setTimeout(syncWishlistState, 1500);
    document.addEventListener("click", function (event) {
      var target = event.target;
      var el = target && target.closest ? target.closest("[data-zs-wishlist-element]") : null;
      if (!el || el.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      var variantId = wishlistVariantId(el);
      if (!variantId) {
        wishlistToast("Select a size first.");
        return;
      }
      if (!wishlistSignedIn()) {
        wishlistSigninRedirect();
        return;
      }
      if (wishlistBusy[variantId]) return;
      var wishlisted = el.getAttribute("data-zs-wishlisted") === "true";
      var mutationUrls = [
        WISHLIST_STOREFRONT_API + "/variants",
        WISHLIST_LEGACY_API + "/variants"
      ];
      function sendMutation(index) {
        if (index >= mutationUrls.length) return Promise.reject(new Error("Wishlist endpoint unavailable"));
        var options = {
          credentials: "same-origin",
          headers: wishlistHeaders()
        };
        if (wishlisted) {
          options.method = "DELETE";
          options.url = mutationUrls[index] + "?variant_ids=" + encodeURIComponent(variantId);
        } else {
          options.method = "POST";
          options.url = mutationUrls[index];
          options.headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
          options.body = "variant_ids=" + encodeURIComponent(variantId);
        }
        return window.fetch(options.url, options).then(function (res) {
          if (res.redirected && /\/signin/.test(res.url || "")) {
            wishlistSigninRedirect();
            return null;
          }
          if (res.status === 401 || res.status === 403) {
            wishlistSigninRedirect();
            return null;
          }
          if (res.status === 404 || res.status === 405) return sendMutation(index + 1);
          if (!res.ok) throw new Error("wishlist request failed: " + res.status);
          var type = res.headers.get("content-type") || "";
          if (type.indexOf("json") === -1) throw new Error("Wishlist response was not JSON");
          return res.json();
        });
      }
      wishlistBusy[variantId] = true;
      qsa("[data-zs-wishlist-element]").forEach(function (peer) {
        if (wishlistVariantId(peer) === variantId) peer.disabled = true;
      });
      sendMutation(0).then(function (data) {
        if (data === null) return;
        var success = data && (
          data.status_code === 0 ||
          data.status_code === "0" ||
          (data.status_code == null && (
            data.code === 0 ||
            data.code === "0" ||
            data.success === true ||
            data.status === "success" ||
            data.status_message === "success"
          ))
        );
        if (!success) {
          var serverMsg = data && (data.status_message || data.message || data.developer_message);
          throw new Error("Wishlist request was rejected: " + (serverMsg || "unknown response") + " (status_code=" + (data && data.status_code) + ")");
        }
        qsa("[data-zs-wishlist-element]").forEach(function (peer) {
          if (wishlistVariantId(peer) === variantId) markWishlist(peer, !wishlisted);
        });
        adjustWishlistBadge(wishlisted ? -1 : 1);
        if (window.wishlist && window.wishlist.clearCache) window.wishlist.clearCache();
        syncWishlistState();
      }).catch(function (error) {
        console.warn("Wishlist request failed:", error);
        wishlistToast("Could not update your wishlist. Please try again.");
      }).finally(function () {
        wishlistBusy[variantId] = false;
        qsa("[data-zs-wishlist-element]").forEach(function (peer) {
          if (wishlistVariantId(peer) === variantId) peer.disabled = false;
        });
      });
    }, true);
    if (window.MutationObserver && document.body) {
      var wishQueue = [];
      var wishQueued = false;
      new MutationObserver(function (records) {
        var added = false;
        records.forEach(function (record) {
          for (var i = 0; i < record.addedNodes.length; i++) {
            var node = record.addedNodes[i];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches("[data-zs-wishlist-element]")) { added = true; break; }
            if (node.querySelector && node.querySelector("[data-zs-wishlist-element]")) { added = true; break; }
          }
        });
        if (!added || wishQueued) return;
        wishQueued = true;
        (window.requestAnimationFrame || window.setTimeout)(function () {
          wishQueued = false;
          syncWishlistState();
        });
      }).observe(document.body, { childList: true });
    }
  }

  function bindWishlistPage() {
    var list = qs("[data-ph-wish-list]");
    var signinNote = qs("[data-ph-wish-signin]");
    var emptyNote = qs("[data-ph-wish-empty]");
    function updateSigninNote() {
      if (!signinNote) return;
      signinNote.hidden = wishlistSignedIn() || !!qs("[data-ph-wish-card]");
    }
    updateSigninNote();
    window.setTimeout(updateSigninNote, 1500);
    if (signinNote && window.MutationObserver) {
      new MutationObserver(updateSigninNote).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    function toggleEmpty() {
      if (!emptyNote) return;
      var hasItems = !!qs("[data-ph-wish-card]");
      emptyNote.hidden = hasItems;
      if (list) list.hidden = !hasItems;
    }
    if (!list) { toggleEmpty(); return; }
    toggleEmpty();
    list.addEventListener("click", function (event) {
      var target = event.target;
      var removeBtn = target && target.closest ? target.closest("[data-ph-wish-remove]") : null;
      var addBtn = target && target.closest ? target.closest("[data-ph-wish-add]") : null;
      if (removeBtn) {
        event.preventDefault();
        var variantId = removeBtn.getAttribute("data-ph-wish-variant") || "";
        if (!variantId || removeBtn.disabled) return;
        removeBtn.disabled = true;
        fetch(WISHLIST_STOREFRONT_API + "/variants?variant_ids=" + encodeURIComponent(variantId), {
          method: "DELETE",
          credentials: "same-origin",
          headers: wishlistHeaders()
        }).then(function (res) {
          if (res.redirected && /\/signin/.test(res.url || "")) { wishlistSigninRedirect(); return null; }
          if (res.status === 401 || res.status === 403) { wishlistSigninRedirect(); return null; }
          if (!res.ok) throw new Error("wishlist remove failed: " + res.status);
          var type = res.headers.get("content-type") || "";
          return type.indexOf("json") === -1 ? { status_code: "0" } : res.json();
        }).then(function (data) {
          if (data === null) return;
          var success = data && (
            data.status_code === 0 ||
            data.status_code === "0" ||
            (data.status_code == null && data.status !== "failed")
          );
          if (!success) throw new Error("Wishlist remove was rejected");
          var card = removeBtn.closest("[data-ph-wish-card]");
          if (card) card.remove();
          adjustWishlistBadge(-1);
          if (window.wishlist && window.wishlist.clearCache) window.wishlist.clearCache();
          if (window.__phWishlistSync) window.__phWishlistSync();
          toggleEmpty();
        }).catch(function (error) {
          console.warn("Wishlist remove failed:", error);
          removeBtn.disabled = false;
          wishlistToast("Could not remove this item. Please try again.");
        });
        return;
      }
      if (addBtn) {
        event.preventDefault();
        var addVariantId = addBtn.getAttribute("data-ph-wish-variant") || "";
        if (!addVariantId || addBtn.disabled) return;
        if (!wishlistSignedIn()) { wishlistSigninRedirect(); return; }
        addBtn.disabled = true;
        fetch("/storefront/api/v1/cart", {
          method: "POST",
          headers: cartHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({ product_variant_id: addVariantId, quantity: "1" })
        }).then(function (res) { return res.json(); }).then(function (data) {
          var ok = data && ((data.payload && data.payload.items) || (data.cart_details && data.cart_details.items) || data.status_code === "0" || data.status_message === "success");
          addBtn.disabled = false;
          if (ok) {
            updateCartBadge(data);
            renderCartDrawer(data);
            openCartDrawer();
          } else {
            wishlistToast("Could not add this item to your selection.");
          }
        }).catch(function () {
          addBtn.disabled = false;
          wishlistToast("Could not add this item to your selection.");
        });
      }
    });
  }

  function bindQVContent(root) {
    var qv = qs("[data-ph-qv]", root);
    if (!qv) return;
    var priceEl = qs("[data-ph-qv-price]", qv);
    var addBtn = qs("[data-ph-qv-add]", qv);
    var productUrl = qv.getAttribute("data-zs-product-url") || "";
    var chips = qsa("[data-ph-qv-chip]", qv);
    function selectChip(chip) {
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var variantId = chip.getAttribute("data-ph-qv-variant") || "";
      var price = chip.getAttribute("data-ph-qv-chip-price");
      var chipOos = chip.hasAttribute("data-ph-qv-oos") || chip.disabled;
      if (addBtn) {
        addBtn.setAttribute("data-ph-qv-variant", variantId);
        addBtn.disabled = !!chipOos;
        addBtn.textContent = chipOos ? "Out of stock" : "Add to selection";
      }
      if (priceEl && price !== null && price !== "") priceEl.textContent = money(price);
      qsa("[data-zs-wishlist-element]", qv).forEach(function (el) {
        el.setAttribute("data-zs-wishlist-variant-id", variantId);
        markWishlist(el, false);
      });
      if (window.__phWishlistSync) window.__phWishlistSync();
    }
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () { selectChip(chip); });
    });
    var firstOpen = chips.filter(function (c) { return !c.disabled; })[0] || chips[0];
    if (firstOpen) selectChip(firstOpen);
    var qvMain = qs("[data-ph-qv-main]", qv);
    qsa("[data-ph-qv-thumb]", qv).forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        var src = thumb.getAttribute("data-ph-qv-thumb") || "";
        if (!src || !qvMain) return;
        var img = qvMain.querySelector("img");
        if (img) img.src = src;
        qsa("[data-ph-qv-thumb]", qv).forEach(function (t) {
          t.classList.toggle("is-active", t === thumb);
        });
      });
    });
    qsa("[data-ph-auth-wishlist]", qv).forEach(function (el) {
      if (wishlistSignedIn()) {
        el.hidden = false;
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    });
    if (addBtn) {
      addBtn.addEventListener("click", function (event) {
        event.preventDefault();
        var variantId = addBtn.getAttribute("data-ph-qv-variant") || "";
        if (!variantId) {
          if (productUrl) window.location.href = productUrl;
          return;
        }
        if (addBtn.disabled) return;
        addBtn.disabled = true;
        fetch("/storefront/api/v1/cart", {
          method: "POST",
          headers: cartHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({ product_variant_id: variantId, quantity: "1" })
        }).then(function (res) { return res.json(); }).then(function (data) {
          var ok = data && ((data.payload && data.payload.items) || (data.cart_details && data.cart_details.items) || data.status_code === "0" || data.status_message === "success");
          addBtn.disabled = false;
          if (ok) {
            updateCartBadge(data);
            renderCartDrawer(data);
            openCartDrawer();
          } else {
            wishlistToast("Could not add this specimen.");
          }
        }).catch(function () {
          addBtn.disabled = false;
          wishlistToast("Could not add this specimen.");
        });
      });
    }
  }

  function bindQuickView() {
    var overlay = qs("[data-ph-qv-overlay]");
    var modal = qs("#product_quick_look");
    if (!overlay || !modal) return;
    function closeQV() {
      modal.innerHTML = "";
      overlay.hidden = true;
      document.body.style.overflow = "";
    }
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay || (event.target.closest && event.target.closest("[data-ph-qv-close]"))) closeQV();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hidden) closeQV();
    });
    document.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest("[data-zs-quick-view]") : null;
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      var url = btn.getAttribute("data-zs-product-url") || "";
      if (!url) return;
      modal.innerHTML = '<p class="ph-qv-loading">Loading…</p>';
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
      fetch(url + (url.indexOf("?") === -1 ? "?" : "&") + "quick_look=true", { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) throw new Error("quick view failed: " + res.status);
          return res.text();
        })
        .then(function (html) {
          modal.innerHTML = html;
          bindQVContent(modal);
          if (window.__phWishlistSync) window.__phWishlistSync();
        })
        .catch(function (error) {
          console.warn("Quick view failed:", error);
          closeQV();
        });
    }, true);
  }

  function bindSaveForLater() {
    function flagOff() {
      return window.zs_saveforlater_enabled === false;
    }
    function applyFlag() {
      if (!flagOff()) return;
      qsa("[data-zs-save-for-later]").forEach(function (el) { el.hidden = true; });
      var section = qs("[data-ph-sfl]");
      if (section) section.hidden = true;
    }
    applyFlag();
    window.setTimeout(applyFlag, 1500);
  }

  function bindShare() {
    document.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("[data-ph-share-net]") : null;
      if (!link) return;
      var box = link.closest("[data-ph-share]");
      if (!box) return;
      event.preventDefault();
      var url = box.getAttribute("data-share-url") || window.location.href;
      var text = box.getAttribute("data-share-text") || document.title;
      var net = link.getAttribute("data-ph-share-net");
      var enc = encodeURIComponent;
      var shareUrl = "";
      if (net === "whatsapp") shareUrl = "https://wa.me/?text=" + enc(text + " " + url);
      else if (net === "facebook") shareUrl = "https://www.facebook.com/sharer/sharer.php?u=" + enc(url);
      else if (net === "x") shareUrl = "https://twitter.com/intent/tweet?text=" + enc(text) + "&url=" + enc(url);
      else if (net === "linkedin") shareUrl = "https://www.linkedin.com/sharing/share-offsite/?url=" + enc(url);
      else if (net === "copy") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { wishlistToast("Link copied."); });
        } else { wishlistToast(url); }
        return;
      }
      if (shareUrl) window.open(shareUrl, "_blank", "noopener,width=620,height=540");
    });
  }

  function bindCurrency() {
    var host = qs("[data-ph-currency]");
    var select = qs("[data-ph-currency-select]");
    if (!host || !select) return;
    function normalizeCurrency(c) {
      if (!c || typeof c !== "object") return null;
      var code = c.currency_code || c.code || c.currency || "";
      if (!code) return null;
      return {
        code: String(code),
        symbol: c.currency_symbol || c.symbol || c.currency_sign || code,
        name: c.currency_name || c.name || code
      };
    }
    fetch("/store-user/api/v1/currency/meta", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || String(data.status_code) !== "0") return;
        var payload = data.data || {};
        var list = payload.currencies || payload.currency_list || payload;
        if (!Array.isArray(list)) {
          list = Object.keys(list).map(function (k) { return list[k]; });
        }
        var currencies = list.map(normalizeCurrency).filter(Boolean);
        var unique = [];
        var seen = {};
        currencies.forEach(function (c) {
          if (!seen[c.code]) { seen[c.code] = true; unique.push(c); }
        });
        if (unique.length < 2) return;
        var current = (window.zs_currency && (zs_currency.code || zs_currency.currency_code)) || "";
        select.innerHTML = unique.map(function (c) {
          var label = c.symbol + " " + c.code + (c.name && c.name !== c.code ? " — " + c.name : "");
          return '<option value="' + esc(c.code) + '"' + (String(c.code) === String(current) ? " selected" : "") + ">" + esc(label) + "</option>";
        }).join("");
        select.hidden = false;
        host.hidden = false;
        select.addEventListener("change", function () {
          var code = select.value;
          if (!code) return;
          select.disabled = true;
          fetch("/storefront/api/v1/cart", {
            method: "PUT",
            credentials: "same-origin",
            headers: cartHeaders(),
            body: JSON.stringify({ currency_code: code })
          }).then(function () { window.location.reload(); }).catch(function () {
            select.disabled = false;
            wishlistToast("Could not change currency.");
          });
        });
      })
      .catch(function () {});
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function t(en, ar) {
    return document.documentElement.dir === "rtl" ? ar : en;
  }

  var JOB_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>';

  function jobMetaHtml(job, withArea) {
    var meta = [];
    if (withArea && job.area) meta.push('<span class="ph-job-tag">' + escHtml(job.area) + "</span>");
    if (job.location) meta.push('<span class="ph-job-chip">' + escHtml(job.location) + "</span>");
    if (job.type) meta.push('<span class="ph-job-chip">' + escHtml(job.type) + "</span>");
    if (job.experience) meta.push('<span class="ph-job-chip">' + escHtml(job.experience) + "</span>");
    return meta.length ? '<div class="ph-job-meta">' + meta.join("") + "</div>" : "";
  }

  function jobSearchText(job) {
    return [job.title, job.area, job.location, job.type, job.summary, job.experience,
      (job.responsibilities || []).join(" "), (job.requirements || []).join(" "), (job.benefits || []).join(" ")]
      .join(" ").toLowerCase();
  }

  var JOB_PAGE_PATH = "/job";

  function applyJob(job) {
    var target = qs("#apply");
    if (!target) {
      window.location.href = "/join-us?apply=" + encodeURIComponent(job.id || "") + "#apply";
      return;
    }
    var position = qs("#ph-j-position");
    if (position) position.value = job.title || "";
    var area = qs("#ph-j-area");
    var wanted = job.area || "";
    if (area && wanted) {
      var match = Array.from(area.options).filter(function (o) { return o.text === wanted; })[0];
      if (match) area.value = match.value || match.text;
    }
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function jobCardHtml(job) {
    var html = '<article class="ph-job-card" data-ph-job-card data-search="' + escHtml(jobSearchText(job)) + '">';
    html += '<div class="ph-job-card-top"><span class="ph-job-icon" aria-hidden="true">' + JOB_ICON + "</span>"
      + '<div class="ph-job-card-head"><h3 class="ph-h3">' + escHtml(job.title) + "</h3>"
      + (job.area ? '<p class="ph-job-card-area">' + escHtml(job.area) + "</p>" : "") + "</div></div>";
    html += jobMetaHtml(job, false);
    if (job.summary) html += '<p class="ph-copy ph-job-summary">' + escHtml(job.summary) + "</p>";
    html += '<div class="ph-job-foot">'
      + '<button type="button" style="color: #1f3d2b;" class="ph-btn ph-btn-ghost" data-ph-job-view data-job-id="' + escHtml(job.id || "") + '">' + t("View details", "عرض التفاصيل") + "</button>"
      + '<button type="button" class="ph-btn" data-ph-job-apply data-job-id="' + escHtml(job.id || "") + '">' + t("Apply", "قدّم") + "</button>"
      + "</div></article>";
    return html;
  }

  function jobDetailHtml(job) {
    var html = '<article class="ph-job-detail-card">';
    html += '<button type="button" class="ph-job-back" data-ph-job-back>← ' + t("Back to all positions", "العودة إلى كل الوظائف") + "</button>";
    html += '<div class="ph-job-detail-head"><span class="ph-job-icon ph-job-icon-lg" aria-hidden="true">' + JOB_ICON + "</span>"
      + "<div><h3 class=\"ph-h2\">" + escHtml(job.title) + "</h3>" + jobMetaHtml(job, true) + "</div></div>";
    if (job.summary) html += '<p class="ph-lead ph-job-detail-summary">' + escHtml(job.summary) + "</p>";
    html += '<div class="ph-job-detail-grid">';
    if (job.responsibilities && job.responsibilities.length) {
      html += '<div class="ph-job-block"><p class="ph-field-label">' + t("What you will do", "ماذا ستفعل") + '</p><ul>';
      job.responsibilities.forEach(function (r) { html += "<li>" + escHtml(r) + "</li>"; });
      html += "</ul></div>";
    }
    if (job.requirements && job.requirements.length) {
      html += '<div class="ph-job-block"><p class="ph-field-label">' + t("What we look for", "ما الذي نبحث عنه") + '</p><ul>';
      job.requirements.forEach(function (r) { html += "<li>" + escHtml(r) + "</li>"; });
      html += "</ul></div>";
    }
    html += "</div>";
    if (job.benefits && job.benefits.length) {
      html += '<div class="ph-job-block"><p class="ph-field-label">' + t("Benefits", "المزايا") + '</p><ul class="ph-job-benefits">';
      job.benefits.forEach(function (r) { html += "<li>" + escHtml(r) + "</li>"; });
      html += "</ul></div>";
    }
    html += '<div class="ph-job-detail-foot"><button type="button" class="ph-btn" data-ph-job-apply>' + t("Apply for this role", "قدّم على هذه الوظيفة") + "</button></div>";
    return html + "</article>";
  }

  function renderJobs(list, jobs, cbs) {
    list.innerHTML = jobs.map(jobCardHtml).join("");
    qsa("[data-ph-job-view]", list).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var job = jobs.filter(function (j) { return j.id === btn.getAttribute("data-job-id"); })[0];
        if (job && cbs && cbs.view) cbs.view(job);
      });
    });
    qsa("[data-ph-job-apply]", list).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var job = jobs.filter(function (j) { return j.id === btn.getAttribute("data-job-id"); })[0];
        if (job && cbs && cbs.apply) cbs.apply(job);
      });
    });
  }

  function bindJobs() {
    var visaToggle = qs("[data-ph-visa-toggle]");
    var visaTypeField = qs("[data-ph-visa-type-field]");
    if (visaToggle && visaTypeField) {
      visaToggle.addEventListener("change", function () {
        visaTypeField.hidden = visaToggle.value !== "Yes";
      });
    }
    var list = qs("[data-ph-jobs-list]");
    if (!list) return;
    var empty = qs("[data-ph-jobs-empty]");
    var search = qs("[data-ph-jobs-search]");
    var tools = search ? search.closest(".ph-jobs-tools") : null;
    var detail = qs("[data-ph-job-detail]");
    var isJobPage = !qs("#apply");
    var jobs = [];
    var currentJobId = null;

    var cbs = {
      view: function (job) {
        if (isJobPage) { showDetail(job); return; }
        window.location.href = JOB_PAGE_PATH + "?job=" + encodeURIComponent(job.id || "");
      },
      apply: function (job) { applyJob(job); }
    };

    function jobById(id) {
      return jobs.filter(function (j) { return j.id === id; })[0] || null;
    }

    function applyFilter() {
      var q = ((search && search.value) || "").trim().toLowerCase();
      var visible = 0;
      qsa("[data-ph-job-card]", list).forEach(function (card) {
        var show = !q || (card.getAttribute("data-search") || "").indexOf(q) >= 0;
        card.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.hidden = visible > 0 || !jobs.length;
      if (tools) tools.hidden = !jobs.length;
    }

    function showList(push) {
      currentJobId = null;
      if (detail) { detail.hidden = true; detail.innerHTML = ""; }
      list.hidden = false;
      if (tools) tools.hidden = false;
      if (empty) empty.hidden = jobs.length === 0 ? false : (search && search.value.trim() !== "" ? false : true);
      applyFilter();
      if (push !== false && window.history && window.history.pushState) {
        var url = window.location.pathname;
        window.history.pushState({ phJob: null }, "", url);
      }
    }

    function showDetail(job, push) {
      currentJobId = job.id || null;
      if (detail) {
        detail.innerHTML = jobDetailHtml(job);
        detail.hidden = false;
        qsa("[data-ph-job-apply]", detail).forEach(function (btn) {
          btn.addEventListener("click", function () { applyJob(job); });
        });
        var back = qs("[data-ph-job-back]", detail);
        if (back) back.addEventListener("click", function () { showList(); });
      }
      list.hidden = true;
      if (tools) tools.hidden = true;
      if (empty) empty.hidden = true;
      if (push !== false && window.history && window.history.pushState) {
        window.history.pushState({ phJob: job.id }, "", window.location.pathname + "?job=" + encodeURIComponent(job.id));
      }
      if (detail) detail.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    function syncFromUrl() {
      var params = new URLSearchParams(window.location.search);
      var id = params.get("job");
      if (!id) { if (currentJobId) showList(false); return; }
      var job = jobById(id);
      if (job) showDetail(job, false);
    }

    function start(jobsData) {
      jobs = (jobsData && jobsData.jobs) || [];
      if (!jobs.length) { if (empty) empty.hidden = false; return; }
      renderJobs(list, jobs, cbs);
      if (search) search.addEventListener("input", applyFilter);
      window.addEventListener("popstate", syncFromUrl);
      applyFilter();
      syncFromUrl();
      var applyId = new URLSearchParams(window.location.search).get("apply");
      if (applyId) {
        var applyJobFound = jobById(applyId);
        if (applyJobFound) applyJob(applyJobFound);
      }
    }
    var urlEl = qs("[data-ph-jobs-url]");
    var url = urlEl && urlEl.getAttribute("data-ph-jobs-url");
    if (url) {
      window.fetch(url, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(start).catch(function () { start(null); });
      return;
    }
    var dataEl = qs("[data-ph-jobs-data]");
    try { start(dataEl ? JSON.parse(dataEl.textContent) : null); }
    catch (err) { start(null); }
  }

  ready(function () {
    if (window.__phThemeBound) return;
    window.__phThemeBound = true;
    bindHero();
    stripNoise(document.body);
    upgradeStoreImages(document.body);
    markCurrentNav();
    tidyCategoryCatalog();
    fillProductImages();
    fillPagePhotos();
    fillFileSlots();
    fillMissingCatPhotos();
    bindProductBuy();
    bindSearchSuggest();
    bindWishlist();
    bindWishlistPage();
    bindQuickView();
    bindSaveForLater();
    bindShare();
    bindCurrency();
    bindJobs();
    bindFilters();
    bindCart();
    bindCartDrawer();
    loadCartBadge();
  });
})();


(function () {
  if (!document.querySelector(".theme-portal-form-container")) return;
  var pageCss = "html,body{background:#f7f4ec!important;color:#1b3022!important;font-family:Montserrat,Trebuchet MS,sans-serif!important}" +
    ".theme-header{background:#fff;border-bottom:1px solid rgba(27,48,34,.08);padding:10px 0 6px}" +
    ".theme-logo-parent{text-align:center}" +
    ".theme-logo-parent img,img[data-zs-logo]{height:108px!important;width:auto!important;max-width:280px!important;object-fit:contain;mix-blend-mode:multiply;background:transparent!important}" +
    ".theme-site-name,.theme-site-name-caption,.theme-responsive-goback{display:none!important}" +
    ".theme-portal-form-container{max-width:460px;margin:36px auto 72px;background:#fff;border:1px solid rgba(27,48,34,.1);box-shadow:0 12px 40px rgba(27,48,34,.06);padding:8px 28px 22px}" +
    ".signin-iframe{width:100%!important;min-height:230px;border:0;background:#fff}" +
    ".theme-noaccount-signup{text-align:center;color:#324a36;font-size:13px}" +
    ".theme-noaccount-signup span{display:block;margin:8px 0}" +
    ".theme-noaccount-signup a{color:#1b3022;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:12px;text-decoration:none}" +
    ".theme-noaccount-signup a:hover{color:#c39b3e}";
  var style = document.createElement("style");
  style.id = "ph-portal-page";
  style.textContent = pageCss;
  document.head.appendChild(style);
  var frameCss = "html,body,.bg_one,.signin_container,.signin_box{background:#fff!important;color:#1b3022!important;font-family:Montserrat,Trebuchet MS,sans-serif!important}" +
    ".signin_head,.service_name,.titlename,.username,.hellouser,#headtitle,#trytitle{color:#1b3022!important}#headtitle{font-weight:700;font-size:22px;letter-spacing:.04em}" +
    ".textbox{border:1px solid #d7d0c4!important;border-radius:0!important;color:#1b3022!important;background:#fff!important;font-family:Montserrat,Trebuchet MS,sans-serif!important}" +
    ".btn.blue,#nextbtn,button.btn{background:#c39b3e!important;border:0!important;color:#1b3022!important;border-radius:0!important;font-weight:700!important;letter-spacing:.08em;text-transform:uppercase}" +
    "a,.bluetext{color:#1b3022!important}" +
    "a:hover,.bluetext:hover{color:#c39b3e!important}";
  function paint(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.head || doc.getElementById("ph-portal-frame")) return;
      var s = doc.createElement("style");
      s.id = "ph-portal-frame";
      s.textContent = frameCss;
      doc.head.appendChild(s);
    } catch (err) {}
  }
  var frame = document.querySelector("iframe");
  if (!frame) return;
  paint(frame);
  frame.addEventListener("load", function () { paint(frame); });
})();


(function () {
  var grid = document.querySelector("[data-ph-subcat-grid]");
  if (grid) {
    var products = [].slice.call(document.querySelectorAll('a[href*="/products/"]'));
    [].slice.call(grid.querySelectorAll("[data-ph-cat-id]")).forEach(function (card) {
      var heading = card.querySelector("h3,.ph-h3");
      var name = ((heading ? heading.textContent : card.textContent) || "").split("|")[0].trim().toLowerCase();
      if (!name) return;
      var match = products.filter(function (a) {
        return a !== card && (a.textContent || "").toLowerCase().indexOf(name) >= 0;
      })[0];
      if (!match) return;
      card.setAttribute("href", match.getAttribute("href"));
      var more = card.querySelector(".ph-more");
      if (more) more.textContent = "View specimen";
    });
    return;
  }
  if (location.pathname.indexOf("/categories/") < 0) return;
  var only = [].slice.call(document.querySelectorAll('.ph-product-grid a[href*="/products/"]'));
  if (only.length === 1) location.replace(only[0].getAttribute("href"));
})();

/* Language switch (English / Arabic), cookie-bar spacing and sign-in page layout. */
(function () {
  var KEY = "ph_lang_v2";
  var AR = {
    "Explore our plant collections": "تصفّح مجموعاتنا النباتية",
    "Since 2004, Pheladelfia has grown palms, trees and plants in Al Ajban, Abu Dhabi. Join a team that values safety, quality and care for the environment.": "منذ 2004، تزرع فلادلفيا النخيل والأشجار والنباتات في العجبان بأبوظبي. انضم إلى فريق يقدّر السلامة والجودة والعناية بالبيئة.",
    "Choose a collection to explore plant species and the sizes listed in our online store.": "اختر مجموعة لتصفّح أنواع النباتات والمقاسات المدرجة في متجرنا الإلكتروني.",
    "Garden supplies and more": "مستلزمات الحدائق والمزيد",
    "Explore additional nursery supplies and contact our team to confirm availability for your project.": "تصفّح مستلزمات المشتل الإضافية وتواصل مع فريقنا لتأكيد توفرها لمشروعك.",
    "Collection": "مجموعة",
    "Talk to our nursery team about plant selection, current availability and project supply.": "تواصل مع فريق المشتل لاختيار النباتات وتأكيد توفرها وتنسيق توريد مشروعك.",
    "Explore palms, trees and ground covers, and ask our team about current nursery availability.": "تصفّح النخيل والأشجار ونباتات التغطية، واسأل فريقنا عن المتوفر حاليًا في المشتل.",
    "Discuss specimen sizes, quantities and delivery schedules with our project supply team.": "ناقش المقاسات والكميات ومواعيد التسليم مع فريق توريد المشاريع.",
    "Nursery: Farm 563 & 564, Al Ajban, Abu Dhabi": "المشتل: مزرعة 563 و564، العجبان، أبوظبي",
    "Out of stock — enquire about availability": "غير متوفر — استفسر عن إمكانية التوريد",
    "Al Ajban": "العجبان",
    "Abu Dhabi nursery": "مشتل أبوظبي",
    "Our branch": "فرعنا",
    "Dubai": "دبي",
    "Warsan, Dubai": "الورسان، دبي",
    "27 April 2029": "27 أبريل 2029",
    "Your email address": "بريدك الإلكتروني",
    "Decrease quantity": "تقليل الكمية",
    "Increase quantity": "زيادة الكمية",
    "Quantity": "الكمية",
    "Rows of mature Washingtonia palms at the Pheladelfia nursery in Abu Dhabi": "صفوف نخيل واشنطونيا في مشتل فلادلفيا بأبوظبي",
    "Fan palms at the Pheladelfia nursery": "نخيل مروحي في مشتل فلادلفيا",
    "Native Ghaf tree": "شجرة غاف محلية",
    "Specimen palm tree": "نخلة مختارة",
    "Flowering bougainvillea shrub": "شجيرة جهنمية مزهرة",
    "Indoor ornamental plants": "نباتات زينة داخلية",
    "Plant pots and garden supplies": "أصص ومستلزمات حدائق",
    "Grounds maintenance crew": "فريق صيانة المساحات الخضراء",
    "Interior plant maintenance": "العناية بالنباتات الداخلية",
    "A specimen fan palm at our nursery": "نخلة مروحية مختارة في مشتلنا",
    "Fresh Flowers and Bouquets": "زهور طبيعية وباقات ورد",
    "Seeds and Planting Stock": "بذور وتقاوي",
    "Fertilizers and Soil Amendments": "أسمدة ومصلحات زراعية",
    "Art and Sculptures": "فنون ومنحوتات",
    "Tools and Equipment": "أدوات ومعدات",
    "Courtyard planting": "زراعة الأفنية",
    "Courtyard planting inspiration": "أفكار لزراعة الأفنية",
    "Hospitality inspiration": "أفكار للمساحات الفندقية",
    "Garden planting": "زراعة الحدائق",
    "Garden planting inspiration": "أفكار لزراعة الحدائق",
    "Residential inspiration": "أفكار للحدائق السكنية",
    "Washingtonia palms": "نخيل واشنطونيا",
    "Washingtonia nursery palms": "نخيل واشنطونيا في المشتل",
    "Nursery collection": "تشكيلة المشتل",
    "Indoor greenery": "نباتات داخلية",
    "Indoor planting inspiration": "أفكار للزراعة الداخلية",
    "Interior inspiration": "أفكار للمساحات الداخلية",
    "Maintenance inspiration": "أفكار للصيانة",
    "Date palms": "نخيل التمر",
    "Palm collection": "تشكيلة النخيل",
    "Native Ghaf trees": "أشجار غاف محلية",
    "Native planting inspiration": "أفكار للزراعة المحلية",
    "Terrace planting": "زراعة الشرفات",
    "Terrace planting inspiration": "أفكار لزراعة الشرفات",
    "Terrace inspiration": "أفكار للشرفات",

    "Premium Palms & Trees — Grown & sourced for the UAE": "نخيل وأشجار فاخرة — مُزرعة ومُورَّدة للإمارات",
    "Agricultural LLC": "الزراعية ذ.م.م",
    "Account": "حسابي",
    "Shop palms": "تسوّق النخيل",
    "Exclusive of 5% VAT · Delivered across the UAE": "غير شامل ضريبة القيمة المضافة 5% · توصيل لجميع أنحاء الإمارات",
    "Shop": "المتجر",
    "Company": "الشركة",
    "About us": "من نحن",
    "My account": "حسابي",
    "Visit & contact": "الزيارة والتواصل",
    "Pheladelfia Agricultural LLC. All rights reserved.": "فلادلفيا الزراعية ذ.م.م. جميع الحقوق محفوظة.",
    "Prices in AED, excluding 5% VAT.": "الأسعار بالدرهم الإماراتي، وغير شاملة ضريبة القيمة المضافة 5%.",
    "Search palms, trees, shrubs…": "ابحث عن النخيل والأشجار والشجيرات…",
    "Your cart": "سلتك",
    "Pheladelfia home": "فلادلفيا — الرئيسية",
    "Pheladelfia Agricultural LLC": "فلادلفيا الزراعية ذ.م.م",
    "Previous": "السابق",
    "Next": "التالي",
    "From our nursery": "من مشتلنا",
    "Explore our plants": "اكتشف نباتاتنا",
    "Loading plants…": "جارٍ تحميل النباتات…",
    "Browse collections": "تصفّح المجموعات",
    "PHELADELFIA AGRICULTURAL LLC": "فلادلفيا الزراعية ذ.م.م",
    "Pheladelfia Agricultural": "فلادلفيا الزراعية",
    "Pheladelfia": "فلادلفيا",
    "All categories": "جميع الفئات",
    "Outdoor": "خارجي",
    "Indoor": "داخلي",
    "Search": "بحث",
    "What are you looking for?": "عمّ تبحث؟",
    "Inquire": "استفسار",
    "Sign in": "تسجيل الدخول",
    "Register": "إنشاء حساب",
    "Your selection": "اختياراتك",
    "Open menu": "فتح القائمة",
    "Main": "القائمة الرئيسية",
    "Collections": "المجموعات",
    "All collections": "جميع المجموعات",
    "Browse every collection": "تصفّح جميع المجموعات",
    "Outdoor Plants": "النباتات الخارجية",
    "Indoor & Decor": "النباتات الداخلية والديكور",
    "Garden & Nursery Supply": "مستلزمات الحدائق والمشتل",
    "Palm Trees": "النخيل",
    "Trees": "الأشجار",
    "Rare & Ancient Trees": "الأشجار النادرة والمعمّرة",
    "Rare and Ancient Trees": "الأشجار النادرة والمعمّرة",
    "Large, Rare & Ancient Trees": "الأشجار الكبيرة النادرة والمعمّرة",
    "Large, Rare and Ancient Trees": "الأشجار الكبيرة النادرة والمعمّرة",
    "Cacti & Succulents": "الصباريات والعصاريات",
    "Cacti and Succulents": "الصباريات والعصاريات",
    "Shrubs & Ground Cover": "الشجيرات ونباتات التغطية الأرضية",
    "Shrubs and Ground Cover": "الشجيرات ونباتات التغطية الأرضية",
    "Climbers": "المتسلقات",
    "Indoor Plants": "النباتات الداخلية",
    "Indoor Ornamental Plants": "نباتات الزينة الداخلية",
    "Indoor Ornamentals": "نباتات الزينة الداخلية",
    "Fresh Flowers": "الزهور الطبيعية",
    "Fresh Flowers & Bouquets": "الزهور الطبيعية وباقات الورد",
    "Artificial Plants": "نباتات اصطناعية",
    "Garden Supply": "مستلزمات الحدائق",
    "Fertilizers & Soil": "الأسمدة والتربة",
    "Fertilizers & Soil Amendments": "الأسمدة والمصلحات الزراعية",
    "Seeds & Planting Stock": "البذور والتقاوي",
    "Tools & Equipment": "الأدوات والمعدات",
    "Art & Sculptures": "القسم الفني والمنحوتات",
    "Washingtonia robusta": "واشنطونيا روبوستا",
    "Direct Use Purchases": "مشتريات للاستخدام المباشر",
    "Small Tools & Consumables": "أدوات ومواد استهلاكية",
    "Home": "الرئيسية",
    "About": "من نحن",
    "Nursery": "المشتل",
    "Blog": "المدونة",
    "Journal": "المدونة",
    "Contact": "تواصل معنا",
    "Where Nature": "حيث تصبح الطبيعة",
    "Becomes Legacy": "إرثًا خالدًا",
    "Where Nature Becomes Legacy": "حيث تصبح الطبيعة إرثًا خالدًا",
    "A premium nursery in the UAE": "مشتل متميز في دولة الإمارات",
    "Abu Dhabi | Since 2004": "أبوظبي | منذ 2004",
    "Visit the nursery": "زيارة المشتل",
    "Established in Abu Dhabi": "تأسست في أبوظبي",
    "1.5M ft²": "1.5 مليون قدم²",
    "Specialist nursery footprint in Al Ajban": "مساحة مشتل متخصص في العجبان",
    "UAE & GCC": "الإمارات ودول الخليج",
    "Regional project and supply reach": "امتداد إقليمي للمشاريع والتوريد",
    "Continental Sourcing": "توريد من عدة قارات",
    "Europe, Asia and the Middle East": "أوروبا وآسيا والشرق الأوسط",
    "Specimen Focused Expertise": "خبرة متخصصة في العينات النباتية",
    "Mature trees, palms and architectural plants": "أشجار ناضجة ونخيل ونباتات معمارية",
    "Project Scaled Capability": "قدرات بحجم المشاريع",
    "From individual statement pieces to large planting programmes": "من القطع المميزة الفردية إلى برامج الزراعة الكبيرة",
    "Management-System Certification": "شهادات أنظمة الإدارة",
    "Achieved Internationally Recognised Certifications": "حاصلون على شهادات معترف بها دوليًا",
    "Featured collections": "المجموعات المميزة",
    "Outdoor": "خارجي",
    "Indoor": "داخلي",
    "Sculptures": "المنحوتات",
    "Ornamental plants, fresh flowers and artificial greenery for interiors.": "نباتات زينة وزهور طبيعية ونباتات اصطناعية للديكور الداخلي.",
    "Sculptures and art pieces for gardens and landmark projects.": "منحوتات وقطع فنية للحدائق والمشاريع.",
    "Explore outdoor plants": "استكشف النباتات الخارجية",
    "Explore indoor plants": "استكشف النباتات الداخلية",
    "View sculptures": "عرض المنحوتات",
    "View collections": "عرض المجموعات",
    "Previous slide": "الشريحة السابقة",
    "Next slide": "الشريحة التالية",
    "Outdoor and indoor collections": "مجموعات النباتات الخارجية والداخلية",
    "Plants and trees selected to bring life and beauty to your spaces.": "نباتات وأشجار تضيف الحياة والجمال إلى مساحاتك.",
    "Global Sourcing Network": "شبكة توريد عالمية",
    "Selected at origin. Linked to Pheladelfia Nursery, Abu Dhabi.": "مختارة من بلد المنشأ ومرتبطة بمشتل فلادلفيا في أبوظبي.",
    "Every origin on this map connects to our nursery in Al Ajban, Abu Dhabi — where stock is received, grown on and prepared for project delivery.": "كل مصدر على هذه الخريطة مرتبط بمشتلنا في العجبان، أبوظبي — حيث يتم استلام النباتات ورعايتها وتجهيزها لتسليم المشاريع.",
    "Mediterranean & Europe": "البحر المتوسط وأوروبا",
    "Spain · Italy · The Netherlands · Greece · Turkey": "إسبانيا · إيطاليا · هولندا · اليونان · تركيا",
    "GCC & Middle East": "الخليج والشرق الأوسط",
    "Saudi Arabia · Jordan · Egypt · Qatar · Bahrain · Oman · Syria · Lebanon": "السعودية · الأردن · مصر · قطر · البحرين · عُمان · سوريا · لبنان",
    "Africa": "أفريقيا",
    "Morocco · South Africa": "المغرب · جنوب أفريقيا",
    "Asia": "آسيا",
    "China · Thailand · Vietnam · Japan · Malaysia": "الصين · تايلاند · فيتنام · اليابان · ماليزيا",
    "South America": "أمريكا الجنوبية",
    "Brazil · Paraguay": "البرازيل · باراغواي",
    "+971 2 555 1662 · nursery@pheladelfia.com · Farm No. 563 & 564, Al Ajban, Muwailih, Abu Dhabi": "+971 2 555 1662 · nursery@pheladelfia.com · مزرعة رقم 563 و564، العجبان، مويلح، أبوظبي",
    "Key Clients & Project Stakeholders": "أبرز العملاء وشركاء المشاريع",
    "Presidential Court": "ديوان الرئاسة",
    "ADNOC": "أدنوك",
    "Abu Dhabi Municipality": "بلدية أبوظبي",
    "Dubai Municipality": "بلدية دبي",
    "Aldar": "الدار",
    "Nakheel": "نخيل",
    "DAMAC": "داماك",
    "Modon": "مدن",
    "Silal": "سلال",
    "Al Naboodah": "النابودة",
    "Rixos": "ريكسوس",
    "Al Fattan": "الفتان",
    "Subtotal": "المجموع الفرعي",
    "Exclusive of 5% VAT · Held at Al Ajban nursery": "غير شامل ضريبة القيمة المضافة 5% · محفوظة في مشتل العجبان",
    "Continue to checkout": "متابعة إلى الدفع",
    "View full selection": "عرض كامل الاختيارات",
    "Close selection": "إغلاق",
    "Abu Dhabi · Since 2004": "أبوظبي · منذ 2004",
    "Farm No. 563 & 564, Al Ajban, Muwailih, Abu Dhabi": "مزرعة رقم 563 و564، العجبان، مويلح، أبوظبي",
    "Explore": "استكشف",
    "Catalog": "الكتالوج",
    "Send an inquiry": "أرسل استفسارًا",
    "Instagram": "إنستغرام",
    "Facebook": "فيسبوك",
    "LinkedIn": "لينكدإن",
    "TikTok": "تيك توك",
    "Snapchat": "سناب شات",
    "Pinterest": "بنترست",
    "Connect sales": "تواصل مع المبيعات",
    "Since 2004 · Where Nature Becomes Legacy": "منذ 2004 · حيث تصبح الطبيعة إرثًا خالدًا",
    "3 Continents": "3 قارات",
    "Sourcing Europe, Asia and the Middle East": "توريد من أوروبا وآسيا والشرق الأوسط",
    "Capability and stewardship": "القدرة والمسؤولية",
    "Specimen-focused expertise covers mature trees, palms and architectural plants, from individual statement pieces to large planting programmes. Grow-to-order programmes and specimen documentation are managed from Abu Dhabi: specimen code, botanical and common name, origin, height, trunk dimensions and availability.": "تشمل خبرتنا المتخصصة الأشجار الناضجة والنخيل والنباتات المعمارية، من القطع المميزة الفردية إلى برامج الزراعة الكبيرة. وتُدار برامج الزراعة حسب الطلب وتوثيق العينات من أبوظبي: رمز العينة، والاسم العلمي والشائع، والمنشأ، والارتفاع، وأبعاد الجذع، والتوفر.",
    "Certifications": "الشهادات",
    "Begin with the right botanical material": "ابدأ بالمادة النباتية المناسبة",
    "The Nursery": "المشتل",
    "The nursery": "المشتل",
    "The Operational Heart of Pheladelfia": "القلب التشغيلي لفلادلفيا",
    "More than 1.5 million square feet in Al Ajban, Abu Dhabi.": "أكثر من 1.5 مليون قدم مربع في العجبان، أبوظبي.",
    "Curation. Cultivation. Delivery.": "انتقاء. زراعة. تسليم.",
    "Located in Al Ajban, Abu Dhabi, Pheladelfia's specialist nursery is where plants are propagated, grown, received, inspected, organised and prepared for project requirements.": "يقع مشتل فلادلفيا المتخصص في العجبان بأبوظبي، وفيه يتم إكثار النباتات وزراعتها واستلامها وفحصها وتنظيمها وتجهيزها وفق متطلبات المشاريع.",
    "It also provides the controlled space necessary for imported material to adapt to local environmental conditions before final selection and delivery.": "كما يوفر المساحة المضبوطة اللازمة لتتأقلم النباتات المستوردة مع الظروف البيئية المحلية قبل الاختيار النهائي والتسليم.",
    "Botanical Curation": "الانتقاء النباتي",
    "Nursery Cultivation": "الزراعة في المشتل",
    "Propagated, grown, received, inspected and acclimatised across more than 1.5 million square feet.": "إكثار وزراعة واستلام وفحص وأقلمة على مساحة تزيد عن 1.5 مليون قدم مربع.",
    "Project Logistics": "الخدمات اللوجستية للمشاريع",
    "Quality control, technical coordination, import and export, and establishment guidance.": "مراقبة الجودة والتنسيق الفني والاستيراد والتصدير وإرشادات الغرس.",
    "Arrange a nursery visit": "رتّب زيارة للمشتل",
    "Visit our nursery, share your planting schedule or speak with our team.": "زر مشتلنا، أو شاركنا جدول الزراعة، أو تحدّث مع فريقنا.",
    "Farm No. 563 & 564": "مزرعة رقم 563 و564",
    "Al Ajban, Muwailih": "العجبان، مويلح",
    "Abu Dhabi": "أبوظبي",
    "Name": "الاسم",
    "Email": "البريد الإلكتروني",
    "Contact Number": "رقم التواصل",
    "Type of Inquiry": "نوع الاستفسار",
    "Specimen supply": "توريد عينات",
    "Grow to order": "زراعة حسب الطلب",
    "Nursery visit": "زيارة المشتل",
    "Project consultation": "استشارة مشروع",
    "Message": "الرسالة",
    "Submit Inquiry": "إرسال الاستفسار",
    "Collection": "المجموعة",
    "Species and sub-collections": "الأنواع والمجموعات الفرعية",
    "View specimens": "عرض العينات",
    "View specimen": "عرض العينة",
    "View species": "عرض الأنواع",
    "View collection": "عرض المجموعة",
    "Parent collection": "مجموعة رئيسية",
    "Living collections": "مجموعات حيّة",
    "Nursery support": "دعم المشتل",
    "Botanical parents from the Books catalog": "الفئات النباتية الرئيسية من كتالوجنا",
    "Each card is a Zoho Books category. Species such as Washingtonia robusta sit underneath their parent, then open into sized specimens.": "كل بطاقة تمثل فئة من الكتالوج. تندرج الأنواع مثل واشنطونيا روبوستا تحت فئتها الرئيسية، ثم تتفرع إلى عينات بمقاسات مختلفة.",
    "Architectural palms. Open this collection to reach species such as Washingtonia robusta.": "نخيل معماري. افتح هذه المجموعة للوصول إلى أنواع مثل واشنطونيا روبوستا.",
    "Heritage olives and monumental specimens with documented character.": "زيتون تراثي وعينات ضخمة ذات طابع موثّق.",
    "Sculptural desert forms, including yucca and monumental cacti.": "أشكال صحراوية نحتية، منها اليوكا والصبار الضخم.",
    "Mass planting, edges and ground plane for complete schemes.": "زراعة كثيفة وحواف وتغطية أرضية لمخططات متكاملة.",
    "Vertical greening for walls, pergolas and architectural screens.": "تخضير عمودي للجدران والعرائش والواجهات المعمارية.",
    "Cut flowers and arrangements for events and hospitality.": "زهور مقطوفة وتنسيقات للمناسبات والضيافة.",
    "These parents stay off the homepage signature row. They remain available here for project supply.": "هذه الفئات غير معروضة في الصفحة الرئيسية، لكنها متاحة هنا لتوريد المشاريع.",
    "Botanical forms for controlled or interior settings.": "أشكال نباتية للأماكن المغلقة والداخلية.",
    "Propagation material and grow-to-order stock.": "مواد إكثار ومخزون يُزرع حسب الطلب.",
    "Soil and nutrition for establishment and aftercare.": "تربة وتغذية للغرس والعناية اللاحقة.",
    "Nursery tools, consumables and direct purchases.": "أدوات المشتل والمواد الاستهلاكية والمشتريات المباشرة.",
    "Every category in the Pheladelfia online store, from palms and specimen trees to indoor plants, garden supply and art. Open a collection to see its species and sized specimens.": "جميع فئات متجر فلادلفيا الإلكتروني، من النخيل والأشجار المميزة إلى النباتات الداخلية ومستلزمات الحدائق والفنون. افتح أي مجموعة لعرض أنواعها وعيناتها بمقاساتها المختلفة.",
    "Categories": "الفئات",
    "WASHINGTONIA ROBUSTA": "واشنطونيا روبوستا",
    "Size": "المقاس",
    "Select Size": "اختر المقاس",
    "Add to selection": "أضف إلى اختياراتك",
    "View selection": "عرض الاختيارات",
    "Save to wishlist": "حفظ في قائمة الأمنيات",
    "Saved": "محفوظ",
    "Stock held at Farm 563 & 564, Al Ajban, Abu Dhabi": "المخزون متوفر في المزرعة 563 و564، العجبان، أبوظبي",
    "Clear-trunk (CT) heights, priced per specimen": "ارتفاعات الجذع الصافي (CT)، والسعر لكل عينة",
    "Exclusive of 5% VAT · Sold as NOS": "غير شامل ضريبة القيمة المضافة 5% · يباع بالقطعة",
    "Available": "متوفر",
    "Out of stock": "غير متوفر",
    "Select a size first.": "اختر المقاس أولًا.",
    "Could not add this specimen.": "تعذّرت إضافة هذه العينة.",
    "Could not load your selection. You can view the cart page instead.": "تعذّر تحميل اختياراتك. يمكنك فتح صفحة السلة بدلًا من ذلك.",
    "Specimen": "عينة",
    "Summary": "الملخص",
    "Keep browsing": "متابعة التصفح",
    "Search Products": "البحث عن المنتجات",
    "Don't have an account?": "ليس لديك حساب؟",
    "Sign Up": "إنشاء حساب",
    "Sign In": "تسجيل الدخول",
    "Forgot Password": "نسيت كلمة المرور؟",
    "Menu": "القائمة",
    "Close menu": "إغلاق القائمة",
    "Show sub-menu": "عرض القائمة الفرعية",
    "Social media": "وسائل التواصل الاجتماعي",
    "Pheladelfia Agricultural LLC": "فلادلفيا الزراعية ذ.م.م",
    "All rights reserved": "جميع الحقوق محفوظة",
    "Welcome back": "مرحبًا بعودتك",
    "Sign in to follow your selections, quotations and orders.": "سجّل الدخول لمتابعة اختياراتك وعروض الأسعار وطلباتك.",
    "Back to the store": "العودة إلى المتجر",
    "Explore collections": "تصفّح المجموعات",
    "About Pheladelfia": "عن فلادلفيا",
    "Our story": "قصتنا",
    "More than plant supply": "أكثر من مجرد توريد نباتات",
    "Considered selection": "اختيار مدروس",
    "Grow-to-order and documentation": "الزراعة حسب الطلب والتوثيق",
    "Climate-responsive stewardship": "مسؤولية متوافقة مع المناخ",
    "How we work": "كيف نعمل",
    "Also in the Books catalog": "متوفر أيضًا في كتالوجنا",
    "Back to collections": "العودة إلى المجموعات",
    "Details": "التفاصيل",
    "Species": "النوع",
    "SKU": "رمز المنتج",
    "Unit": "الوحدة",
    "NOS": "قطعة",
    "Availability": "التوفر",
    "Results for the term": "نتائج البحث عن",
    "Abu Dhabi nursery · Est. 2004": "مشتل أبوظبي · تأسس 2004",
    "Premium Palms & Trees,": "نخيل وأشجار فاخرة،",
    "Grown & sourced for the UAE": "مُزرعة ومُورَّدة للإمارات",
    "Specimen palms, native trees and flowering shrubs — acclimatized in our Abu Dhabi nursery and delivered ready to plant across the Emirates.": "نخيل وعينات وأشجار محلية وشجيرات مزهرة — متأقلمة في مشتلنا بأبوظبي وجاهزة للزراعة في جميع أنحاء الإمارات.",
    "Shop Plants": "تسوّق النباتات",
    "Browse Palms": "تصفّح النخيل",
    "Since 2004": "منذ 2004",
    "Two decades of growing": "عقدان من الزراعة",
    "UAE-adapted plants": "نباتات متكيفة مع مناخ الإمارات",
    "Acclimatized in Abu Dhabi": "متأقلمة في أبوظبي",
    "Delivery across the UAE": "توصيل في جميع أنحاء الإمارات",
    "All seven Emirates": "الإمارات السبع",
    "Design to maintenance": "من التصميم إلى الصيانة",
    "Shop by category": "تسوّق حسب الفئة",
    "Browse our nursery by plant type — every item grown or selected for the UAE climate.": "تصفّح مشتلنا حسب نوع النبات — كل صنف مُزرع أو مختار ليناسب مناخ الإمارات.",
    "Fan, date & specimen palms": "نخيل مروحية وتمر وعينات",
    "Palms": "النخيل",
    "Shade & native trees": "أشجار الظل والأشجار المحلية",
    "Heritage & monumental specimens": "عينات تراثية وضخمة",
    "Flowering shrubs & ground covers": "شجيرات مزهرة ونباتات تغطية أرضية",
    "For homes, offices & hotels": "للمنازل والمكاتب والفنادق",
    "Planters, soil & care": "أصيص وتربة وعناية",
    "Pots & Supplies": "أصص ومستلزمات",
    "Best sellers": "الأكثر مبيعًا",
    "Our most-loved plants": "أكثر نباتاتنا شعبية",
    "Our services": "خدماتنا",
    "Beyond the nursery": "ما بعد المشتل",
    "We supply plants, source specimens and care for interiors for clients across the UAE.": "نوفر النباتات ونورد العينات ونعتني بالمساحات الداخلية لعملائنا في أنحاء الإمارات.",
    "Learn more": "اعرف المزيد",
    "Interior Plant Maintenance": "العناية بالنباتات الداخلية",
    "Living interiors for offices, hotels and malls.": "ديكورات حية للمكاتب والفنادق والمراكز التجارية.",
    "Page not found": "الصفحة غير موجودة",
    "This page is no longer available.": "هذه الصفحة لم تعد متاحة.",
    "Back to home": "العودة إلى الرئيسية",
    "Why Pheladelfia": "لماذا فلادلفيا",
    "Rooted in the Emirates for over 20 years": "جذورنا في الإمارات لأكثر من 20 عامًا",
    "Locally acclimatized": "متأقلمة محليًا",
    "Every plant is hardened in our Abu Dhabi nursery to thrive in UAE heat, wind and soil.": "كل نبتة تُقوّى في مشتلنا بأبوظبي لتزدهر في حرارة الإمارات ورياحها وتربتها.",
    "Wide variety": "تشكيلة واسعة",
    "From rare specimen palms to native Ghaf and ground covers — hundreds of species in stock.": "من نخيل العينات النادر إلى الغاف المحلي ونباتات التغطية — مئات الأنواع متوفرة.",
    "Experienced team": "فريق ذو خبرة",
    "Large-scale capacity": "قدرة على نطاق واسع",
    "Thousands of mature palms ready to supply government and developer projects.": "آلاف النخيل الناضج جاهزة لتوريد مشاريع حكومية ومشاريع مطورين.",
    "10% off your first order": "خصم 10% على طلبك الأول",
    "Use code GREEN10 at checkout for 10% off your first order.": "استخدم الرمز GREEN10 عند الدفع للحصول على خصم 10% على طلبك الأول.",
    "Shop now": "تسوّق الآن",
    "Testimonials": "آراء عملائنا",
    "Trusted by developers, hotels & homeowners": "موثوقون من المطورين والفنادق وأصحاب المنازل",
    "“Pheladelfia supplied over a thousand Washingtonia palms for our community on time and in excellent condition. Their team made a complex logistics job look easy.”": "«ورّدت فلادلفيا أكثر من ألف نخلة واشنطونيا لمجتمعنا في موعدها وبحالة ممتازة. جعل فريقهم مهمة لوجستية معقدة تبدو سهلة.»",
    "Khalid Al Mansoori": "خالد المنصوري",
    "Project Director, Real Estate Developer": "مدير مشاريع، مطور عقاري",
    "“We've used their grounds maintenance for three years. The gardens have never looked better, and reporting is always clear.”": "«نستخدم خدماتهم في صيانة المساحات الخضراء منذ ثلاث سنوات. لم تبدُ الحدائق أفضل من أي وقت مضى، والتقارير واضحة دائمًا.»",
    "Sarah Thompson": "سارة تومسون",
    "Facilities Manager, Hotel Group": "مديرة مرافق، مجموعة فنادق",
    "“Beautiful, healthy plants that actually survive our summer. The advice on choosing the right palms was invaluable.”": "«نباتات جميلة وصحية تنجو فعلًا من صيفنا. ونصيحتهم في اختيار النخيل المناسب كانت لا تُقدّر بثمن.»",
    "Mariam Al Hosani": "مريم الحوسني",
    "Villa owner, Abu Dhabi": "مالكة فيلا، أبوظبي",
    "Newsletter": "النشرة البريدية",
    "Seasonal planting tips & offers": "نصائح موسمية للزراعة وعروض",
    "One calm email a month. No spam.": "بريد واحد هادئ شهريًا. بدون إزعاج.",
    "Email address": "البريد الإلكتروني",
    "Subscribe": "اشترك",
    "Two decades of growing the green heart of the Emirates.": "عقدان من زراعة القلب الأخضر للإمارات.",
    "Pheladelfia Agricultural LLC began in 2004 with a simple belief: plants for the UAE should be grown in the UAE. Our Abu Dhabi nursery acclimatizes every palm, tree and shrub to local heat, soil and water so it thrives from the day it is planted.": "بدأت فلادلفيا الزراعية ذ.م.م عام 2004 بقناعة بسيطة: نباتات الإمارات يجب أن تُزرع في الإمارات. يقوم مشتلنا في أبوظبي بتأقلمة كل نخلة وشجرة وشجيرة مع الحرارة والتربة والمياه المحلية لتزدهر منذ يوم زراعتها.",
    "Nursery: Al Wathba, Abu Dhabi": "المشتل: الوثبة، أبوظبي",
    "Branch: Warsan, Dubai": "الفرع: الورسان، دبي",
    "Founded in Abu Dhabi": "تأسست في أبوظبي",
    "Plants in the nursery": "نباتات في المشتل",
    "Projects delivered": "مشاريع منجزة",
    "Emirates served": "إمارات نخدمها",
    "What drives us": "ما يحركنا",
    "Mission & vision": "الرسالة والرؤية",
    "Our mission": "رسالتنا",
    "Our vision": "رؤيتنا",
    "Visit our nursery": "زوروا مشتلنا",
    "Services": "الخدمات",
    "Our Services": "خدماتنا",
    "Service 01": "الخدمة 01",
    "Concept & planting design": "تصميم المفهوم والزرع",
    "Irrigation & lighting": "الري والإضاءة",
    "Specimen palm transplanting": "نقل نخيل العينات",
    "Contact us": "تواصل معنا",
    "Service 02": "الخدمة 02",
    "Service 03": "الخدمة 03",
    "We design, supply and maintain indoor planting schemes — regular visits for watering, cleaning, feeding and plant rotation so your interiors always look their best.": "نصمم ونورد ونعتني بمخططات الزرع الداخلي — زيارات منتظمة للسقي والتنظيف والتغذية وتدوير النباتات لتبدو ديكوراتكم الداخلية في أفضل حال دائمًا.",
    "Plant & planter supply": "توريد النباتات والأصيص",
    "Weekly care visits": "زيارات عناية أسبوعية",
    "Seasonal rotation": "تدوير موسمي",
    "Shop the plants": "تسوّق النباتات",
    "Questions about a plant, an order or a project? We're happy to help.": "أسئلة حول نبتة أو طلب أو مشروع؟ يسعدنا المساعدة.",
    "Send us a message": "أرسل لنا رسالة",
    "Tell us about your plant, order or project — the form opens your email app with everything filled in.": "أخبرنا عن نبتتك أو طلبك أو مشروعك — النموذج يفتح تطبيق البريد معبأً بالكامل.",
    "Opens your email app addressed to nursery@pheladelfia.com — no data leaves your device until you press send.": "يفتح تطبيق بريدك موجهًا إلى nursery@pheladelfia.com — لا تغادر أي بيانات جهازك حتى تضغط إرسال.",
    "Your message is sent securely to nursery@pheladelfia.com.": "تُرسل رسالتك بأمان إلى nursery@pheladelfia.com.",
    "Thank you! Your message was sent — we'll get back to you soon.": "شكرًا لك! تم إرسال رسالتك — سنعود إليك قريبًا.",
    "Thank you! Your application was sent — our team will review it and contact you.": "شكرًا لك! تم إرسال طلبك — سيراجعه فريقنا ويتواصل معك.",
    "Attach your CV": "أرفق سيرتك الذاتية",
    "PDF, DOC or DOCX — up to 5MB.": "PDF أو DOC أو DOCX — حتى 5 ميجابايت.",
    "PDF, DOC or DOCX — up to 10MB.": "PDF أو DOC أو DOCX — حتى 10 ميجابايت.",
    "You can also email your CV directly to nursery@pheladelfia.com.": "يمكنك أيضًا إرسال سيرتك الذاتية مباشرة إلى nursery@pheladelfia.com.",
    "The attached file is too large — please keep it under 5MB.": "الملف المرفق كبير جدًا — يرجى إبقاؤه تحت 5 ميجابايت.",
    "The attached file is too large — please keep it under 10MB.": "الملف المرفق كبير جدًا — يرجى إبقاؤه تحت 10 ميجابايت.",
    "Couldn't send right now — please try again or email us at nursery@pheladelfia.com.": "تعذّر الإرسال الآن — حاول مرة أخرى أو راسلنا على nursery@pheladelfia.com.",
    "Full name": "الاسم الكامل",
    "Phone": "الهاتف",
    "Subject": "الموضوع",
    "Plant enquiry": "استفسار عن نبتة",
    "Existing order": "طلب قائم",
    "Maintenance contract": "عقد صيانة",
    "Send message": "أرسل الرسالة",
    "Call us": "اتصل بنا",
    "Opening hours": "ساعات العمل",
    "Sat–Thu 8am–6pm · Friday closed": "السبت–الخميس 8ص–6م · الجمعة مغلق",
    "Locations": "المواقع",
    "Sustainability": "الاستدامة",
    "Chat on WhatsApp": "محادثة عبر واتساب",
    "Interactive map will appear here": "ستظهر الخريطة التفاعلية هنا",
    /* ---- V5 additions ---- */
    "Join Us": "انضم إلينا",
    "Certified excellence": "تميّز معتمد",
    "Quality, environment and safety you can verify": "جودة وبيئة وسلامة يمكنك التحقق منها",
    "Our management systems are independently certified by Veritas under EIAC accreditation.": "أنظمة الإدارة لدينا معتمدة بشكل مستقل من فيريتاس وفق اعتماد المركز الإماراتي الدولي للاعتماد (EIAC).",
    "Quality Management System": "نظام إدارة الجودة",
    "Environmental Management System": "نظام الإدارة البيئية",
    "Occupational Health & Safety Management System": "نظام إدارة الصحة والسلامة المهنية",
    "Certificate No.": "رقم الشهادة",
    "Valid until": "صالحة حتى",
    "View certificate": "عرض الشهادة",
    "Issued by Veritas System Quality Certificates Issuing LLC · Validity can be confirmed at veritasassurance.com": "صادرة عن Veritas System Quality Certificates Issuing LLC · يمكن التحقق من الصلاحية عبر veritasassurance.com",
    "1.5M+ ft²": "+1.5 مليون قدم²",
    "Nursery area in Al Ajban": "مساحة المشتل في العجبان",
    "ISO certifications": "شهادات آيزو",
    "Countries of cultivation & sourcing": "دول الزراعة والتوريد",
    "Nursery: Al Ajban, Abu Dhabi": "المشتل: العجبان، أبوظبي",
    "Open in Google Maps": "افتح في خرائط جوجل",
    "Service 04": "الخدمة 04",
    "Service 05": "الخدمة 05",
    "Service 06": "الخدمة 06",
    "Plant Supply — Wholesale & Retail": "توريد النباتات — جملة وتجزئة",
    "Palms, trees, shrubs and indoor plants for projects of every size.": "نخيل وأشجار وشجيرات ونباتات داخلية لمشاريع بمختلف أحجامها.",
    "Wholesale and retail supply of natural palms, trees, shrubs, ground covers, saplings and seedlings, plus artificial and dried flowers and plants — graded and ready for delivery from our Abu Dhabi nursery.": "بيع بالجملة والتجزئة للنخيل والأشجار والشجيرات والمغطيات الأرضية والفسائل والشتلات، إضافة إلى الزهور والنباتات الصناعية والمجففة — مصنّفة وجاهزة للتسليم من مشتلنا في أبوظبي.",
    "Palms, trees & shrubs": "نخيل وأشجار وشجيرات",
    "Saplings & seedlings": "فسائل وشتلات",
    "Natural, artificial & dried plants": "نباتات طبيعية وصناعية ومجففة",
    "Shop plants": "تسوّق النباتات",
    "Grow-to-Order & Specimen Sourcing": "الزراعة حسب الطلب وتوريد العينات",
    "Bespoke programmes for project-specific botanical requirements.": "برامج مخصصة للاحتياجات النباتية الخاصة بكل مشروع.",
    "We propagate and grow plants to usable sizes in our Abu Dhabi nursery and source specimens from the UAE, Egypt and Thailand. Imported material adapts to local conditions at the nursery before final selection and delivery.": "نُكثر النباتات ونزرعها حتى تبلغ الأحجام المطلوبة في مشتلنا بأبوظبي، ونورّد العينات من الإمارات ومصر وتايلاند. وتتأقلم المواد المستوردة مع الظروف المحلية في المشتل قبل الاختيار النهائي والتسليم.",
    "Grow-to-order programmes": "برامج الزراعة حسب الطلب",
    "Specimen selection & documentation": "اختيار العينات وتوثيقها",
    "Acclimatisation before delivery": "أقلمة قبل التسليم",
    "Import & Export": "الاستيراد والتصدير",
    "Regional supply across the UAE and GCC.": "توريد إقليمي في الإمارات ودول الخليج.",
    "Importing and exporting of plants, trees, seeds and agricultural materials, with quality control, technical coordination and project logistics managed from Abu Dhabi.": "استيراد وتصدير النباتات والأشجار والبذور والمواد الزراعية، مع مراقبة الجودة والتنسيق الفني وخدمات المشاريع اللوجستية من أبوظبي.",
    "Import & export coordination": "تنسيق الاستيراد والتصدير",
    "Quality control & inspection": "مراقبة الجودة والفحص",
    "Project logistics & delivery": "لوجستيات المشاريع والتسليم",
    "Interior Plant Provision & Maintenance": "توريد النباتات الداخلية والعناية بها",
    "Fertilizers, Soil & Seeds": "الأسمدة والتربة والبذور",
    "Everything to establish and sustain healthy planting.": "كل ما يلزم لإنشاء زراعة صحية والحفاظ عليها.",
    "Wholesale supply of natural fertilizers, agricultural reclamation and soil-amendment materials, cereals and seeds, alongside planters and care products.": "توريد بالجملة للأسمدة الطبيعية ومواد استصلاح التربة والمحسّنات الزراعية والحبوب والبذور، إلى جانب الأحواض ومنتجات العناية.",
    "Natural fertilizers & soil amendments": "أسمدة طبيعية ومحسّنات تربة",
    "Seeds & planting stock": "بذور ومواد زراعة",
    "Planters & care products": "أحواض ومنتجات عناية",
    "Browse supplies": "تصفّح المستلزمات",
    "Artworks and models that bring a design to life.": "أعمال فنية ونماذج تُجسّد التصميم.",
    "Garden sculpture & artwork": "منحوتات وأعمال فنية للحدائق",
    "Models & maquettes": "نماذج ومجسمات",
    "Careers": "الوظائف",
    "Build a career in horticulture": "ابنِ مسيرة مهنية في البستنة",
    "Since 2004, Pheladelfia has grown palms, trees and plants across more than 1.5 million square feet in Al Ajban, Abu Dhabi. Join a team that values safety, quality and care for the environment.": "منذ 2004 تزرع فلادلفيا النخيل والأشجار والنباتات على مساحة تزيد عن 1.5 مليون قدم مربع في العجبان بأبوظبي. انضم إلى فريق يقدّر السلامة والجودة والعناية بالبيئة.",
    "Safe workplace": "بيئة عمل آمنة",
    "Our occupational health and safety system is certified to ISO 45001:2018.": "نظام الصحة والسلامة المهنية لدينا معتمد وفق ISO 45001:2018.",
    "Hands-on experience": "خبرة عملية",
    "Work with palms, rare trees and large-scale projects across the UAE.": "اعمل مع النخيل والأشجار النادرة والمشاريع الكبرى في أنحاء الإمارات.",
    "Quality & environment": "الجودة والبيئة",
    "Certified to ISO 9001 and ISO 14001, so good practice is part of every task.": "حاصلون على ISO 9001 وISO 14001، فالممارسات الجيدة جزء من كل مهمة.",
    "Where you could fit": "أين يمكنك أن تنضم",
    "Our teams": "فرقنا",
    "Nursery & Horticulture": "المشتل والبستنة",
    "Propagation, growing, irrigation and plant care at the nursery.": "الإكثار والزراعة والري والعناية بالنباتات في المشتل.",
    "Installation crews, supervisors and grounds maintenance teams.": "فرق التركيب والمشرفون وفرق صيانة المساحات الخارجية.",
    "Sales & Customer Service": "المبيعات وخدمة العملاء",
    "Helping developers, contractors and homeowners choose the right plants.": "مساعدة المطورين والمقاولين وأصحاب المنازل على اختيار النباتات المناسبة.",
    "Logistics, Import & Export": "اللوجستيات والاستيراد والتصدير",
    "Transport, quality control, documentation and project coordination.": "النقل ومراقبة الجودة والتوثيق وتنسيق المشاريع.",
    "Administration & Accounts": "الإدارة والحسابات",
    "Office, procurement and finance support for a growing business.": "دعم المكتب والمشتريات والمالية لشركة في نمو.",
    "Apply now": "قدّم الآن",
    "Send us your details. We review every application and keep promising profiles on file for future openings.": "أرسل لنا بياناتك. نراجع كل طلب ونحتفظ بالملفات المميزة لفرص مستقبلية.",
    "Area of interest": "مجال الاهتمام",
    "Other": "أخرى",
    "About you": "نبذة عنك",
    "Please attach your CV to the email that opens, or send it directly to nursery@pheladelfia.com.": "يرجى إرفاق سيرتك الذاتية في البريد الذي سيفتح، أو إرسالها مباشرة إلى nursery@pheladelfia.com.",
    "Submit application": "إرسال الطلب",
    "Open positions": "الوظائف المتاحة",
    "Current openings": "الفرص الحالية",
    "Career opportunities": "فرص وظيفية",
    "Explore our open positions and grow your career with Pheladelfia Agricultural.": "استكشف وظائفنا المتاحة وانمُ مسيرتك المهنية مع فلادلفيا الزراعية.",
    "Job details": "تفاصيل الوظيفة",
    "Ready to apply?": "هل أنت مستعد للتقديم؟",
    "Go to the application form": "اذهب إلى استمارة التقديم",
    "view all openings": "عرض كل الوظائف",
    "No positions available right now — send us your application anyway and we will keep your profile on file.": "لا توجد وظائف متاحة حالياً — أرسل لنا طلبك على أي حال وسنحتفظ بملفك للمستقبل.",
    "Looking for a hands-on role in a certified horticulture nursery? Browse our open positions below.": "هل تبحث عن وظيفة عملية في مشتل بستنة معتمد؟ تصفّح الوظائف المتاحة أدناه.",
    "Search jobs by title, location or team…": "ابحث في الوظائف بالمسمى أو الموقع أو الفريق…",
    "Search open positions": "البحث في الوظائف المتاحة",
    "No positions match your search — send us your application anyway and we will keep your profile on file.": "لا توجد وظائف مطابقة لبحثك — أرسل طلبك على أي حال وسنحتفظ بملفك للمستقبل.",
    "Don't see your role?": "لا ترى وظيفتك؟",
    "Apply anyway": "قدّم على أي حال",
    "Apply for this role": "قدّم على هذه الوظيفة",
    "What you will do": "ماذا ستفعل",
    "What we look for": "ما الذي نبحث عنه",
    "Position": "الوظيفة",
    "e.g. Site Engineer": "مثال: مهندس موقع",
    "Site Engineer": "مهندس موقع",
    "Foreman": "فورمان",
    "Supervise planting and installation sites across UAE projects — setting out, planting, irrigation and handover quality.": "الإشراف على مواقع الزراعة والتركيب في مشاريع الإمارات — التخطيط والزراعة والري وجودة التسليم.",
    "Review drawings, quantities and planting schedules": "مراجعة الرسومات والكميات وجداول الزراعة",
    "Coordinate with nurseries, contractors and clients": "التنسيق مع المشاتل والمقاولين والعملاء",
    "Ensure ISO 45001 safety and quality standards on site": "ضمان معايير السلامة والجودة ISO 45001 في الموقع",
    "Diploma or degree in civil engineering, horticulture or related field": "دبلوم أو بكالوريوس في الهندسة المدنية أو البستنة أو مجال ذي صلة",
    "3+ years of site supervision experience": "أكثر من 3 سنوات خبرة في الإشراف على المواقع",
    "Valid UAE residence visa": "إقامة سارية في الإمارات",
    "Fluent English; Arabic is an advantage": "إتقان الإنجليزية؛ والعربية ميزة إضافية",
    "Lead a nursery crew responsible for planting, pruning, irrigation and daily plant care across our 1.5M sq ft nursery.": "قيادة فريق مشتل مسؤول عن الزراعة والتقليم والري والعناية اليومية بالنباتات في مشتلنا البالغ 1.5 مليون قدم مربع.",
    "Supervise daily nursery operations and crew scheduling": "الإشراف على العمليات اليومية في المشتل وجدولة الفرق",
    "Train workers on planting, pruning and irrigation techniques": "تدريب العمال على تقنيات الزراعة والتقليم والري",
    "Monitor plant health and report issues": "متابعة صحة النباتات والإبلاغ عن المشكلات",
    "Enforce safety and housekeeping standards": "تطبيق معايير السلامة والنظافة",
    "2+ years of experience as a foreman or senior nursery worker": "أكثر من سنتين خبرة كفورمان أو عامل أول في المشتل",
    "Hands-on knowledge of palms, trees and shrubs": "معرفة عملية بالنخيل والأشجار والشجيرات",
    "Ability to read basic instructions and reports": "القدرة على قراءة التعليمات والتقارير الأساسية",
    "UAE residence visa": "إقامة في الإمارات",
    "Al Ajban, Abu Dhabi": "العجبان، أبوظبي",
    "Full-time": "دوام كامل",
    "UAE residence visa?": "هل لديك إقامة في الإمارات؟",
    "Visa type": "نوع الإقامة",
    "UAE driving licence?": "هل لديك رخصة قيادة في الإمارات؟",
    "Current salary": "الراتب الحالي",
    "Expected salary": "الراتب المتوقع",
    "Years of experience": "سنوات الخبرة",
    "Less than 1 year": "أقل من سنة",
    "1–2 years": "1–2 سنة",
    "3–5 years": "3–5 سنوات",
    "5–10 years": "5–10 سنوات",
    "10+ years": "أكثر من 10 سنوات",
    "e.g. AED 5,000": "مثال: 5,000 درهم",
    "e.g. AED 7,000": "مثال: 7,000 درهم",
    "Select": "اختر",
    "Yes": "نعم",
    "No": "لا",
    "Employment visa": "إقامة عمل",
    "Investor visa": "إقامة مستثمر",
    "Family sponsorship": "كفالة عائلية",
    "Golden visa": "الإقامة الذهبية",
    "Prefer email?": "تفضّل البريد الإلكتروني؟",
    "Verification code": "رمز التحقق",
    "Verify & send": "تحقق وأرسل",
    "Verifying…": "جارٍ التحقق…",
    "Resend code": "إعادة إرسال الرمز",
    "Enter the 6-digit code we emailed you.": "أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إليك.",
    "Incorrect code. Please try again.": "رمز غير صحيح. حاول مرة أخرى.",
    "Could not resend the code. Please try again.": "تعذّرت إعادة إرسال الرمز. حاول مرة أخرى.",
    "Sending is unavailable.": "الإرسال غير متاح.",
    "Based at": "المقر",
    "Projects": "المشاريع",
    "One partner, from propagation to establishment": "شريك واحد، من الإكثار حتى التأسيس",
    "Our nursery in Al Ajban, Abu Dhabi is the operational heart of every project: plants are propagated, grown, received, inspected and prepared to project specifications before delivery.": "يُعد مشتلنا في العجبان بأبوظبي القلب التشغيلي لكل مشروع: تُكاثر النباتات وتُزرع وتُستلم وتُفحص وتُجهز وفق مواصفات المشروع قبل التوصيل.",
    "Our Warsan, Dubai branch extends the same standards to projects across the Emirates.": "ويمتد فرعنا في الورسان بدبي ليطبّق المعايير نفسها على مشاريع في أنحاء الإمارات.",
    "Consultation & Design Support": "الاستشارة ودعم التصميم",
    "Supply & Logistics": "التوريد واللوجستيات",
    "Import and export coordination, quality control and phased delivery to site across the UAE.": "تنسيق الاستيراد والتصدير ومراقبة الجودة والتسليم المرحلي إلى الموقع في أنحاء الإمارات.",
    "Establishment & Aftercare": "التأسيس والرعاية اللاحقة",
    "Planting guidance, maintenance protocols and horticultural support through the establishment period.": "إرشادات الزراعة وبروتوكولات الصيانة والدعم البستني خلال فترة التأسيس.",
    "Government & Public Realm — parks, streetscapes and civic green infrastructure": "الجهات الحكومية والفضاء العام — حدائق وشوارع وبنية تحتية خضراء",
    "Discuss your project": "ناقش مشروعك",
    "Explore our services": "استكشف خدماتنا",
    "Skip to content": "تخطَّ إلى المحتوى",
    "Search results": "نتائج البحث",

    "ISO 9001:2015 certificate": "شهادة ISO 9001:2015",
    "ISO 14001:2015 certificate": "شهادة ISO 14001:2015",
    "ISO 45001:2018 certificate": "شهادة ISO 45001:2018",
    "Breadcrumb": "مسار التنقل",
    "Specimen palm at the Pheladelfia nursery": "نخلة نموذجية في مشتل فلادلفيا",
    "What we stand for": "ما نقف عليه",
    "Our values": "قيمنا",
    "Integrity": "النزاهة",
    "We conduct our business with honesty in every dealing and relationship.": "ندير أعمالنا بصدق في كل معاملة وعلاقة.",
    "We are committed to protecting the environment through everything we grow.": "نلتزم بحماية البيئة في كل ما نزرع.",
    "Quality": "الجودة",
    "We deliver top-quality plants, products, and services, every time.": "نقدم نباتات ومنتجات وخدمات عالية الجودة في كل مرة.",
    "Innovation": "الابتكار",
    "We stay at the forefront of industry advancements and techniques.": "نبقى في طليعة التطورات والتقنيات في المجال.",
    "To be a leading, professional nursery corporation — implementing plans of unrepresented quality standards with innovative designs at the most competitive cost.": "أن نكون مؤسسة مشاتل رائدة ومحترفة — نطبق خططًا بمعايير جودة استثنائية وتصاميم مبتكرة بأكثر تكلفة تنافسية.",
    "To create a greener future for all, using our expertise and experience to introduce innovative standards of horticulture and trading that bring new vibrancy to the green environment.": "أن نصنع مستقبلًا أكثر اخضرارًا للجميع، باستخدام خبرتنا ومعرفتنا لنقدم معايير مبتكرة في البستنة والتجارة تضفي حيوية جديدة على البيئة الخضراء.",
    "Clients & approvals": "العملاء والاعتمادات",
    "Trusted by": "موثوقون لدى",
    "Our clients": "عملاؤنا",
    "An approved supplier to the region's leading names": "مورّد معتمد لدى كبرى الجهات في المنطقة",
    "Pheladelfia is a registered and approved supplier to leading developers, government entities, and consultants across the UAE and the Kingdom of Saudi Arabia.": "فلادلفيا مورّد مسجل ومعتمد لدى كبار المطورين والجهات الحكومية والاستشاريين في الإمارات والمملكة العربية السعودية.",
    "Regional reach: United Arab Emirates · Saudi Arabia · Jordan · Qatar · Bahrain": "الانتشار الإقليمي: الإمارات العربية المتحدة · السعودية · الأردن · قطر · البحرين",
    "Sustainability, Environment & Wellbeing": "الاستدامة والبيئة والرفاهية",
    "Climate Responsive Selection": "اختيار يتكيف مع المناخ",
    "Local Cultivation & Acclimatisation": "زراعة محلية وتأقلم",
    "Reduced Replacement Risk": "تقليل مخاطر الاستبدال",
    "Water-Aware Plant Selection": "اختيار نباتات واعٍ بالمياه",
    "Long-Lived Botanical Assets": "أصول نباتية طويلة العمر",
    "Biodiversity & Environmental Quality": "التنوع البيولوجي والجودة البيئية",
    "Human Wellbeing": "الرفاهية البشرية",
    "Community Value": "القيمة المجتمعية",
    "Botanical Excellence": "التميز النباتي",
    "Design Awareness": "الوعي التصميمي",
    "Stewardship": "الوصاية",
    "Integrated Botanical Capability": "قدرة نباتية متكاملة",
    "From curation and cultivation to sourcing, documentation, quality control and project logistics.": "من الانتقاء والزراعة إلى التوريد والتوثيق ومراقبة الجودة ولوجستيات المشاريع.",
    "Specimen-focused expertise covers mature trees, palms and architectural plants — from individual statement pieces to large planting programmes.": "تشمل خبرتنا المتخصصة الأشجار الناضجة والنخيل والنباتات المعمارية — من القطع المميزة الفردية إلى برامج الزراعة الكبيرة.",
    "Grow to Order": "الزراعة حسب الطلب",
    "Bespoke sourcing and grow-to-order programmes for project-specific botanical requirements, managed from Abu Dhabi.": "توريد مصمم وبرامج زراعة حسب الطلب لمتطلبات المشاريع النباتية، تُدار من أبوظبي.",
    "Specimen Documentation": "توثيق العينات",
    "Every tree has an identity: specimen code, botanical and common name, origin, height, trunk dimensions and availability status.": "لكل شجرة هوية: رمز العينة والاسم العلمي والشائع والمنشأ والارتفاع وأبعاد الجذع وحالة التوفر.",
    "Remove": "إزالة",
    "Your selection is empty.": "اختياراتك فارغة.",
    "Checkout": "إتمام الطلب",
    "Order received": "تم استلام الطلب",
    "Payment needs attention": "الدفع يحتاج إلى انتباه",
    "Return home": "العودة إلى الرئيسية",
    "Refine": "تصفية",
    "Filter the catalog": "تصفية الكتالوج",
    "View details": "عرض التفاصيل",
    "Wishlist": "قائمة الأمنيات",
    "Company profile (PDF)": "الملف التعريفي للشركة (PDF)",
    "Nursery: Al Ajban, Muwailih, Abu Dhabi": "المشتل: العجبان، مويلح، أبوظبي",
    "P.O. Box 39752, UAE": "ص.ب 39752، الإمارات",
    "In-Country Value Certificate": "شهادة القيمة المحلية",
    "Review your specimens, adjust quantities and continue to secure checkout.": "راجع عيناتك وعدّل الكميات ثم تابع إلى الدفع الآمن.",
    "Unit price": "سعر الوحدة",
    "Total": "الإجمالي",
    "Items": "العناصر",
    "Order summary": "ملخص الطلب",
    "Exclusive of 5% VAT": "غير شامل ضريبة القيمة المضافة 5%",
    "Delivered across the UAE": "توصيل في جميع أنحاء الإمارات",
    "Secure checkout": "دفع آمن",
    "Back to cart": "العودة إلى السلة",
    "Secure payment": "دفع آمن",
    "UAE delivery": "توصيل في الإمارات",
    "Card and wallet payments are processed securely.": "تتم معالجة مدفوعات البطاقات والمحافظ بأمان.",
    "We deliver plants and supplies across the Emirates.": "نوصل النباتات والمستلزمات في أنحاء الإمارات.",
    "Our Al Ajban team can help with order questions.": "يمكن لفريقنا في العجبان المساعدة في استفسارات الطلب.",
    "Review your order, choose delivery and payment, then confirm securely.": "راجع طلبك واختر التوصيل والدفع ثم أكّد بأمان.",
    "Complete each step to review your order, choose delivery and pay securely.": "أكمل كل خطوة لمراجعة طلبك واختيار التوصيل والدفع بأمان.",
    "Order confirmation": "تأكيد الطلب",
    "Thank you. Your payment was successful and we are preparing your order for delivery.": "شكرًا لك. تم الدفع بنجاح ونحن نجهّز طلبك للتوصيل.",
    "Order number": "رقم الطلب",
    "Amount paid": "المبلغ المدفوع",
    "Payment method": "طريقة الدفع",
    "Confirmation email": "بريد التأكيد",
    "A confirmation email will be sent to": "سيتم إرسال بريد تأكيد إلى",
    "A confirmation email will be sent to you.": "سيتم إرسال بريد تأكيد إليك.",
    "Questions?": "لديك استفسار؟",
    "Continue shopping": "متابعة التسوق",
    "View my orders": "عرض طلباتي",
    "Payment status": "حالة الدفع",
    "We could not confirm this payment. If an amount was deducted, it will be reversed automatically or our team will contact you.": "تعذّر تأكيد هذا الدفع. إذا خُصم أي مبلغ فسيُسترد تلقائيًا أو سيتواصل معك فريقنا.",
    "Status": "الحالة",
    "Order reference": "مرجع الطلب",
    "Error": "خطأ",
    "Need help? Contact": "هل تحتاج مساعدة؟ تواصل مع",
    "or call": "أو اتصل على",
    "Browse palms, trees, shrubs and garden supplies to start your order.": "تصفّح النخيل والأشجار والشجيرات ومستزمات الحدائق لبدء طلبك.",
    "Save for later": "حفظ لوقت لاحق",
    "Select size": "اختر المقاس",

    /* ---- Company-profile content refresh (nursery / specimen supplier) ---- */
    "A specialist nursery and specimen-tree supplier in Abu Dhabi since 2004 — growing, sourcing and delivering design-grade plants across the UAE and Gulf.": "مورّد متخصص في المشاتل وأشجار العينات في أبوظبي منذ 2004 — نزرع ونورد ونوصّل نباتات بمعايير تصميمية في أنحاء الإمارات والخليج.",
    "Specialist nursery and specimen-tree supplier — Pheladelfia Agricultural LLC, Abu Dhabi since 2004.": "مورّد متخصص في المشاتل وأشجار العينات — فلادلفيا الزراعية ذ.م.م، أبوظبي منذ 2004.",
    "Project supply": "توريد المشاريع",
    "Sourcing to delivery": "من التوريد إلى التسليم",
    "Everything for design-led planting": "كل ما تحتاجه الزراعة التصميمية",
    "Horticulturists and supply specialists with 20+ years of regional experience.": "بستانيون ومتخصصو توريد بخبرة إقليمية تتجاوز 20 عامًا.",
    "Two decades of growing specimen trees in the Emirates.": "عقدان من زراعة أشجار العينات في الإمارات.",
    "From a single nursery to a regional specimen supplier": "من مشتل واحد إلى مورّد إقليمي لأشجار العينات",
    "To set the regional standard for specimen-grade plant material — pairing horticultural rigour with the documentation and supply reliability our clients can specify with confidence.": "أن نضع المعيار الإقليمي للمواد النباتية بمعايير العينات — بجمع الصرامة البستنية والتوثيق وموثوقية التوريد التي يمكن لعملائنا الاعتماد عليها بثقة.",
    "We hold every specimen to a measured, documented standard — and supply it exactly as specified.": "نلتزم بكل عينة بمعيار مقاس وموثّق — ونوردها تمامًا كما هو محدد.",
    "Selected for species, height, trunk character, canopy balance, climatic suitability and long-term planting performance.": "تُختار وفق النوع والارتفاع وطابع الجذع وتوازن التاج وملاءمة المناخ والأداء طويل الأمد للزراعة.",
    "Selected for more than species and size. Every selection is considered in relation to architectural character, spatial scale, user experience, climate suitability and long-term planting performance.": "نختار لما هو أبعد من النوع والحجم؛ فكل اختيار يُدرس وفق الطابع المعماري والمقياس المكاني وتجربة المستخدم وملاءمة المناخ والأداء طويل الأمد للزراعة.",
    "Climate-responsive plant selection of lasting value": "اختيار نباتات يتكيف مع المناخ وقيمة تدوم",
    "Specimen Material Supplied Across the UAE": "توريد مواد العينات في أنحاء الإمارات",
    "From nursery rows in Al Ajban to design-led projects across the UAE and Gulf — Pheladelfia supports schemes of every scale with specimen trees, palms, architectural plants, technical coordination and logistics.": "من صفوف المشتل في العجبان إلى مشاريع التصميم في أنحاء الإمارات والخليج — تدعم فلادلفيا مخططات بجميع الأحجام عبر أشجار العينات والنخيل والنباتات المعمارية والتنسيق الفني واللوجستيات.",
    "One partner, from propagation to delivery": "شريك واحد، من الإكثار إلى التسليم",
    "Imported material is consolidated at our Ajban nursery, inspected and acclimatised before supply across the Emirates and wider Gulf.": "تُجمّع المواد المستوردة في مشتلنا بالعجبان وتُفحص وتُؤقلم قبل التوريد في أنحاء الإمارات والخليج الأوسع.",
    "Enquiry & Requirements": "الاستفسار والمتطلبات",
    "Share your plant list, sizes and quantities. We review them against nursery stock and our sourcing network.": "شاركنا قائمة النباتات والمقاسات والكميات. نراجعها وفق مخزون المشتل وشبكة التوريد لدينا.",
    "Sourcing & Availability": "التوريد والتوفر",
    "Our field team checks prices and availability — drawing on our own farm and trusted nurseries at origin.": "يتحقق فريقنا الميداني من الأسعار والتوفر — بالاعتماد على مزرعتنا ومشاتل موثوقة في بلد المنشأ.",
    "Quality Control & Logistics": "مراقبة الجودة واللوجستيات",
    "Every plant is inspected before delivery, then transported so it arrives on time and in the expected condition.": "تُفحص كل نبتة قبل التسليم ثم تُنقل لتصل في موعدها وبالحالة المتوقعة.",
    "Developers & Consultants — master developers, real-estate houses, hospitality destinations and design-led contractors": "المطورون والاستشاريون — كبار المطورين وشركات العقارات ووجهات الضيافة والمقاولون المعماريون",
    "Authorities & Institutions — federal and emirate authorities, sovereign offices and institutional landowners": "الجهات والمؤسسات — الجهات الاتحادية والإماراتية والمكاتب السيادية والجهات المؤسسية المالكة",
    "Pheladelfia operates to internationally recognised management standards, certified by Bureau Veritas under EIAC accreditation.": "تعمل فلادلفيا وفق معايير إدارة معترف بها دوليًا، ومعتمدة من Bureau Veritas تحت اعتماد EIAC.",
    "Certified by": "معتمد من",
    "Bureau Veritas · EIAC-accredited": "Bureau Veritas · معتمد من EIAC",
    "Certified by Bureau Veritas under EIAC accreditation · ICV certificate No. 151974 valid to 05/2027 · Licences & registrations include Abu Dhabi trade licence CN-1078760, agriculture licence AGL-2021-15516, commercial registration 6091168, Abu Dhabi Chamber member 208354, and Federal VAT & corporate tax registration.": "معتمد من Bureau Veritas تحت اعتماد EIAC · شهادة القيمة المحلية رقم 151974 صالحة حتى 05/2027 · تشمل التراخيص والتسجيلات رخصة أبوظبي التجارية CN-1078760 ورخصة الزراعة AGL-2021-15516 والسجل التجاري 6091168 وعضوية غرفة أبوظبي 208354 وتسجيل ضريبة القيمة المضافة والضريبة المؤسسية الاتحادي.",
    "Questions about a plant, an order or a project supply? We're happy to help.": "أسئلة حول نبتة أو طلب أو توريد مشروع؟ يسعدنا المساعدة.",
    "Specimen or project supply": "عينة أو توريد مشروع",
    "Import / export": "استيراد / تصدير",
    "Grow your career with an ISO-certified nursery and horticulture team in Abu Dhabi.": "طوّر مسيرتك المهنية مع مشتل وبستنة حاصلين على شهادات آيزو في أبوظبي.",
    "Plant Sourcing & Trading": "توريد النباتات والتجارة",
    "Selecting specimens and coordinating supply across the Gulf.": "اختيار العينات وتنسيق التوريد في أنحاء الخليج.",
    "Helping developers, consultants and contractors choose the right plants.": "مساعدة المطورين والاستشاريين والمقاولين على اختيار النباتات المناسبة.",
    "Supply & Logistics Coordinator": "منسق التوريد واللوجستيات",
    "e.g. Supply Coordinator": "مثال: منسق توريد",
    "Coordinate specimen supply, phased deliveries and project requirements across the UAE and Gulf.": "تنسيق توريد العينات والتسليمات المرحلية ومتطلبات المشاريع في أنحاء الإمارات والخليج.",
    "Coordinate plant lists, sizes and quantities with nurseries and growers": "تنسيق قوائم النباتات والمقاسات والكميات مع المشاتل والمزارعين",
    "Manage import/export documentation and quality inspections": "إدارة وثائق الاستيراد/التصدير وعمليات فحص الجودة",
    "Plan phased deliveries to project sites across the UAE": "التخطيط للتسليمات المرحلية إلى مواقع المشاريع في أنحاء الإمارات",
    "Ensure ISO 45001 safety and quality standards": "ضمان معايير السلامة والجودة ISO 45001",
    "Diploma or degree in logistics, horticulture or related field": "دبلوم أو بكالوريوس في اللوجستيات أو البستنة أو مجال ذي صلة",
    "3+ years of supply or project coordination experience": "أكثر من 3 سنوات خبرة في التوريد أو تنسيق المشاريع",
    "Shade, avenue and specimen trees for design-led planting.": "أشجار ظل وشوارع وعينات للزراعة التصميمية.",
    "Interior specimens for hospitality, residences and workplaces.": "عينات داخلية للفنادق والمساكن وأماكن العمل.",
    "Sculpture and art for gardens and public spaces.": "منحوتات وفنون للحدائق والمساحات العامة.",

    "From sourcing and quality control to logistics, import and export — we manage the full horticultural supply chain so you receive the right plants, in the right condition, on time.": "من التوريد ومراقبة الجودة إلى اللوجستيات والاستيراد والتصدير — ندير سلسلة التوريد البستنية الكاملة لتصلك النباتات المناسبة وبالحالة المناسبة وفي الوقت المناسب.",
    "Plant Sourcing": "توريد النباتات",
    "The right material, in the right condition, on schedule.": "المادة المناسبة وبالحالة المناسبة وفي الموعد المحدد.",
    "We source directly through our own nursery, cultivation base and a trusted grower network at origin — securing specimen-grade material for projects across the UAE and Gulf.": "نورّد مباشرة عبر مشتلنا وقاعدة زراعتنا وشبكة مزارعين موثوقة في بلد المنشأ — لتأمين مواد بمعايير العينات لمشاريع في أنحاء الإمارات والخليج.",
    "Own nursery & cultivation base": "مشتل وقاعدة زراعة خاصة",
    "Trusted grower network at origin": "شبكة مزارعين موثوقة في بلد المنشأ",
    "Right material on schedule": "المادة المناسبة في الموعد",
    "Importing": "الاستيراد",
    "Specialist plant material, expanded project selection.": "مواد نباتية متخصصة وتشكيلة مشاريع موسّعة.",
    "We import specialist plant material to expand project selection and meet specific design requirements — consolidated at our Ajban nursery for inspection, acclimatisation and supply.": "نستورد مواد نباتية متخصصة لتوسيع تشكيلة المشاريع وتلبية متطلبات التصميم المحددة — تُجمّع في مشتلنا بالعجبان للفحص والأقلمة والتوريد.",
    "Specialist plant material": "مواد نباتية متخصصة",
    "Expanded project selection": "تشكيلة مشاريع موسّعة",
    "Design-led requirements": "متطلبات التصميم",
    "Exporting": "التصدير",
    "Documented plant material to regional and international markets.": "مواد نباتية موثّقة لأسواق إقليمية ودولية.",
    "We export high-quality plant material across regional and international markets, with documentation and quality control managed from Abu Dhabi.": "نصدّر مواد نباتية عالية الجودة لأسواق إقليمية ودولية، مع إدارة التوثيق ومراقبة الجودة من أبوظبي.",
    "Regional & international markets": "أسواق إقليمية ودولية",
    "Documented shipments": "شحنات موثّقة",
    "Quality control at origin": "مراقبة الجودة في بلد المنشأ",
    "Quality Assurance": "ضمان الجودة",
    "Every plant inspected before delivery.": "كل نبتة تُفحص قبل التسليم.",
    "Rigorous quality control runs through cultivation and supply — we work only with trusted nurseries and inspect every plant before it leaves the nursery.": "تجري مراقبة جودة صارمة عبر الزراعة والتوريد — نعمل فقط مع مشاتل موثوقة ونفحص كل نبتة قبل مغادرة المشتل.",
    "Trusted nurseries only": "مشاتل موثوقة فقط",
    "Inspect every plant": "نفحص كل نبتة",
    "Documented standards": "معايير موثّقة",
    "Centralized Purchasing": "المشتريات المركزية",
    "One point of contact for coordinated project supply.": "جهة اتصال واحدة لتوريد المشاريع المنسّق.",
    "Consolidated procurement for efficient, coordinated project supply — one team managing your plant list, sizes, quantities and schedule.": "مشتريات مجمّعة لتوريد مشاريع فعّال ومنسّق — فريق واحد يدير قائمة نباتاتك ومقاساتها وكمياتك وجدولك.",
    "One point of contact": "جهة اتصال واحدة",
    "Coordinated schedules": "جداول منسّقة",
    "Consolidated shipments": "شحنات مجمّعة",
    "Logistics": "اللوجستيات",
    "On time, and in the condition you expect.": "في الوقت المحدد وبالحالة التي تتوقعها.",
    "Plants delivered on time and in the condition expected — because receiving them when you need them is critical to your project schedule.": "تُوصّل النباتات في وقتها وبالحالة المتوقعة — لأن استلامها عند الحاجة أمر بالغ الأهمية لجدول مشروعك.",
    "Timely delivery": "تسليم في الوقت",
    "Phased project supply": "توريد مشاريع مرحلي",
    "UAE & Gulf coverage": "تغطية الإمارات والخليج",
    "The full horticultural supply chain, managed end to end — SOURCE · GROW · DELIVER": "سلسلة التوريد البستنية الكاملة، تُدار من البداية إلى النهاية — توريد · زراعة · تسليم",
    "Trade lists on request": "قوائم أسعار عند الطلب",
    "Pheladelfia Agricultural LLC began in 2004 with a simple belief: the region's design ambitions needed mature, design-grade plant material — grown and supplied to a documented standard. Our Abu Dhabi nursery spans more than 1.5 million square feet in Al Ajban, where plants and trees are propagated and grown on to specimen sizes.": "بدأت فلادلفيا الزراعية ذ.م.م عام 2004 بقناعة بسيطة: كانت طموحات التصميم في المنطقة بحاجة إلى مواد نباتية ناضجة بمعايير تصميمية — تُزرع وتُورد وفق معيار موثّق. يمتد مشتلنا في أبوظبي على أكثر من 1.5 مليون قدم مربع في العجبان، حيث تُكثر النباتات والأشجار وتُزرع حتى بلوغ مقاسات العينات.",
    "Today we supply design professionals, developers, consultants, contractors and institutions across the UAE and Gulf — with a branch in Warsan, Dubai.": "اليوم نورد متخصصي التصميم والمطورين والاستشاريين والمقاولين والمؤسسات في أنحاء الإمارات والخليج — مع فرع في الورسان بدبي.",
    "Contractors & Delivery Partners — specialist contractors and delivery partners realising schemes on the ground": "المقاولون وشركاء التنفيذ — مقاولون متخصصون وشركاء تسليم منفذون للمخططات على أرض الواقع",
    /* ---- Hero slider (V8.3) — Arabic machine-drafted, TODO native review ---- */
    "Featured": "مميز",
    "Slide navigation": "التنقل بين الشرائح",
    "Pause slideshow": "إيقاف العرض التلقائي",
    "Play slideshow": "تشغيل العرض التلقائي",
    "Premium palms, trees and specimen plants — Pheladelfia Agricultural LLC, Abu Dhabi since 2004": "نخيل وأشجار ونباتات مختارة — فلادلفيا الزراعية ذ.م.م، أبوظبي منذ 2004",
    "Abu Dhabi nursery · Est. 2004": "مشتل أبوظبي · تأسس 2004",
    "Specimen Palms & Washingtonia": "نخيل العينات وواشنطونيا",
    "Fan, date and specimen palms — selected, acclimatized and delivered ready to plant across the Emirates.": "نخيل مروحي وتمر وعينات — مختارة ومؤقلمة وتُسلَّم جاهزة للزراعة في أنحاء الإمارات.",
    "Browse palms": "تصفّح النخيل",
    "For developers & designers": "للمطورين والمصممين",
    "Project Supply, End to End": "توريد المشاريع، من البداية إلى النهاية",
    "Sourcing, quality control, logistics and delivery — one partner from nursery row to site.": "التوريد ومراقبة الجودة واللوجستيات والتسليم — شريك واحد من صف المشتل إلى الموقع.",
    "Documented provenance": "مصدر موثّق",
    "Every Specimen, Documented": "كل عينة، موثّقة",
    "Photographed at three angles with scale reference, measured and recorded — documentation provided on request.": "تُصوَّر من ثلاث زوايا مع مرجع للمقياس وتُقاس وتُسجَّل — التوثيق متاح عند الطلب.",
    "Get in touch": "تواصل معنا",
    "Rare & ancient trees": "الأشجار النادرة والمعمّرة",
    "Rare & Ancient Specimens": "عينات نادرة ومعمّرة",
    "Heritage and monumental trees with documented provenance, sourced across the Mediterranean, GCC and Asia.": "أشجار تراثية ومعمارية بمصدر موثّق، مُورَّدة من البحر المتوسط والخليج وآسيا.",
    "Explore rare trees": "استكشف الأشجار النادرة",
    "Request availability": "اطلب توفر الكمية"
  };
  var BILINGUAL = /^(.*[A-Za-z].*?)\s*\|\s*([\u0600-\u06FF][^|]*)$/;
  var SIZE = /^(\d+(?:\.\d+)?-\d+(?:\.\d+)?) MTR CT$/;

  function readLang() {
    var v = "";
    try { v = localStorage.getItem(KEY) || ""; } catch (e) {}
    if (!v) {
      var m = document.cookie.match(/(?:^|; )ph_lang_v2=([^;]+)/);
      if (m) v = m[1];
    }
    return v === "ar" ? "ar" : "en";
  }

  function writeLang(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    document.cookie = KEY + "=" + v + "; path=/; max-age=31536000; SameSite=Lax";
  }

  var lang = readLang();
  var html = document.documentElement;
  html.setAttribute("lang", lang);
  html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  html.classList.toggle("ph-ar", lang === "ar");

  function arabicFor(text) {
    var key = String(text || "").replace(/\s+/g, " ").trim();
    if (!key || !/[A-Za-z]/.test(key)) return null;
    if (Object.prototype.hasOwnProperty.call(AR, key)) return AR[key];
    var pair = key.match(BILINGUAL);
    if (pair) return pair[2].trim();
    var size = key.match(SIZE);
    if (size) return size[1] + " م جذع صافي";
    var slideOf = key.match(/^Slide (\d+) of (\d+)$/);
    if (slideOf) return "الشريحة " + slideOf[1] + " من " + slideOf[2];
    var slideN = key.match(/^Slide (\d+)$/);
    if (slideN) return "الشريحة " + slideN[1];
    var ofN = key.match(/^(\d+) of (\d+)$/);
    if (ofN) return "الشريحة " + ofN[1] + " من " + ofN[2];
    if (/^\d+ in nursery$/.test(key)) return key.replace(" in nursery", " في المشتل");
    if (/^\d+ NOS$/.test(key)) return key.replace(" NOS", " قطعة");
    if (/ added to your selection\.$/.test(key)) return key.replace(/ added to your selection\.$/, " أُضيف إلى اختياراتك.");
    return null;
  }

  function swapText(node) {
    var raw = node.nodeValue;
    var ar = arabicFor(raw);
    if (ar === null) return;
    node.nodeValue = raw.match(/^\s*/)[0] + ar + raw.match(/\s*$/)[0];
  }

  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  function swapAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (!v) continue;
      var ar = arabicFor(v);
      if (ar !== null) el.setAttribute(ATTRS[i], ar);
    }
    if (el.tagName === "INPUT" && /^(submit|button)$/i.test(el.type || "") && el.value) {
      var val = arabicFor(el.value);
      if (val !== null) el.value = val;
    }
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, SVG: 1 };
  function skipped(el) {
    return SKIP[el.tagName] || SKIP[String(el.tagName).toUpperCase()] || el.hasAttribute("data-ph-no-translate");
  }

  function translate(scope) {
    if (lang !== "ar" || !scope) return;
    if (scope.nodeType === 3) {
      if (scope.parentNode && scope.parentNode.nodeType === 1 && skipped(scope.parentNode)) return;
      swapText(scope);
      return;
    }
    if (scope.nodeType !== 1 || skipped(scope)) return;
    if (scope.closest && scope.closest("[data-ph-no-translate]")) return;
    swapAttrs(scope);
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && skipped(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    var texts = [];
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) texts.push(n);
      else swapAttrs(n);
    }
    texts.forEach(swapText);
  }

  function translateTitle() {
    if (lang !== "ar") return;
    document.title = document.title.split("|").map(function (part) {
      var ar = arabicFor(part);
      return ar === null ? part.trim() : ar;
    }).join(" | ");
  }

  function watchChanges() {
    if (lang !== "ar" || !window.MutationObserver || !document.body) return;
    var queue = [];
    var queued = false;
    function flush() {
      queued = false;
      var list = queue;
      queue = [];
      list.forEach(translate);
    }
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === "characterData") queue.push(r.target);
        for (var i = 0; i < r.addedNodes.length; i++) queue.push(r.addedNodes[i]);
      });
      if (!queued && queue.length) {
        queued = true;
        (window.requestAnimationFrame || window.setTimeout)(flush);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function bindToggles(scope) {
    var list = (scope || document).querySelectorAll("[data-ph-lang-toggle]");
    for (var i = 0; i < list.length; i++) {
      if (list[i].__phBound) continue;
      list[i].__phBound = true;
      list[i].addEventListener("click", function (event) {
        event.preventDefault();
        writeLang(lang === "ar" ? "en" : "ar");
        location.reload();
      });
    }
  }

  function markCurrentLinks() {
    var path = window.phRoutePath ? window.phRoutePath() : (location.pathname.replace(/\/+$/, "") || "/");
    var links = document.querySelectorAll(".ph-nav-list > li > a");
    for (var i = 0; i < links.length; i++) {
      var href = window.phRoutePath ? window.phRoutePath(links[i].href) : ((links[i].getAttribute("href") || "").replace(/\/+$/, "") || "/");
      if (href === path) links[i].setAttribute("aria-current", "page");
    }
  }

  function watchMessageBar() {
    if (!document.body) return;
    function bar() {
      var list = document.querySelectorAll(".zpdark-section");
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (/removeBanner/.test(el.innerHTML) && el.offsetHeight > 0 && getComputedStyle(el).position === "fixed") return el;
      }
      return null;
    }
    function update() {
      var el = bar();
      if (el && /cookies|ملفات تعريف الارتباط/i.test(el.textContent || "")) {
        el.remove();
        el = null;
      }
      document.body.classList.toggle("ph-has-msgbar", !!el);
      document.body.style.setProperty("--ph-msgbar", el ? el.offsetHeight + "px" : "0px");
    }
    update();
    if (window.MutationObserver) new MutationObserver(update).observe(document.body, { childList: true });
  }

  var CARET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function setupDrawer() {
    var nav = document.querySelector("[data-ph-nav]");
    var toggle = document.querySelector("[data-ph-menu-toggle]");
    if (!nav || !toggle) return;
    function sync() {
      var open = nav.classList.contains("is-open");
      var desktop = !window.matchMedia || window.matchMedia("(min-width: 981px)").matches;
      document.body.classList.toggle("ph-nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.setAttribute("aria-hidden", !desktop && !open ? "true" : "false");
      if (!desktop && !open) nav.setAttribute("inert", "");
      else nav.removeAttribute("inert");
    }
    function close(restoreFocus) {
      nav.classList.remove("is-open");
      sync();
      if (restoreFocus) toggle.focus();
    }
    sync();
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      sync();
      if (open) {
        var firstLink = nav.querySelector(".ph-nav-list a[href]");
        if (firstLink) firstLink.focus();
      } else {
        toggle.focus();
      }
    });
    var closers = document.querySelectorAll("[data-ph-menu-close]");
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener("click", function () { close(true); });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) close(true);
    });
    nav.addEventListener("keydown", function (event) {
      if (event.key !== "Tab" || !nav.classList.contains("is-open")) return;
      var nodes = Array.from(nav.querySelectorAll('a[href],button,input,select')).filter(function (el) {
        return !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
      });
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a[href]") && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        sync();
      }
    });
    var drops = nav.querySelectorAll(".ph-nav-list > li.ph-drop:not(.ph-drop-mega)");
    for (var j = 0; j < drops.length; j++) {
      (function (li) {
        var link = li.querySelector(":scope > a");
        if (!link || li.querySelector(":scope > .ph-sub-toggle")) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ph-sub-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", "Show sub-menu");
        btn.innerHTML = CARET;
        link.insertAdjacentElement("afterend", btn);
        btn.addEventListener("click", function () {
          var open = li.classList.toggle("is-expanded");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      })(drops[j]);
    }
    if (window.matchMedia) {
      var desktop = window.matchMedia("(min-width: 981px)");
      var onChange = function (m) {
        if (m.matches) nav.classList.remove("is-open");
        sync();
      };
      if (desktop.addEventListener) desktop.addEventListener("change", onChange);
      else if (desktop.addListener) desktop.addListener(onChange);
    }
  }

  function bindHostedForms() {
    function message(en, ar) { return document.documentElement.dir === "rtl" ? ar : en; }
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches("form[data-ph-mail-form]")) return;
      event.preventDefault();
      if (form.getAttribute("data-ph-sending") === "true") return;
      if (!form.reportValidity()) return;
      var error = form.querySelector(".ph-form-error");
      var done = form.querySelector(".ph-form-done");
      if (error) error.hidden = true;
      if (done) done.hidden = true;
      function fail(text) {
        if (error) { error.textContent = text; error.setAttribute("role", "alert"); error.hidden = false; }
      }
      var endpoint = form.getAttribute("data-ph-endpoint");
      if (!endpoint || !window.fetch) {
        fail(message("Sending is unavailable. Please email nursery@pheladelfia.com.", "تعذّر الإرسال. يرجى مراسلتنا على nursery@pheladelfia.com."));
        return;
      }
      var data = new FormData();
      data.append("form_type", form.getAttribute("data-ph-form-type") || "contact");
      Array.prototype.forEach.call(form.querySelectorAll("input[name]:not([type=file]), select[name], textarea[name]"), function (field) {
        if (field.disabled || ((field.type === "checkbox" || field.type === "radio") && !field.checked)) return;
        var key = field.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        if (key === "subject") key = "enquiry_type";
        data.append(key, (field.value || "").trim());
      });
      var attachment = form.querySelector("input[type=file][name]");
      if (attachment && attachment.files && attachment.files.length) {
        var file = attachment.files[0];
        if (!/\.(pdf|doc|docx)$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024) {
          fail(message("Please attach a PDF, DOC or DOCX file up to 10MB.", "يرجى إرفاق ملف PDF أو DOC أو DOCX لا يتجاوز 10 ميجابايت."));
          return;
        }
        data.append("attachment", file);
      }
      var button = form.querySelector("button[type=submit]");
      var originalText = button && button.textContent;
      form.setAttribute("data-ph-sending", "true");
      form.setAttribute("aria-busy", "true");
      if (button) { button.disabled = true; button.textContent = message("Sending…", "جارٍ الإرسال…"); }
      var controller = window.AbortController ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 60000) : null;
      fetch(endpoint, { method: "POST", headers: { Accept: "application/json" }, body: data, signal: controller ? controller.signal : undefined })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        }).then(function (result) {
          var body = result.body || {};
          if (result.ok && body.success === true && body.needs_otp === true && body.otp_token) {
            showOtpStep(form, data, body.otp_token, body.otp_email || "");
            return;
          }
          if (!result.ok || body.success !== true) {
            var failure = new Error("Submission not confirmed");
            failure.status = result.status;
            failure.body = body;
            throw failure;
          }
          finishForm(form, button, originalText);
        }).catch(function (failure) {
          if (button) { button.disabled = false; button.textContent = originalText; }
          if (failure.status === 429) fail(message("Too many attempts. Please try again in 15 minutes.", "محاولات كثيرة. يرجى المحاولة بعد 15 دقيقة."));
          else if (failure.status === 413 || failure.status === 422) fail(failure.body && failure.body.message ? failure.body.message : message("Check your details and attach a valid PDF, DOC or DOCX up to 10MB.", "راجع البيانات وأرفق ملف PDF أو DOC أو DOCX صالحًا لا يتجاوز 10 ميجابايت."));
          else fail(message("We could not confirm sending. Please try again or email nursery@pheladelfia.com.", "لم نتمكن من تأكيد الإرسال. حاول مرة أخرى أو راسل nursery@pheladelfia.com."));
        }).then(function () {
          if (timer) clearTimeout(timer);
          form.removeAttribute("data-ph-sending");
          form.removeAttribute("aria-busy");
          if (button && form.getAttribute("data-ph-otp-open") !== "true") { button.disabled = false; }
        });
    });

    function finishForm(form, button, originalText) {
      var otpBox = form.querySelector(".ph-otp-box");
      if (otpBox) otpBox.hidden = true;
      form.removeAttribute("data-ph-otp-open");
      form.reset();
      var done = form.querySelector(".ph-form-done");
      if (done) { done.setAttribute("role", "status"); done.hidden = false; }
      if (button) { button.textContent = message("Sent", "تم الإرسال"); button.hidden = true; }
    }

    function showOtpStep(form, data, token, email) {
      var otpBox = form.querySelector(".ph-otp-box");
      if (!otpBox) {
        otpBox = document.createElement("div");
        otpBox.className = "ph-otp-box";
        otpBox.innerHTML =
          '<label class="ph-field-label" for="ph-otp-code">' + message("Verification code", "رمز التحقق") + '</label>'
          + '<div class="ph-otp-row">'
          + '<input id="ph-otp-code" class="ph-otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr">'
          + '<button type="button" class="ph-btn ph-btn-primary ph-otp-verify">' + message("Verify & send", "تحقق وأرسل") + '</button>'
          + '</div>'
          + '<p class="ph-otp-hint"></p>'
          + '<button type="button" class="ph-otp-resend">' + message("Resend code", "إعادة إرسال الرمز") + '</button>';
        var submitBtn = form.querySelector("button[type=submit]");
        if (submitBtn) submitBtn.insertAdjacentElement("beforebegin", otpBox);
        else form.appendChild(otpBox);
      }
      var hint = otpBox.querySelector(".ph-otp-hint");
      if (hint) hint.textContent = message("We sent a 6-digit code to " + email + ". It expires in 10 minutes.", "أرسلنا رمزًا مكوّنًا من 6 أرقام إلى " + email + " — تنتهي صلاحيته خلال 10 دقائق.");
      var input = otpBox.querySelector(".ph-otp-input");
      if (input) { input.value = ""; input.focus(); }
      form.setAttribute("data-ph-otp-open", "true");
      form._phOtp = { data: data, token: token };
      otpBox.hidden = false;
      otpBox.scrollIntoView({ behavior: "smooth", block: "center" });

      var verifyBtn = otpBox.querySelector(".ph-otp-verify");
      var resendBtn = otpBox.querySelector(".ph-otp-resend");
      var error = form.querySelector(".ph-form-error");

      function postVerify(code, onDone) {
        if (!window.fetch) { if (error) { error.textContent = message("Sending is unavailable.", "الإرسال غير متاح."); error.hidden = false; } return; }
        verifyBtn.disabled = true;
        resendBtn.disabled = true;
        fetch(form.getAttribute("data-ph-endpoint"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action: "verify", otp_token: form._phOtp.token, otp_code: code })
        }).then(function (res) {
          return res.json().catch(function () { return null; }).then(function (body) { return { ok: res.ok, body: body }; });
        }).then(function (result) {
          if (result.ok && result.body && result.body.success === true) {
            onDone(true);
          } else {
            onDone(false, result.body && result.body.message);
          }
        }).catch(function () { onDone(false); });
      }

      verifyBtn.onclick = function () {
        var code = (input.value || "").replace(/\D/g, "");
        if (code.length !== 6) {
          if (error) { error.textContent = message("Enter the 6-digit code we emailed you.", "أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إليك."); error.hidden = false; }
          return;
        }
        if (error) error.hidden = true;
        verifyBtn.textContent = message("Verifying…", "جارٍ التحقق…");
        postVerify(code, function (ok, serverMessage) {
          verifyBtn.disabled = false;
          resendBtn.disabled = false;
          verifyBtn.textContent = message("Verify & send", "تحقق وأرسل");
          if (ok) {
            var button = form.querySelector("button[type=submit]");
            finishForm(form, button, button && button.textContent);
          } else {
            if (error) {
              error.textContent = serverMessage || message("Incorrect code. Please try again.", "رمز غير صحيح. حاول مرة أخرى.");
              error.setAttribute("role", "alert");
              error.hidden = false;
            }
            input.select();
          }
        });
      };

      resendBtn.onclick = function () {
        if (error) error.hidden = true;
        resendBtn.disabled = true;
        resendBtn.textContent = message("Sending…", "جارٍ الإرسال…");
        var endpoint = form.getAttribute("data-ph-endpoint");
        fetch(endpoint, { method: "POST", headers: { Accept: "application/json" }, body: form._phOtp.data })
          .then(function (res) { return res.json().catch(function () { return null; }); })
          .then(function (body) {
            resendBtn.disabled = false;
            resendBtn.textContent = message("Resend code", "إعادة إرسال الرمز");
            if (body && body.success === true && body.needs_otp === true && body.otp_token) {
              form._phOtp.token = body.otp_token;
              if (hint) hint.textContent = message("We sent a new 6-digit code to " + (body.otp_email || email) + ". It expires in 10 minutes.", "أرسلنا رمزًا جديدًا مكوّنًا من 6 أرقام إلى " + (body.otp_email || email) + " — تنتهي صلاحيته خلال 10 دقائق.");
              input.value = "";
              input.focus();
            } else if (error) {
              error.textContent = (body && body.message) || message("Could not resend the code. Please try again.", "تعذّرت إعادة إرسال الرمز. حاول مرة أخرى.");
              error.hidden = false;
            }
          })
          .catch(function () {
            resendBtn.disabled = false;
            resendBtn.textContent = message("Resend code", "إعادة إرسال الرمز");
            if (error) { error.textContent = message("Could not resend the code. Please try again.", "تعذّرت إعادة إرسال الرمز. حاول مرة أخرى."); error.hidden = false; }
          });
      };
    }
  }

  function fillYear() {
    var list = document.querySelectorAll("[data-ph-year]");
    for (var i = 0; i < list.length; i++) list[i].textContent = String(new Date().getFullYear());
  }

  function start() {
    bindToggles();
    bindHostedForms();
    setupDrawer();
    markCurrentLinks();
    fillYear();
    watchMessageBar();
    translate(document.body);
    translateTitle();
    watchChanges();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
}
