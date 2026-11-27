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
    return (
      String(currency.symbol || currency.currency_symbol || "AED").trim() +
      " " +
      value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  window.phFormatPrices = function (root) {
    var nodes = Array.from(
      (root || document).querySelectorAll("[data-zs-selling-price]"),
    );
    if (root && root.matches && root.matches("[data-zs-selling-price]"))
      nodes.unshift(root);
    nodes.forEach(function (node) {
      var min = amount(node.getAttribute("data-ph-price-min"));
      var max = amount(node.getAttribute("data-ph-price-max"));
      var price = amount(node.getAttribute("data-zs-selling-price"));
      var text =
        min !== null && max !== null && min !== max
          ? money(min) + " – " + money(max)
          : price !== null
            ? money(price)
            : "";
      if (!text) return;
      var value = node.querySelector("[data-ph-price-value]");
      if (value) value.textContent = text;
      else node.textContent = text;
      var previous = node.querySelector("[data-ph-price-old]");
      if (
        previous &&
        amount(previous.getAttribute("data-ph-price-old")) !== null
      )
        previous.textContent = money(
          amount(previous.getAttribute("data-ph-price-old")),
        );
    });
  };
  async function getDocument(url) {
    var response;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 8000);
    try {
      response = await fetch(url, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      return new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async function loadCatalog() {
    var grid = document.querySelector("[data-ph-best-sellers]");
    if (!grid) return;
    var section = grid.closest("[data-ph-best-section]");
    var seenPages = new Set(),
      seenProducts = new Set(),
      requests = 0;
    var queue = Array.from(
      document.querySelectorAll('.ph-cat-grid a[href*="/categories/"]'),
    ).map(function (link) {
      return link.href;
    });
    async function visit(href) {
      var doc, jobs;
      var url = new URL(href, siteLocation.href);
      if (
        url.origin !== siteLocation.origin ||
        seenPages.has(url.href) ||
        requests >= 10
      )
        return;
      seenPages.add(url.href);
      requests++;
      try {
        doc = await getDocument(url.href);
        jobs = [];
        doc.querySelectorAll("[data-ph-product-card]").forEach(function (card) {
          var link = card.querySelector('a[href*="/products/"]');
          if (!link || seenProducts.size >= 8) return;
          var productUrl = new URL(link.getAttribute("href"), url.href);
          if (productUrl.origin !== siteLocation.origin) return;
          var key =
            card.getAttribute("data-ph-product-id") || productUrl.pathname;
          if (seenProducts.has(key)) return;
          seenProducts.add(key);
          var copy = document.importNode(card, true);
          copy.querySelectorAll("[href], [src]").forEach(function (node) {
            ["href", "src"].forEach(function (attribute) {
              var value = node.getAttribute(attribute);
              if (value && !/^(data:|#)/i.test(value))
                node.setAttribute(attribute, new URL(value, url.href).href);
            });
          });
          window.phFormatPrices(copy);
          grid.appendChild(copy);
          // Product detail provides the authoritative range when category cards
          // expose only the first variant's price. Never hardcode a product.
          var price = copy.querySelector("[data-zs-selling-price]");
          if (price && !price.hasAttribute("data-ph-price-min"))
            jobs.push(
              getDocument(productUrl.href)
                .then(function (detail) {
                  var original = detail.querySelector("[data-ph-price]");
                  if (!original) return;
                  [
                    "data-zs-selling-price",
                    "data-ph-price-min",
                    "data-ph-price-max",
                  ].forEach(function (attribute) {
                    if (original.hasAttribute(attribute))
                      price.setAttribute(
                        attribute,
                        original.getAttribute(attribute),
                      );
                  });
                  window.phFormatPrices(copy);
                })
                .catch(function () {
                  /* Retain the server-rendered price. */
                }),
            );
        });
        doc
          .querySelectorAll('[data-ph-subcats] a[href*="/categories/"]')
          .forEach(function (link) {
            queue.push(new URL(link.getAttribute("href"), url.href).href);
          });
        await Promise.all(jobs);
      } catch (error) {
        /* An unavailable collection does not hide other collections. */
      }
    }
    while (queue.length && seenProducts.size < 8 && requests < 10)
      await Promise.all(queue.splice(0, 3).map(visit));
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
    var d;
    var root = document.querySelector("[data-ph-slider]");
    if (!root) return;
    var slides = Array.prototype.slice.call(
      root.querySelectorAll(".ph-hero-slide"),
    );
    if (!slides.length) return;
    var count = slides.length;
    var dotsHost = root.querySelector("[data-ph-dots]");
    var status = root.querySelector("[data-ph-slide-status]");
    var prevBtn = root.querySelector("[data-ph-slide-prev]");
    var nextBtn = root.querySelector("[data-ph-slide-next]");
    var toggleBtn = root.querySelector("[data-ph-slide-toggle]");
    var playIcon = toggleBtn && toggleBtn.querySelector("[data-ph-icon-play]");
    var pauseIcon =
      toggleBtn && toggleBtn.querySelector("[data-ph-icon-pause]");
    var index = 0;
    var timer = null;
    var playing = true;
    var hover = false;
    var focused = false;
    var touching = false;
    var touchX = 0;
    var reduced = !!(
      window.matchMedia &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    var dots = [];

    function rtl() {
      return (
        document.documentElement.dir === "rtl" ||
        document.documentElement.lang === "ar"
      );
    }
    function autoplayAllowed() {
      return playing && !reduced && !hover && !focused && !touching;
    }
    function slideLabel(i) {
      return i + 1 + " of " + count;
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
      if (status && !autoplayAllowed())
        status.textContent = "Slide " + slideLabel(index);
    }
    function arm() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (autoplayAllowed())
        timer = setTimeout(function () {
          goTo(index + 1);
        }, 6000);
    }
    function goTo(i) {
      index = (i + count) % count;
      if (index < 0) index += count;
      render();
      arm();
    }

    if (dotsHost && count > 1) {
      for (d = 0; d < count; d++) {
        (function (i) {
          var dot = document.createElement("button");
          dot.type = "button";
          dot.className = "ph-hero-dot";
          dot.setAttribute("aria-label", "Slide " + (i + 1));
          dot.addEventListener("click", function () {
            goTo(i);
          });
          dotsHost.appendChild(dot);
          dots.push(dot);
        })(d);
      }
    }
    if (prevBtn)
      prevBtn.addEventListener("click", function () {
        goTo(index - 1);
      });
    if (nextBtn)
      nextBtn.addEventListener("click", function () {
        goTo(index + 1);
      });
    if (toggleBtn) {
      function syncToggle() {
        var paused = !autoplayAllowed();
        toggleBtn.setAttribute(
          "aria-label",
          paused ? "Play slideshow" : "Pause slideshow",
        );
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

    root.addEventListener("mouseenter", function () {
      hover = true;
      arm();
    });
    root.addEventListener("mouseleave", function () {
      hover = false;
      arm();
    });
    root.addEventListener("focusin", function () {
      focused = true;
      arm();
    });
    root.addEventListener("focusout", function (event) {
      if (!root.contains(event.relatedTarget)) {
        focused = false;
        arm();
      }
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
  function initScrollReveals() {
    var targets = document.querySelectorAll(".ph-reveal, .ph-stagger");
    if (!targets.length) return;
    var reduced = !!(
      window.matchMedia &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    if (reduced) {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    // Hidden initial states apply only once JS opts in — no-JS keeps content visible.
    document.documentElement.classList.add("ph-motion");
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach(function (el) {
      io.observe(el);
    });
  }
  function ready() {
    document.querySelectorAll("style").forEach(function (style) {
      var text = style.textContent || "";
      if (
        text.indexOf("ph-footer__inner") !== -1 &&
        /direction\s*:\s*rtl/.test(text)
      )
        style.remove();
    });
    var path = window.phRoutePath();
    var route =
      ["/", "/home", "/index", "/index.html"].indexOf(path) >= 0
        ? "home"
        : path.slice(1);
    var main = document.querySelector("[data-ph-page-body]");
    var fallback = document.querySelector(
      '[data-ph-route="' + route.replace(/[^a-z-]/g, "") + '"]',
    );
    if (main && fallback && fallback.content)
      main.replaceChildren(fallback.content.cloneNode(true));
    if (main)
      document.body.classList.toggle(
        "is-home",
        !!main.querySelector(".ph-hero"),
      );
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
    initScrollReveals();
    loadCatalog();
    var grid = document.querySelector("[data-ph-best-sellers]");
    if (grid)
      [
        ["[data-ph-carousel-prev]", -1],
        ["[data-ph-carousel-next]", 1],
      ].forEach(function (entry) {
        var button = document.querySelector(entry[0]);
        if (!button) return;
        button.addEventListener("click", function () {
          grid.scrollBy({
            left:
              grid.clientWidth *
              entry[1] *
              (document.documentElement.dir === "rtl" ? -1 : 1),
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        });
      });
    // Anchor targets belong to the newly selected page rather than Home.
    if (location.hash)
      requestAnimationFrame(function () {
        var target = document.getElementById(
          decodeURIComponent(location.hash.slice(1)),
        );
        if (target) target.scrollIntoView();
      });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", ready, { once: true });
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
      return Array.prototype.slice.call(
        (root || document).querySelectorAll(sel),
      );
    }

    var drawerOpener = null;

    function cartHeaders() {
      var headers = {
        "Content-Type": "application/json",
        "x-zs-cart-cookie-httponly": "true",
      };
      if (window.zsUtils && zsUtils.getCSRFHeader) {
        Object.assign(headers, zsUtils.getCSRFHeader());
      }
      return headers;
    }

    function readCartResponse(response) {
      return response.json().then(function (data) {
        if (
          !response.ok ||
          (data.status_code != null && Number(data.status_code) !== 0) ||
          (data.code != null && Number(data.code) !== 0) ||
          data.status_message === "failure"
        ) {
          throw new Error(
            (data.error && data.error.message) ||
              data.message ||
              "Unable to update your cart. Please try again.",
          );
        }
        return data;
      });
    }
    function drawerFeedback(message) {
      var node = qs("[data-ph-drawer-feedback]");
      if (node) {
        node.hidden = !message;
        node.textContent = message || "";
      }
    }
    function mutateDrawer(row, url, options) {
      var host = qs("[data-ph-drawer-items]");
      if (!host || host.getAttribute("aria-busy") === "true") return;
      host.setAttribute("aria-busy", "true");
      qsa("button,input", host).forEach(function (el) {
        el.disabled = true;
      });
      drawerFeedback("Updating your cart…");
      fetch(url, options)
        .then(readCartResponse)
        .then(function (data) {
          if (
            (data.payload && data.payload.items) ||
            (data.cart_details && data.cart_details.items)
          )
            renderCartDrawer(data);
          else return loadCartDrawer();
          drawerFeedback("");
        })
        .catch(function (error) {
          drawerFeedback(error.message);
          return loadCartDrawer();
        })
        .finally(function () {
          host.removeAttribute("aria-busy");
          qsa("button,input", host).forEach(function (el) {
            el.disabled = false;
          });
        });
    }

    function cartItemsFrom(data) {
      if (!data) return [];
      if (data.payload && data.payload.items) return data.payload.items;
      if (data.cart_details && data.cart_details.items)
        return data.cart_details.items;
      return [];
    }

    function updateCartBadge(data) {
      var items = cartItemsFrom(data);
      var count = items.reduce(function (sum, item) {
        return sum + (parseInt(item.quantity, 10) || 1);
      }, 0);
      if (!count && data && data.payload) {
        count = Number(
          data.payload.count ||
            data.payload.cart_count ||
            data.payload.total_count ||
            0,
        );
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
        chip.classList.toggle(
          "is-in-cart",
          !!ids[chip.getAttribute("data-ph-variant-id")],
        );
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
        name = name
          .replace(" - " + size, "")
          .replace(size, "")
          .replace(/\s+-\s*$/, "")
          .trim();
      }
      return name || "Specimen";
    }

    function itemPhotoUrl(item) {
      var image = item && item.images && item.images[0];
      return image && isRealSrc(image.url) ? hdImageUrl(image.url) : "";
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
        host.innerHTML =
          '<div class="ph-drawer-empty"><p>Your selection is empty.</p><a class="ph-btn" href="/all-collections">Browse collections</a></div>';
        if (foot) foot.hidden = true;
        return data;
      }
      host.innerHTML = items
        .map(function (item) {
          var photo = itemPhotoUrl(item);
          var size = itemSize(item);
          var bits = [];
          if (size) bits.push(size);
          if (item.sku) bits.push(item.sku);
          return (
            '<article class="ph-drawer-item" data-ph-drawer-row data-zs-product-variant-id="' +
            esc(item.variant_id || "") +
            '" data-zs-product-wrapper-lineitem-id="' +
            esc(item.line_item_id || "") +
            '">' +
            '<div class="ph-drawer-photo"' +
            (photo
              ? " style=\"background-image:url('" + esc(photo) + "')\""
              : "") +
            "></div>" +
            "<div>" +
            '<a class="ph-drawer-name" href="' +
            esc(item.url || "/cart") +
            '">' +
            esc(itemTitle(item)) +
            "</a>" +
            (bits.length
              ? '<p class="ph-drawer-meta">' + esc(bits.join(" · ")) + "</p>"
              : "") +
            '<div class="ph-drawer-row">' +
            '<div class="ph-qty-box">' +
            '<button type="button" class="ph-qty-btn" data-ph-drawer-minus aria-label="Decrease quantity">−</button>' +
            '<input class="ph-qty" data-zs-quantity type="number" min="1"' +
            (lineStockMax(item) !== null
              ? ' max="' + lineStockMax(item) + '"'
              : "") +
            ' value="' +
            esc(item.quantity || 1) +
            '" aria-label="Quantity">' +
            '<button type="button" class="ph-qty-btn" data-ph-drawer-plus aria-label="Increase quantity">+</button>' +
            "</div>" +
            '<div class="ph-drawer-price">' +
            esc(
              money(
                item.total_price != null
                  ? item.total_price
                  : item.selling_price,
              ),
            ) +
            "</div>" +
            "</div>" +
            '<button type="button" class="ph-drawer-remove" data-ph-drawer-remove>Remove</button>' +
            "</div>" +
            "</article>"
          );
        })
        .join("");
      if (foot) foot.hidden = false;
      if (sub) sub.textContent = money(payload.sub_total);
      if (checkout) checkout.href = payload.checkout_url || "/checkout";
      return data;
    }

    function loadCartBadge() {
      fetch("/storefront/api/v1/cart", {
        credentials: "same-origin",
        headers: cartHeaders(),
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          if (data) updateCartBadge(data);
        })
        .catch(function () {});
    }

    function loadCartDrawer() {
      return fetch("/storefront/api/v1/cart", {
        credentials: "same-origin",
        headers: cartHeaders(),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("Cart request failed: " + res.status);
          return res.json();
        })
        .then(renderCartDrawer)
        .catch(function () {
          var host = qs("[data-ph-drawer-items]");
          var foot = qs("[data-ph-drawer-foot]");
          if (host) {
            host.innerHTML =
              '<div class="ph-drawer-empty" role="alert"><p>Could not load your selection. You can view the cart page instead.</p><a class="ph-btn" href="/cart">View full selection</a></div>';
          }
          if (foot) foot.hidden = true;
        });
    }

    function openCartDrawer() {
      var drawer = qs("[data-ph-drawer]");
      if (!drawer) return;
      if (!drawer.classList.contains("is-open"))
        drawerOpener = document.activeElement;
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
      if (
        item.stock_available == null ||
        item.stock_available === "" ||
        !isFinite(stock)
      )
        return null;
      if (
        item.is_stock_managed !== true &&
        stock === 0 &&
        !item.is_out_of_stock
      )
        return null;
      if (item.is_out_of_stock || item.is_available_for_purchase === false)
        return 0;
      return Math.max(0, Math.floor(stock));
    }

    function capLineQty(qty, next) {
      var max;
      var value = Math.max(1, parseInt(next, 10) || 1);
      if (qty && qty.hasAttribute("max")) {
        max = parseInt(qty.getAttribute("max"), 10);
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
      mutateDrawer(row, "/storefront/api/v1/cart", {
        method: "PUT",
        headers: cartHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
    }

    function removeDrawerRow(row) {
      var variantId = row.getAttribute("data-zs-product-variant-id");
      var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
      if (!variantId) return;
      var url =
        "/storefront/api/v1/cart?product_variant_id=" +
        encodeURIComponent(variantId);
      if (lineId) url += "&line_item_id=" + encodeURIComponent(lineId);
      mutateDrawer(row, url, {
        method: "DELETE",
        headers: cartHeaders(),
        credentials: "same-origin",
      });
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
          var focusable = qsa(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
            panel,
          ).filter(function (el) {
            return !el.closest("[hidden]");
          });
          if (!focusable.length) {
            event.preventDefault();
            panel.focus();
            return;
          }
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panel)
          ) {
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
        if (event.target.closest("[data-ph-drawer-minus]"))
          changeDrawerQty(row, current - 1);
        if (event.target.closest("[data-ph-drawer-plus]"))
          changeDrawerQty(row, current + 1);
        if (event.target.closest("[data-ph-drawer-remove]"))
          removeDrawerRow(row);
      });
      host.addEventListener("change", function (event) {
        if (!event.target || !event.target.hasAttribute("data-zs-quantity"))
          return;
        var row = event.target.closest("[data-ph-drawer-row]");
        if (row) changeDrawerQty(row, parseInt(event.target.value || "1", 10));
      });
    }

    function realImages(list) {
      return (list || []).filter(function (image) {
        return (
          image &&
          image.url &&
          !image.is_placeholder_image &&
          image.url.indexOf("no-preview-image") === -1
        );
      });
    }

    function isRealSrc(src) {
      if (!src) return false;
      var value = String(src);
      return (
        value.indexOf("no-preview-image") === -1 &&
        value.indexOf("unsplash") === -1 &&
        value.indexOf("zcstock-images") === -1 &&
        value.indexOf("zfcommerce/stock-images") === -1 &&
        value.indexOf("/stock-images/") === -1
      );
    }

    function hdImageUrl(url, size) {
      if (!url) return "";
      var value = String(url)
        .replace(/&amp;/g, "&")
        .replace(/\/(original|\d{2,4}x\d{2,4})\/?(?=\?|$)/i, "");
      if (!isRealSrc(value)) return value;
      var sized = size || "1600x1600";
      var match = value.match(
        /^(https?:\/\/[^/?#]+)?(\/(?:product-images|category-images)\/[^/?#]+\.(?:jpe?g|png|webp|gif)\/\d+)/i,
      );
      if (match) return (match[1] || "") + match[2] + "/" + sized;
      return value;
    }

    function upgradeStoreImages(root) {
      qsa("img", root || document).forEach(function (img) {
        var src = img.getAttribute("src") || "";
        var hd = hdImageUrl(src);
        if (hd && hd !== src) img.setAttribute("src", hd);
      });
      qsa("[style*='background-image']", root || document).forEach(
        function (el) {
          var bg = el.style.backgroundImage || "";
          var found = bg.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (!found) return;
          var hd = hdImageUrl(found[1]);
          if (hd && hd !== found[1])
            el.style.backgroundImage = "url('" + hd + "')";
        },
      );
      qsa("[data-ph-real-photo]", root || document).forEach(function (el) {
        var src = el.getAttribute("data-ph-real-photo") || "";
        var hd = hdImageUrl(src);
        if (hd && hd !== src) el.setAttribute("data-ph-real-photo", hd);
      });
    }

    function isImageUrl(url) {
      return (
        /^data:image\//i.test(url) ||
        /(?:product|category)-images\//i.test(url) ||
        /\.(?:jpe?g|png|webp|gif|avif|svg)(?:[/?#]|$)/i.test(url)
      );
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
      var cache;
      try {
        cache = JSON.parse(sessionStorage.getItem("phCatPhotosV2") || "{}");
        Object.keys(cache).forEach(function (key) {
          cache[key] = hdImageUrl(cache[key]);
        });
        return cache;
      } catch (err) {
        return {};
      }
    }

    function photoCacheSet(cache) {
      try {
        sessionStorage.setItem("phCatPhotosV2", JSON.stringify(cache));
      } catch (err) {}
    }

    function photoFromHtml(html) {
      var url;
      var urls =
        String(html || "").match(
          /https?:[^"'\\\s<>]+(?:product-images|category-images)[^"'\\\s<>]*/gi,
        ) || [];
      var i;
      for (i = 0; i < urls.length; i++) {
        url = urls[i].replace(/&amp;/g, "&");
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
      var pageUrl =
        href && href.indexOf("/categories/") === 0 ? href : "/categories/" + id;
      return fetch(pageUrl, { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok)
            throw new Error("Category page request failed: " + res.status);
          return res.text();
        })
        .then(function (html) {
          return remember(photoFromHtml(html));
        })
        .catch(function () {
          return "";
        });
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
            queue.push(
              "/" + encodeURIComponent(name + ext).replace(/%2F/g, "/"),
            );
            queue.push("/" + name + ext);
          });
        });
        return queue.reduce(function (prev, url) {
          return prev.then(function (found) {
            if (found) return found;
            return fetch(url, { credentials: "same-origin" })
              .then(function (res) {
                var type = (
                  res.headers.get("content-type") || ""
                ).toLowerCase();
                return res.ok && type.indexOf("image/") === 0 ? url : "";
              })
              .catch(function () {
                return "";
              });
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
        var leftover = qsa("img", host).filter(function (img) {
          return !img.getAttribute("data-ph-used-in-slot");
        });
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
      var variants;
      var product = window.zs_product;
      var images = realImages(product && product.images);
      if (product && !images.length) {
        variants = product.variants || [];
        variants.forEach(function (variant) {
          images = images.concat(realImages(variant.images));
        });
      }
      if (images.length) {
        qsa("[data-ph-gallery]").forEach(function (gal) {
          if (gal.hasAttribute("data-ph-product-gallery")) {
            if (!gal.querySelector("img[src*='product-images']")) {
              list = qs("[data-ph-product-images]", gal) ||
                qs("[data-ph-main-image]", gal) ||
                gal;
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
        if (item.category_id && photos.length)
          byCategory[item.category_id] = photos[0].url;
      });
      qsa("[data-ph-cat-photo]").forEach(function (el, index) {
        var card;
        var sub = ((category && category.sub_categories) || [])[index] || {};
        var id =
          el.getAttribute("data-ph-cat-photo") ||
          sub.id ||
          sub.category_id ||
          "";
        if (id) {
          el.setAttribute("data-ph-cat-photo", id);
          card = el.closest("[data-ph-cat-id], a.ph-product-card");
          if (card && !card.getAttribute("data-ph-cat-id"))
            card.setAttribute("data-ph-cat-id", id);
        }
        var marked = qs("[data-ph-real-photo]", el);
        var url =
          (marked && marked.getAttribute("data-ph-real-photo")) ||
          byCategory[id] ||
          "";
        if (url) setPhoto(el, url);
      });

      var products = (category && category.products) || [];
      products.forEach(function (item) {
        var list, firstVariant;
        var card = qs("[data-ph-product-id='" + item.product_id + "']");
        if (!card) return;
        var photos = realImages(item.images);
        var gal = qs("[data-ph-gallery]", card);
        if (
          gal &&
          photos.length &&
          !gal.querySelector("img[src*='product-images']")
        ) {
          list = qs("[data-ph-product-images]", gal) || gal;
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
          firstVariant = item.variants.filter(function (v) {
            return v && v.variant_id;
          })[0];
          if (firstVariant)
            wishBtn.setAttribute(
              "data-zs-wishlist-variant-id",
              firstVariant.variant_id,
            );
        }
      });
      if (window.__phWishlistSync) window.__phWishlistSync();
    }

    function stripNoise(root) {
      var value;
      if (!root || !root.childNodes) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var doomed = [];
      var node;
      while ((node = walker.nextNode())) {
        value = node.nodeValue || "";
        if (/^[nN\s]+$/.test(value) && /[nN]/.test(value)) {
          doomed.push(node);
          continue;
        }
        if (
          /\/template\/[a-f0-9]{16,}/i.test(value) &&
          !/\.(svg|png|jpe?g|css|js|webp)/i.test(value)
        ) {
          doomed.push(node);
        }
      }
      doomed.forEach(function (textNode) {
        if (textNode.parentNode) textNode.parentNode.removeChild(textNode);
      });
      qsa("a[href], img[src]", root).forEach(function (el) {
        var v = el.getAttribute("href") || el.getAttribute("src") || "";
        if (
          /\/template\/[a-f0-9]+\/?$/i.test(v) &&
          !/\.(svg|png|jpe?g|webp|ico)/i.test(v) &&
          v.indexOf("/canvas/") === -1
        ) {
          el.style.display = "none";
        }
      });
    }

    function tidyCategoryCatalog() {
      var cat = window.zs_category;
      var subCards = qsa(".ph-category-grid .ph-product-card");
      var hasSubs =
        subCards.length > 0 ||
        !!(cat && cat.sub_categories && cat.sub_categories.length);
      var subGroup = qs("[data-ph-subcats]") || qs(".ph-cat-group");
      if (subGroup && !hasSubs) subGroup.hidden = true;
    }

    function markCurrentNav() {
      var path = window.phRoutePath
        ? window.phRoutePath()
        : (location.pathname || "/").replace(/\/+$/, "") || "/";
      qsa(".ph-nav-list a").forEach(function (link) {
        var href = window.phRoutePath
          ? window.phRoutePath(link.href)
          : (link.getAttribute("href") || "").replace(/\/+$/, "") || "/";
        if (href === path || (href !== "/" && path.indexOf(href) === 0)) {
          link.setAttribute("aria-current", "page");
        }
      });
    }

    function enhanceProductGallery(gal) {
      if (!gal) return;
      var imgs = qsa("img", gal).filter(function (img) {
        return isRealSrc(img.currentSrc || img.src);
      });
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
      if (sourceList && sourceList !== mainHost)
        sourceList.style.display = "none";
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
          qsa(".ph-thumb", thumbs).forEach(function (el) {
            el.classList.remove("is-active");
          });
          btn.classList.add("is-active");
        });
        thumbs.appendChild(btn);
      });
    }

    function money(amount) {
      var num = Number(amount);
      if (!isFinite(num)) return "";
      var symbol =
        (window.zs_currency &&
          (zs_currency.symbol || zs_currency.currency_symbol)) ||
        "AED ";
      return (
        String(symbol).trim() +
        " " +
        num.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }

    function productVariants() {
      return (window.zs_product && zs_product.variants) || [];
    }

    function findVariant(id) {
      return (
        productVariants().filter(function (variant) {
          return String(variant.variant_id) === String(id);
        })[0] || null
      );
    }

    function findVariantByOptions(selected) {
      var wanted = (selected || []).map(String).sort().join();
      if (!wanted) return null;
      return (
        productVariants().filter(function (variant) {
          var ids = (variant.options || [])
            .map(function (option) {
              return String(option.id);
            })
            .sort()
            .join();
          return ids === wanted;
        })[0] || null
      );
    }

    function variantStockCap(variant) {
      if (!variant || variant.is_stock_managed === false) return null;
      var stock = Number(variant.stock_available);
      if (
        variant.is_stock_managed !== true &&
        stock === 0 &&
        !variant.is_out_of_stock
      )
        return null;
      return variant.stock_available == null || variant.stock_available === ""
        ? null
        : isFinite(stock)
          ? Math.max(0, Math.floor(stock))
          : null;
    }

    function variantIsUnavailable(variant) {
      if (!variant) return true;
      if (
        variant.is_available_for_purchase === false ||
        variant.hide_add_to_cart
      )
        return true;
      if (variant.is_out_of_stock) return true;
      var stock = variantStockCap(variant);
      return stock !== null && stock <= 0;
    }

    function clampQty(qty) {
      var max;
      if (!qty) return 1;
      var min = parseInt(qty.getAttribute("min") || "1", 10);
      if (!isFinite(min) || min < 1) min = 1;
      var next = parseInt(qty.value || String(min), 10);
      if (!isFinite(next) || next < min) next = min;
      if (qty.hasAttribute("max")) {
        max = parseInt(qty.getAttribute("max"), 10);
        if (isFinite(max) && max >= min) next = Math.min(next, max);
      }
      qty.value = String(next);
      return next;
    }

    function applyVariant(variant, options) {
      var url;
      if (!variant) return;
      options = options || {};
      var button = qs("[data-zs-add-to-cart]");
      if (button)
        button.setAttribute("data-zs-product-variant-id", variant.variant_id);
      qsa("[data-zs-wishlist-element]").forEach(function (el) {
        el.setAttribute("data-zs-wishlist-variant-id", variant.variant_id);
        markWishlist(el, false);
      });
      if (window.__phWishlistSync) window.__phWishlistSync();
      var price = qs("[data-ph-price]");
      if (
        price &&
        !variant.hide_price &&
        (variant.selling_price || variant.selling_price === 0)
      ) {
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
      var stockText = unavailable
        ? "Out of stock"
        : stock > 0
          ? stock + " in nursery"
          : "Available";
      if (stockEl) {
        stockEl.hidden = false;
        stockEl.className =
          "ph-stock" +
          (unavailable ? " is-oos" : stock > 0 && stock <= 3 ? " is-low" : "");
        stockEl.textContent = stockText;
      }
      if (specStock)
        specStock.textContent = unavailable
          ? "Out of stock"
          : stock > 0
            ? stock + " NOS"
            : "Available";
      if (button) {
        button.disabled = unavailable;
        button.textContent = unavailable ? "Out of stock" : "Add to cart";
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
        var on =
          String(chip.getAttribute("data-ph-variant-id")) ===
          String(variant.variant_id);
        chip.classList.toggle("is-active", on);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
      });
      qsa("[data-zs-attribute-select]").forEach(function (sel) {
        (variant.options || []).forEach(function (option) {
          if (
            Array.from(sel.options).some(function (choice) {
              return String(choice.value) === String(option.id);
            })
          ) {
            sel.value = String(option.id);
          }
        });
      });
      var pick = qs("[data-ph-variant-pick]");
      if (pick) pick.value = variant.variant_id;
      qsa("[data-ph-color-swatch]").forEach(function (swatch) {
        var on = (variant.options || []).some(function (option) {
          return (
            String(option.id) ===
            String(swatch.getAttribute("data-ph-option-id"))
          );
        });
        swatch.classList.toggle("is-active", on);
        swatch.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (options.updateUrl !== false) {
        try {
          url = new URL(location.href);
          url.searchParams.set("variant", variant.variant_id);
          history.replaceState(
            {},
            "",
            url.pathname + "?" + url.searchParams.toString(),
          );
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
          chip.textContent =
            ((variant.options || [])[0] && variant.options[0].value) ||
            variant.sku ||
            "Size";
          host.appendChild(chip);
        });
      }
      qsa("[data-ph-size-chip]").forEach(function (chip) {
        var variant = findVariant(chip.getAttribute("data-ph-variant-id"));
        var blocked = variantIsUnavailable(variant);
        chip.classList.toggle("is-oos", blocked);
        chip.disabled = blocked;
        chip.setAttribute("aria-disabled", blocked ? "true" : "false");
        chip.title = blocked ? "Out of stock" : "";
      });
    }

    var SWATCH_COLORS = {
      white: "#f7f4ee",
      cream: "#f3ead7",
      "cream white": "#f3ead7",
      ivory: "#f6f1e4",
      beige: "#e6d3b4",
      grey: "#b7b7b7",
      gray: "#b7b7b7",
      "light grey": "#d7d7d7",
      "light gray": "#d7d7d7",
      "dark grey": "#5e5e5e",
      "dark gray": "#5e5e5e",
      black: "#242424",
      brown: "#8a5a3a",
      "dark brown": "#5c4033",
      "light brown": "#c4a484",
      green: "#2f6b4f",
      anthracite: "#3c3c3c",
      taupe: "#8d7b6a",
      terracotta: "#c46a45",
      rust: "#a3522f",
      bronze: "#8a6a3b",
      champagne: "#e7d7b8",
      natural: "#d8d2c6",
    };

    function swatchColor(label) {
      var key = String(label || "")
        .trim()
        .toLowerCase();
      if (SWATCH_COLORS[key]) return SWATCH_COLORS[key];
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(key)) return key;
      return "";
    }

    function isColorAttribute(select) {
      return /color|colour|لون/i.test(select.getAttribute("aria-label") || "");
    }

    function bindColorSwatches() {
      var host = qs("[data-ph-color-fields]");
      var row = qs("[data-ph-color-swatches]");
      if (!host || !row || row.childElementCount) return;
      var selects = qsa("[data-zs-attribute-select]").filter(isColorAttribute);
      if (!selects.length) return;
      host.hidden = false;
      var label = qs("[data-ph-color-label]");
      if (label)
        label.textContent = selects[0].getAttribute("aria-label") || "Color";
      selects.forEach(function (select) {
        Array.from(select.options).forEach(function (choice) {
          if (!choice.value) return;
          var swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "ph-color-swatch";
          swatch.setAttribute("data-ph-color-swatch", "");
          swatch.setAttribute("data-ph-option-id", choice.value);
          swatch.setAttribute(
            "data-ph-attr-id",
            select.getAttribute("data-zs-attribute-id") || "",
          );
          swatch.setAttribute("aria-label", choice.textContent.trim());
          swatch.setAttribute("title", choice.textContent.trim());
          swatch.setAttribute("aria-pressed", "false");
          var paint = swatchColor(choice.textContent);
          if (paint) swatch.style.backgroundColor = paint;
          swatch.addEventListener("click", function () {
            select.value = choice.value;
            var selected = qsa("[data-zs-attribute-select]")
              .map(function (item) {
                return item.value;
              })
              .filter(Boolean);
            var variant = findVariantByOptions(selected);
            if (!variant) {
              variant = productVariants().filter(function (item) {
                return (
                  (item.options || []).some(function (option) {
                    return String(option.id) === String(choice.value);
                  }) && !variantIsUnavailable(item)
                );
              })[0];
            }
            if (variant) applyVariant(variant);
            else select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          row.appendChild(swatch);
        });
      });
    }

    function bindProductBuy() {
      var chosen, open;
      qsa("[data-zs-variants] option[data-ph-option-ids]").forEach(
        function (opt) {
          var ids = (opt.getAttribute("data-ph-option-ids") || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          opt.setAttribute("data-zs-attributes", JSON.stringify(ids));
        },
      );
      var button = qs("[data-zs-add-to-cart]");
      var hidden = qs("[data-zs-variants]");
      ensureSizeChips();
      function resolveVariant(updateUrl) {
        var selected, selectedIds;
        var pick = qs("[data-ph-variant-pick]");
        var variant = null;
        if (pick && pick.value) variant = findVariant(pick.value);
        if (!variant) {
          selected = qsa("[data-zs-attribute-select]")
            .map(function (sel) {
              return sel.value;
            })
            .filter(Boolean);
          variant = findVariantByOptions(selected);
        }
        if (!variant && hidden && button) {
          selectedIds = [];
          qsa("[data-zs-attribute-select]").forEach(function (sel) {
            if (sel.value) selectedIds.push(String(sel.value));
          });
          selectedIds.sort();
          Array.from(hidden.options).forEach(function (opt) {
            var ids = [];
            try {
              ids = JSON.parse(opt.getAttribute("data-zs-attributes") || "[]");
            } catch (err) {
              ids = [];
            }
            ids = (ids || []).map(String).sort();
            if (
              selectedIds.length &&
              ids.join() === selectedIds.join() &&
              opt.value &&
              opt.value !== "-1"
            ) {
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
          if (chip.disabled) return;
          var variant = findVariant(chip.getAttribute("data-ph-variant-id"));
          if (!variant || variantIsUnavailable(variant)) return;
          applyVariant(variant);
        });
      });
      bindColorSwatches(resolveVariant);
      qsa("[data-zs-attribute-select], [data-ph-variant-pick]").forEach(
        function (sel) {
          sel.addEventListener("change", function () {
            resolveVariant(true);
          });
        },
      );
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
          var max = qty.hasAttribute("max")
            ? parseInt(qty.getAttribute("max"), 10)
            : current + 1;
          if (!isFinite(max)) max = current;
          qty.value = String(Math.min(max, current + 1));
          clampQty(qty);
        });
      }
      if (qty) {
        qty.addEventListener("input", function () {
          clampQty(qty);
        });
        qty.addEventListener("change", function () {
          clampQty(qty);
        });
      }
      qsa("[data-zs-attribute-select] option").forEach(function (choice) {
        if (!choice.value) return;
        var matches = productVariants().filter(function (variant) {
          return (variant.options || []).some(function (option) {
            return String(option.id) === String(choice.value);
          });
        });
        if (matches.length) choice.disabled = false;
      });
      if (wanted && findVariant(wanted))
        applyVariant(findVariant(wanted), { updateUrl: false });
      else {
        resolveVariant(false);
        chosen = findVariant(
          button && button.getAttribute("data-zs-product-variant-id"),
        );
        if (variantIsUnavailable(chosen)) {
          open = productVariants().filter(function (variant) {
            return !variantIsUnavailable(variant);
          })[0];
          if (open || productVariants()[0])
            applyVariant(open || productVariants()[0], { updateUrl: false });
        }
      }
      if (button) {
        button.addEventListener("click", function (event) {
          var size;
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
            size = qs("[data-zs-attribute-select], [data-ph-variant-pick]");
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
          var sizeLabel =
            (variant &&
              variant.options &&
              variant.options[0] &&
              variant.options[0].value) ||
            "Size";
          button.disabled = true;
          fetch("/storefront/api/v1/cart", {
            method: "POST",
            headers: cartHeaders(),
            credentials: "same-origin",
            body: JSON.stringify({
              product_variant_id: variantId,
              quantity: String(
                variantIsUnavailable(variant) ? 0 : clampQty(qtyEl),
              ),
            }),
          })
            .then(function (res) {
              return res.json();
            })
            .then(function (data) {
              var sizeNode;
              var ok =
                data &&
                ((data.payload && data.payload.items) ||
                  (data.cart_details && data.cart_details.items) ||
                  data.status_code === "0" ||
                  data.status_message === "success");
              button.disabled = variantIsUnavailable(variant);
              if (ok) {
                updateCartBadge(data);
                renderCartDrawer(data);
                openCartDrawer();
                if (note) {
                  note.hidden = false;
                  sizeNode = qs("[data-ph-buy-ok-size]", note);
                  if (sizeNode) sizeNode.textContent = sizeLabel;
                  else note.textContent = sizeLabel + " added to your cart.";
                }
                return;
              }
              if (err) {
                err.style.display = "block";
                err.textContent =
                  (data.error && data.error.message) ||
                  (data.cart_details && data.cart_details.message) ||
                  "Could not add this specimen.";
              }
            })
            .catch(function () {
              button.disabled = variantIsUnavailable(findVariant(variantId));
              if (err) {
                err.style.display = "block";
                err.textContent = "Could not add this specimen.";
              }
            });
        });
      }
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

      var feedback = qs("[data-ph-cart-feedback]");
      function cartFeedback(message, error) {
        if (!feedback) return;
        feedback.hidden = false;
        feedback.classList.toggle("is-error", !!error);
        feedback.textContent = message;
      }
      function mutateCart(row, url, options) {
        if (row.getAttribute("aria-busy") === "true") return;
        row.setAttribute("aria-busy", "true");
        var controls = qsa("button, input", row);
        controls.forEach(function (el) {
          el.disabled = true;
        });
        cartFeedback("Updating your cart…", false);
        fetch(url, options)
          .then(readCartResponse)
          .then(function (data) {
            if (data.code !== undefined && Number(data.code) !== 0)
              throw new Error("Cart update rejected");
            window.location.reload();
          })
          .catch(function (error) {
            row.removeAttribute("aria-busy");
            controls.forEach(function (el) {
              el.disabled = false;
            });
            cartFeedback(
              error.message || "Unable to update your cart. Please try again.",
              true,
            );
          });
      }

      function updateRow(row) {
        var qty = qs("[data-zs-quantity]", row);
        var variantId = row.getAttribute("data-zs-product-variant-id");
        var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
        if (!variantId || !qty) return;
        var cappedQty = capLineQty(qty, qty.value);
        if (cappedQty === null) return;
        qty.value = String(cappedQty);
        var body = {
          product_variant_id: variantId,
          quantity: String(cappedQty),
        };
        if (lineId) body.line_item_id = lineId;
        mutateCart(row, "/storefront/api/v1/cart", {
          method: "PUT",
          headers: cartHeaders(),
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
      }

      function removeRow(row) {
        var variantId = row.getAttribute("data-zs-product-variant-id");
        var lineId = row.getAttribute("data-zs-product-wrapper-lineitem-id");
        if (!variantId) return;
        var url =
          "/storefront/api/v1/cart?product_variant_id=" +
          encodeURIComponent(variantId);
        if (lineId) url += "&line_item_id=" + encodeURIComponent(lineId);
        mutateCart(row, url, {
          method: "DELETE",
          headers: cartHeaders(),
          credentials: "same-origin",
        });
      }

      fetch("/storefront/api/v1/cart", {
        credentials: "same-origin",
        headers: cartHeaders(),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          var payload = data.payload || data.cart_details || {};
          var items = payload.items || [];
          var rows = qsa("[data-ph-cart-row]", root);
          var subtotal = qs("[data-ph-cart-subtotal]");
          if (subtotal && payload.sub_total != null)
            subtotal.textContent = money(payload.sub_total);
          items.forEach(function (item) {
            var lineMax, bits;
            var row =
              rows.filter(function (el) {
                var url = el.getAttribute("data-ph-item-url") || "";
                var line = el.getAttribute(
                  "data-zs-product-wrapper-lineitem-id",
                );
                if (line && item.line_item_id)
                  return line === String(item.line_item_id);
                return (
                  variantFromUrl(url) === String(item.variant_id) ||
                  url.indexOf(item.variant_id) >= 0
                );
              })[0] || rows[items.indexOf(item)];
            if (!row) return;
            row.setAttribute("data-zs-product-id", item.product_id || "");
            row.setAttribute(
              "data-zs-product-variant-id",
              item.variant_id || "",
            );
            row.setAttribute(
              "data-zs-product-wrapper-lineitem-id",
              item.line_item_id || "",
            );
            var sflBtn = row.querySelector("[data-zs-save-for-later]");
            if (sflBtn) {
              sflBtn.setAttribute(
                "data-zs-product-variant-id",
                item.variant_id || "",
              );
              sflBtn.setAttribute(
                "data-zs-product-lineitem-id",
                item.line_item_id || "",
              );
            }
            var qty = qs("[data-zs-quantity]", row);
            if (qty) {
              qty.setAttribute("data-zs-product-id", item.product_id || "");
              qty.setAttribute(
                "data-zs-product-variant-id",
                item.variant_id || "",
              );
              qty.setAttribute(
                "data-zs-product-lineitem-id",
                item.line_item_id || "",
              );
              lineMax = lineStockMax(item);
              if (lineMax !== null) qty.setAttribute("max", String(lineMax));
              qty.value = item.quantity;
            }
            var del = qs("[data-zs-delete]", row);
            if (del) {
              del.setAttribute("data-zs-product-id", item.product_id || "");
              del.setAttribute(
                "data-zs-product-variant-id",
                item.variant_id || "",
              );
              del.setAttribute(
                "data-zs-product-lineitem-id",
                item.line_item_id || "",
              );
            }
            var photo =
              (item.images && item.images[0] && item.images[0].url) || "";
            if (photo && photo.indexOf("no-preview-image") === -1)
              setPhoto(qs("[data-ph-cart-photo]", row), photo);
            var meta = qs("[data-ph-cart-meta]", row);
            if (meta) {
              bits = [];
              if (item.sku) bits.push(item.sku);
              (item.options || []).forEach(function (option) {
                if (option.value) bits.push(option.value);
              });
              meta.textContent = bits.join(" · ");
            }
            var unit = qs("[data-ph-cart-unit]", row);
            if (unit && (item.selling_price || item.selling_price === 0)) {
              unit.textContent = money(item.selling_price);
            }
            var total = qs("[data-ph-cart-total]", row);
            if (total && item.total_price != null) {
              total.textContent = money(item.total_price);
            }
          });
        })
        .catch(function () {
          cartFeedback("Unable to update your cart. Please try again.", true);
        });

      root.addEventListener("click", function (event) {
        var raised;
        var row = event.target.closest("[data-ph-cart-row]");
        if (!row) return;
        var qty = qs("[data-zs-quantity]", row);
        if (event.target.closest("[data-ph-qty-minus]") && qty) {
          qty.value = Math.max(1, parseInt(qty.value || "1", 10) - 1);
          updateRow(row);
        }
        if (event.target.closest("[data-ph-qty-plus]") && qty) {
          raised = capLineQty(qty, parseInt(qty.value || "1", 10) + 1);
          if (raised === null) return;
          qty.value = String(raised);
          updateRow(row);
        }
        if (event.target.closest("[data-ph-remove]")) removeRow(row);
      });
      root.addEventListener("change", function (event) {
        var row;
        if (event.target && event.target.hasAttribute("data-zs-quantity")) {
          row = event.target.closest("[data-ph-cart-row]");
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
      var reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function textOf(source, name) {
        var node = source.querySelector("[data-" + name + "]");
        return node ? node.textContent : "";
      }
      function show(next) {
        var on;
        index = (next + slides.length) % slides.length;
        for (var i = 0; i < slides.length; i++) {
          on = i === index;
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
            primary.setAttribute(
              "href",
              source.getAttribute("data-href") || "#collections",
            );
          }
        }
      }
      function play() {
        if (timer) clearInterval(timer);
        timer = 0;
        if (reduce) return;
        timer = setInterval(function () {
          show(index + 1);
        }, delay);
      }
      var prev = root.querySelector("[data-ph-hero-prev]");
      var nextBtn = root.querySelector("[data-ph-hero-next]");
      if (prev)
        prev.addEventListener("click", function () {
          show(index - 1);
          play();
        });
      if (nextBtn)
        nextBtn.addEventListener("click", function () {
          show(index + 1);
          play();
        });
      for (var d = 0; d < dots.length; d++) {
        dots[d].addEventListener("click", function () {
          show(parseInt(this.getAttribute("data-ph-hero-dot"), 10) || 0);
          play();
        });
      }
      root.addEventListener("mouseenter", function () {
        if (timer) clearInterval(timer);
        timer = 0;
      });
      root.addEventListener("mouseleave", play);
      root.addEventListener("focusin", function () {
        if (timer) clearInterval(timer);
        timer = 0;
      });
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
      if (window.isLoggedInUser === true || window.isLoggedInUser === "true")
        return true;
      if (window.isLoggedInUser === false || window.isLoggedInUser === "false")
        return false;
      var html = document.documentElement;
      if (html.classList.contains("ph-auth-in")) return true;
      if (
        html.classList.contains("ph-auth-out") ||
        html.classList.contains("ph-auth-pending")
      )
        return false;
      return true;
    }

    function markWishlist(el, on) {
      el.setAttribute("data-zs-wishlisted", on ? "true" : "false");
      el.classList.toggle("is-wishlisted", !!on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
      var label = el.querySelector(".ph-wish-label");
      if (label) label.textContent = on ? "Saved" : "Save to wishlist";
      var iconBtn = el.classList.contains("ph-wish-btn") ? el : null;
      if (iconBtn)
        iconBtn.setAttribute(
          "aria-label",
          on ? "Remove from wishlist" : "Save to wishlist",
        );
      if (window.zs_wishlist_variants)
        window.zs_wishlist_variants[wishlistVariantId(el)] = !!on;
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
      toast._phTimer = setTimeout(function () {
        toast.hidden = true;
      }, 3200);
    }

    function wishlistHeaders(extra) {
      var csrfMatch;
      var headers = extra ? Object.assign({}, extra) : {};
      if (window.zsUtils && zsUtils.getCSRFHeader) {
        Object.assign(headers, zsUtils.getCSRFHeader());
      } else {
        csrfMatch = document.cookie.match(/(?:^|;\s*)csrfc=([^;]+)/);
        if (csrfMatch)
          headers["X-ZCSRF-TOKEN"] =
            "csrfp=" + decodeURIComponent(csrfMatch[1]);
      }
      return headers;
    }

    function wishlistCountsFrom(data) {
      var c, map;
      if (!data || typeof data !== "object") return null;
      var candidates = [
        data.wishlists_count,
        data.payload && data.payload.wishlists_count,
        data.wishlists_count_map,
        data.payload && data.payload.wishlists,
        data.variants,
        data.payload && data.payload.variants,
      ];
      for (var i = 0; i < candidates.length; i++) {
        c = candidates[i];
        if (c && typeof c === "object") return c;
      }
      if (Array.isArray(data.wishlist_variant_ids)) {
        map = {};
        data.wishlist_variant_ids.forEach(function (id) {
          map[String(id)] = true;
        });
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
    function wishlistBadgeEl() {
      return qs("[data-ph-wish-count]");
    }
    function setWishlistBadge(count) {
      wishBadgeCount = Math.max(0, parseInt(count, 10) || 0);
      var badge = wishlistBadgeEl();
      if (!badge) return;
      badge.hidden = wishBadgeCount <= 0;
      badge.textContent = wishBadgeCount > 0 ? String(wishBadgeCount) : "";
    }
    function adjustWishlistBadge(delta) {
      var badge, parsed;
      var current = wishBadgeCount;
      if (current == null) {
        badge = wishlistBadgeEl();
        parsed = badge ? parseInt(badge.textContent, 10) : 0;
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
      for (var i = 0; i < ids.length; i += 200)
        chunks.push(ids.slice(i, i + 200));
      chunks.forEach(function (chunk) {
        var query = "?variant_ids=" + chunk.map(encodeURIComponent).join(",");
        var urls = [
          WISHLIST_STOREFRONT_API + "/wishlist-enabled" + query,
          WISHLIST_LEGACY_API + "/wishlist-enabled" + query,
        ];
        function readStatus(index) {
          if (index >= urls.length) return Promise.resolve(null);
          return window
            .fetch(urls[index], { credentials: "same-origin" })
            .then(function (res) {
              if (res.redirected && /\/signin/.test(res.url || "")) return null;
              if (!res.ok) {
                if (res.status === 404 || res.status === 405)
                  return readStatus(index + 1);
                return null;
              }
              var type = res.headers.get("content-type") || "";
              if (type.indexOf("json") === -1) return null;
              return res.json();
            })
            .catch(function () {
              return readStatus(index + 1);
            });
        }
        readStatus(0)
          .then(function (data) {
            applyWishlistCounts(wishlistCountsFrom(data));
          })
          .catch(function () {});
      });
    }

    function wishlistSigninRedirect() {
      window.location.href =
        "/signin?uri=" +
        encodeURIComponent(window.location.pathname + window.location.search);
    }

    function foldSearchText(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[\u064b-\u0652\u0670\u0640]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, " ")
        .trim();
    }

    function searchTextHits(haystack, query) {
      var needle = foldSearchText(query);
      var hay = foldSearchText(haystack);
      if (!needle || !hay) return false;
      if (hay.indexOf(needle) >= 0) return true;
      var tokens = needle.split(" ").filter(Boolean);
      if (tokens.length < 2) return false;
      return tokens.every(function (token) {
        return hay.indexOf(token) >= 0;
      });
    }

    var phCategoryCatalog = null;
    var phCategoryProductCache = {};

    function loadCategoryCatalog() {
      if (phCategoryCatalog) return phCategoryCatalog;
      phCategoryCatalog = fetch("/storefront/api/v1/categories", {
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var roots =
            (data && data.payload && data.payload.categories) || [];
          var flat = [];
          function walk(nodes, ancestors) {
            (nodes || []).forEach(function (node) {
              var item = {
                id: String(node.category_id || ""),
                name: node.name || "",
                handle: node.handle || "",
                ancestors: ancestors,
              };
              if (!item.id) return;
              flat.push(item);
              walk(node.sub_categories || [], ancestors.concat([item]));
            });
          }
          walk(roots, []);
          return flat;
        })
        .catch(function () {
          phCategoryCatalog = null;
          return [];
        });
      return phCategoryCatalog;
    }

    function categoryProducts(category) {
      if (phCategoryProductCache[category.id])
        return phCategoryProductCache[category.id];
      phCategoryProductCache[category.id] = fetch(
        "/storefront/api/v1/categories/" +
          encodeURIComponent(category.id) +
          "/products?per_page=50",
        { credentials: "same-origin" },
      )
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var categoryPayload =
            data && data.payload && data.payload.category;
          return ((categoryPayload && categoryPayload.products) || []).map(
            function (product) {
              product.ph_category_name = category.name;
              return product;
            },
          );
        })
        .catch(function () {
          return [];
        });
      return phCategoryProductCache[category.id];
    }

    function findMatchingProducts(query, limit) {
      return loadCategoryCatalog().then(function (flat) {
        var wanted = {};
        flat.forEach(function (category) {
          var chain = category.ancestors.concat([category]);
          var hit = chain.some(function (item) {
            return searchTextHits(item.name + " " + item.handle, query);
          });
          if (hit) wanted[category.id] = category;
        });
        var ids = Object.keys(wanted);
        var leaves = ids
          .filter(function (id) {
            return !ids.some(function (other) {
              if (other === id) return false;
              return wanted[other].ancestors.some(function (item) {
                return item.id === id;
              });
            });
          })
          .map(function (id) {
            return wanted[id];
          });
        if (!leaves.length) return [];
        var max = limit || 6;
        var index = 0;
        var seen = {};
        var products = [];
        function take(group) {
          (group || []).forEach(function (product) {
            var id = String(product.product_id || product.url || "");
            if (!id || seen[id]) return;
            var details = [
              product.name,
              product.handle,
              product.url,
              product.ph_category_name,
              (product.tags || []).join(" "),
              (product.variants || [])
                .map(function (variant) {
                  return variant.sku || "";
                })
                .join(" "),
            ].join(" ");
            var ownCategory = leaves.filter(function (category) {
              return category.name === product.ph_category_name;
            })[0];
            var ancestorHit =
              ownCategory &&
              ownCategory.ancestors.some(function (item) {
                return searchTextHits(item.name + " " + item.handle, query);
              });
            if (
              !searchTextHits(details, query) &&
              !searchTextHits(product.ph_category_name || "", query) &&
              !ancestorHit
            )
              return;
            seen[id] = true;
            products.push(product);
          });
        }
        function nextBatch() {
          if (products.length >= max || index >= leaves.length)
            return Promise.resolve(products.slice(0, max));
          var batch = leaves.slice(index, index + 6);
          index += batch.length;
          return Promise.all(
            batch.map(function (category) {
              return categoryProducts(category);
            }),
          ).then(function (groups) {
            groups.forEach(take);
            return nextBatch();
          });
        }
        return nextBatch();
      });
    }

    function suggestPrice(product, symbol) {
      if (product.has_variant_price)
        return (
          symbol +
          product.starts_with +
          " – " +
          symbol +
          product.ends_with
        );
      return symbol + product.selling_price;
    }

    function suggestPhoto(product) {
      var images = product.images || [];
      for (var i = 0; i < images.length; i++) {
        if (images[i] && images[i].url && !images[i].is_placeholder_image)
          return images[i].url + "/400x400";
      }
      return "";
    }

    function bindSearchSuggest() {
      var inputs = qsa(
        '.ph-search input[name="q"], .ph-nav-search input[name="q"]',
      );
      if (!inputs.length) return;
      function closeAll() {
        qsa("[data-ph-suggest]").forEach(function (box) {
          box.hidden = true;
        });
        inputs.forEach(function (input) {
          if (input._phCancelSuggest) input._phCancelSuggest();
          input.setAttribute("aria-expanded", "false");
        });
      }
      inputs.forEach(function (input) {
        var form = input.closest("form");
        var box = form && form.querySelector("[data-ph-suggest]");
        if (!box) return;
        var timer = null;
        var seq = 0;
        input._phCancelSuggest = function () {
          seq++;
          clearTimeout(timer);
        };
        input.addEventListener("input", function () {
          clearTimeout(timer);
          var mine = ++seq;
          var query = (input.value || "").trim();
          if (query.length < 3) {
            box.hidden = true;
            input.setAttribute("aria-expanded", "false");
            return;
          }
          timer = setTimeout(function () {
            box.hidden = false;
            box.classList.add("is-loading");
            box.innerHTML = '<p class="ph-suggest-status">Searching…</p>';
            input.setAttribute("aria-expanded", "true");
            findMatchingProducts(query, 6)
              .then(function (products) {
                if (mine !== seq) return;
                box.classList.remove("is-loading");
                if (!products || !products.length) {
                  box.innerHTML =
                    '<p class="ph-suggest-status">No products found. Try another search.</p>';
                  box.hidden = false;
                  return;
                }
                var symbol =
                  (window.zs_currency &&
                    (zs_currency.symbol || zs_currency.currency_symbol)) ||
                  "AED";
                var html = '<div class="ph-product-grid">';
                products.forEach(function (product) {
                  var photo = suggestPhoto(product);
                  html +=
                    '<article class="ph-product-card">' +
                    '<a href="' +
                    esc(product.url || "#") +
                    '">' +
                    '<div class="ph-product-photo">' +
                    (photo
                      ? '<img src="' +
                        esc(photo) +
                        '" alt="' +
                        esc(product.name || "") +
                        '" loading="lazy">'
                      : "") +
                    "</div>" +
                    '<div class="ph-card-body"><h3 class="ph-h3">' +
                    esc(product.name || "") +
                    '</h3><p class="ph-suggest-price">' +
                    esc(suggestPrice(product, symbol)) +
                    "</p></div>" +
                    "</a></article>";
                });
                html += "</div>";
                var action = form.getAttribute("action") || "/search-products";
                var sep = action.indexOf("?") === -1 ? "?" : "&";
                box.innerHTML =
                  html +
                  '<a class="ph-suggest-all" href="' +
                  esc(action + sep + "q=" + encodeURIComponent(query)) +
                  '">View all results</a>';
                box.hidden = false;
              })
              .catch(function () {
                if (mine !== seq) return;
                box.classList.remove("is-loading");
                box.innerHTML =
                  '<p class="ph-suggest-status">No products found. Try another search.</p>';
                box.hidden = false;
              });
          }, 300);
        });
        input.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            input._phCancelSuggest();
            box.hidden = true;
            input.setAttribute("aria-expanded", "false");
            input.blur();
          }
        });
        input.addEventListener("focus", function () {
          if (box.innerHTML && (input.value || "").trim().length >= 3) {
            box.hidden = false;
            input.setAttribute("aria-expanded", "true");
          }
        });
        box.addEventListener("click", function (event) {
          var link =
            event.target && event.target.closest
              ? event.target.closest("a[href]")
              : null;
          if (link) box.hidden = true;
        });
      });
      document.addEventListener("click", function (event) {
        var target = event.target;
        if (
          target &&
          target.closest &&
          target.closest("form.ph-search, form.ph-nav-search")
        )
          return;
        closeAll();
      });
      document.addEventListener(
        "submit",
        function (event) {
          var form = event.target;
          if (
            form &&
            form.querySelector &&
            form.querySelector("[data-ph-suggest]")
          )
            closeAll();
        },
        true,
      );
    }

    function renderSearchCard(product, symbol) {
      var photo = suggestPhoto(product);
      return (
        '<article class="ph-product-card" data-ph-product-card>' +
        '<a class="ph-product-link" href="' +
        esc(product.url || "#") +
        '">' +
        '<div class="ph-product-photo">' +
        (photo
          ? '<img src="' +
            esc(photo) +
            '" alt="' +
            esc(product.name || "") +
            '" loading="lazy">'
          : "") +
        "</div>" +
        '<div class="ph-card-body">' +
        (product.ph_category_name
          ? '<p class="ph-kicker">' + esc(product.ph_category_name) + "</p>"
          : "") +
        '<h3 class="ph-h3">' +
        esc(product.name || "") +
        "</h3>" +
        '<p class="ph-price">' +
        esc(suggestPrice(product, symbol)) +
        "</p>" +
        "</div></a></article>"
      );
    }

    function bindSearchResults() {
      var page = qs("[data-ph-search-page]");
      if (!page) return;
      var params = new URLSearchParams(location.search);
      var query = (params.get("q") || params.get("search") || "").trim();
      var grid = qs("[data-ph-search-grid]", page);
      var status = qs("[data-ph-search-status]", page);
      var more = qs("[data-ph-search-more]", page);
      function showStatus(message) {
        if (!status) return;
        status.hidden = false;
        status.textContent = message;
      }
      if (!query) {
        if (grid) grid.innerHTML = "";
        showStatus("No products found. Try another search.");
        if (more) more.hidden = false;
        return;
      }
      if (grid) {
        qsa("[data-ph-product-card]", grid).forEach(function (card) {
          if (!searchTextHits(card.textContent || "", query)) card.hidden = true;
        });
      }
      showStatus("Searching…");
      findMatchingProducts(query, 48)
        .then(function (products) {
          if (!grid) return;
          if (!products.length) {
            grid.innerHTML = "";
            showStatus("No products found. Try another search.");
            if (more) more.hidden = false;
            return;
          }
          if (status) status.hidden = true;
          if (more) more.hidden = true;
          var symbol =
            (window.zs_currency &&
              (zs_currency.symbol || zs_currency.currency_symbol)) ||
            "AED";
          grid.innerHTML = products
            .map(function (product) {
              return renderSearchCard(product, symbol);
            })
            .join("");
        })
        .catch(function () {
          showStatus("No products found. Try another search.");
          if (more) more.hidden = false;
        });
    }

    function bindWishlist() {
      var wishQueue, wishQueued;
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
      document.addEventListener(
        "click",
        function (event) {
          var target = event.target;
          var el =
            target && target.closest
              ? target.closest("[data-zs-wishlist-element]")
              : null;
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
            WISHLIST_LEGACY_API + "/variants",
          ];
          function sendMutation(index) {
            if (index >= mutationUrls.length)
              return Promise.reject(new Error("Wishlist endpoint unavailable"));
            var options = {
              credentials: "same-origin",
              headers: wishlistHeaders(),
            };
            if (wishlisted) {
              options.method = "DELETE";
              options.url =
                mutationUrls[index] +
                "?variant_ids=" +
                encodeURIComponent(variantId);
            } else {
              options.method = "POST";
              options.url = mutationUrls[index];
              options.headers["Content-Type"] =
                "application/x-www-form-urlencoded;charset=UTF-8";
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
              if (res.status === 404 || res.status === 405)
                return sendMutation(index + 1);
              if (!res.ok)
                throw new Error("wishlist request failed: " + res.status);
              var type = res.headers.get("content-type") || "";
              if (type.indexOf("json") === -1)
                throw new Error("Wishlist response was not JSON");
              return res.json();
            });
          }
          wishlistBusy[variantId] = true;
          qsa("[data-zs-wishlist-element]").forEach(function (peer) {
            if (wishlistVariantId(peer) === variantId) peer.disabled = true;
          });
          sendMutation(0)
            .then(function (data) {
              var serverMsg;
              if (data === null) return;
              var success =
                data &&
                (data.status_code === 0 ||
                  data.status_code === "0" ||
                  (data.status_code == null &&
                    (data.code === 0 ||
                      data.code === "0" ||
                      data.success === true ||
                      data.status === "success" ||
                      data.status_message === "success")));
              if (!success) {
                serverMsg = data &&
                  (data.status_message ||
                    data.message ||
                    data.developer_message);
                throw new Error(
                  "Wishlist request was rejected: " +
                    (serverMsg || "unknown response") +
                    " (status_code=" +
                    (data && data.status_code) +
                    ")",
                );
              }
              qsa("[data-zs-wishlist-element]").forEach(function (peer) {
                if (wishlistVariantId(peer) === variantId)
                  markWishlist(peer, !wishlisted);
              });
              adjustWishlistBadge(wishlisted ? -1 : 1);
              if (window.wishlist && window.wishlist.clearCache)
                window.wishlist.clearCache();
              syncWishlistState();
            })
            .catch(function (error) {
              console.warn("Wishlist request failed:", error);
              wishlistToast(
                "Could not update your wishlist. Please try again.",
              );
            })
            .finally(function () {
              wishlistBusy[variantId] = false;
              qsa("[data-zs-wishlist-element]").forEach(function (peer) {
                if (wishlistVariantId(peer) === variantId)
                  peer.disabled = false;
              });
            });
        },
        true,
      );
      if (window.MutationObserver && document.body) {
        wishQueue = [];
        wishQueued = false;
        new MutationObserver(function (records) {
          var added = false;
          records.forEach(function (record) {
            var node;
            for (var i = 0; i < record.addedNodes.length; i++) {
              node = record.addedNodes[i];
              if (node.nodeType !== 1) continue;
              if (node.matches && node.matches("[data-zs-wishlist-element]")) {
                added = true;
                break;
              }
              if (
                node.querySelector &&
                node.querySelector("[data-zs-wishlist-element]")
              ) {
                added = true;
                break;
              }
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
        new MutationObserver(updateSigninNote).observe(
          document.documentElement,
          { attributes: true, attributeFilter: ["class"] },
        );
      }
      function toggleEmpty() {
        if (!emptyNote) return;
        var hasItems = !!qs("[data-ph-wish-card]");
        emptyNote.hidden = hasItems;
        if (list) list.hidden = !hasItems;
      }
      if (!list) {
        toggleEmpty();
        return;
      }
      toggleEmpty();
      list.addEventListener("click", function (event) {
        var variantId, addVariantId;
        var target = event.target;
        var removeBtn =
          target && target.closest
            ? target.closest("[data-ph-wish-remove]")
            : null;
        var addBtn =
          target && target.closest
            ? target.closest("[data-ph-wish-add]")
            : null;
        if (removeBtn) {
          event.preventDefault();
          variantId = removeBtn.getAttribute("data-ph-wish-variant") || "";
          if (!variantId || removeBtn.disabled) return;
          removeBtn.disabled = true;
          fetch(
            WISHLIST_STOREFRONT_API +
              "/variants?variant_ids=" +
              encodeURIComponent(variantId),
            {
              method: "DELETE",
              credentials: "same-origin",
              headers: wishlistHeaders(),
            },
          )
            .then(function (res) {
              if (res.redirected && /\/signin/.test(res.url || "")) {
                wishlistSigninRedirect();
                return null;
              }
              if (res.status === 401 || res.status === 403) {
                wishlistSigninRedirect();
                return null;
              }
              if (!res.ok)
                throw new Error("wishlist remove failed: " + res.status);
              var type = res.headers.get("content-type") || "";
              return type.indexOf("json") === -1
                ? { status_code: "0" }
                : res.json();
            })
            .then(function (data) {
              if (data === null) return;
              var success =
                data &&
                (data.status_code === 0 ||
                  data.status_code === "0" ||
                  (data.status_code == null && data.status !== "failed"));
              if (!success) throw new Error("Wishlist remove was rejected");
              var card = removeBtn.closest("[data-ph-wish-card]");
              if (card) card.remove();
              adjustWishlistBadge(-1);
              if (window.wishlist && window.wishlist.clearCache)
                window.wishlist.clearCache();
              if (window.__phWishlistSync) window.__phWishlistSync();
              toggleEmpty();
            })
            .catch(function (error) {
              console.warn("Wishlist remove failed:", error);
              removeBtn.disabled = false;
              wishlistToast("Could not remove this item. Please try again.");
            });
          return;
        }
        if (addBtn) {
          event.preventDefault();
          addVariantId = addBtn.getAttribute("data-ph-wish-variant") || "";
          if (!addVariantId || addBtn.disabled) return;
          if (!wishlistSignedIn()) {
            wishlistSigninRedirect();
            return;
          }
          addBtn.disabled = true;
          fetch("/storefront/api/v1/cart", {
            method: "POST",
            headers: cartHeaders(),
            credentials: "same-origin",
            body: JSON.stringify({
              product_variant_id: addVariantId,
              quantity: "1",
            }),
          })
            .then(function (res) {
              return res.json();
            })
            .then(function (data) {
              var ok =
                data &&
                ((data.payload && data.payload.items) ||
                  (data.cart_details && data.cart_details.items) ||
                  data.status_code === "0" ||
                  data.status_message === "success");
              addBtn.disabled = false;
              if (ok) {
                updateCartBadge(data);
                renderCartDrawer(data);
                openCartDrawer();
              } else {
                wishlistToast("Could not add this item to your selection.");
              }
            })
            .catch(function () {
              addBtn.disabled = false;
              wishlistToast("Could not add this item to your selection.");
            });
        }
      });
    }

    function bindQVContent(root) {
      var openOptions, firstOption;
      var qv = qs("[data-ph-qv]", root);
      if (!qv) return;
      var priceEl = qs("[data-ph-qv-price]", qv);
      var addBtn = qs("[data-ph-qv-add]", qv);
      var productUrl = qv.getAttribute("data-zs-product-url") || "";
      function applyVariant(variantId, price, oos) {
        if (addBtn) {
          addBtn.setAttribute("data-ph-qv-variant", variantId || "");
          addBtn.disabled = !!oos || !variantId;
          addBtn.textContent = oos ? "Out of stock" : "Add to cart";
        }
        if (priceEl && price !== null && price !== "")
          priceEl.textContent = money(price);
        qsa("[data-zs-wishlist-element]", qv).forEach(function (el) {
          el.setAttribute("data-zs-wishlist-variant-id", variantId || "");
          markWishlist(el, false);
        });
        if (window.__phWishlistSync) window.__phWishlistSync();
      }
      var sizeSelect = qs("[data-ph-qv-size]", qv);
      if (sizeSelect) {
        function fromOption(option) {
          if (!option) return;
          applyVariant(
            option.value,
            option.getAttribute("data-ph-qv-price"),
            option.disabled || option.hasAttribute("data-ph-qv-oos"),
          );
        }
        openOptions = Array.prototype.filter.call(
          sizeSelect.options,
          function (option) {
            return !option.disabled;
          },
        );
        firstOption = openOptions[0] || sizeSelect.options[0];
        if (firstOption) {
          sizeSelect.value = firstOption.value;
          fromOption(firstOption);
        }
        sizeSelect.addEventListener("change", function () {
          fromOption(sizeSelect.options[sizeSelect.selectedIndex]);
        });
      }
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
            body: JSON.stringify({
              product_variant_id: variantId,
              quantity: "1",
            }),
          })
            .then(function (res) {
              return res.json();
            })
            .then(function (data) {
              var ok =
                data &&
                ((data.payload && data.payload.items) ||
                  (data.cart_details && data.cart_details.items) ||
                  data.status_code === "0" ||
                  data.status_message === "success");
              addBtn.disabled = false;
              if (ok) {
                updateCartBadge(data);
                renderCartDrawer(data);
                openCartDrawer();
              } else {
                wishlistToast("Could not add this specimen.");
              }
            })
            .catch(function () {
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
        if (
          event.target === overlay ||
          (event.target.closest && event.target.closest("[data-ph-qv-close]"))
        )
          closeQV();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !overlay.hidden) closeQV();
      });
      document.addEventListener(
        "click",
        function (event) {
          var btn =
            event.target && event.target.closest
              ? event.target.closest("[data-zs-quick-view]")
              : null;
          if (!btn) return;
          event.preventDefault();
          event.stopPropagation();
          var url = btn.getAttribute("data-zs-product-url") || "";
          if (!url) return;
          modal.innerHTML = '<p class="ph-qv-loading">Loading…</p>';
          overlay.hidden = false;
          document.body.style.overflow = "hidden";
          fetch(
            url + (url.indexOf("?") === -1 ? "?" : "&") + "quick_look=true",
            { credentials: "same-origin" },
          )
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
        },
        true,
      );
    }

    function bindSaveForLater() {
      function flagOff() {
        return window.zs_saveforlater_enabled === false;
      }
      function applyFlag() {
        if (!flagOff()) return;
        qsa("[data-zs-save-for-later]").forEach(function (el) {
          el.hidden = true;
        });
        var section = qs("[data-ph-sfl]");
        if (section) section.hidden = true;
      }
      applyFlag();
      window.setTimeout(applyFlag, 1500);
    }

    function bindShare() {
      document.addEventListener("click", function (event) {
        var link =
          event.target && event.target.closest
            ? event.target.closest("[data-ph-share-net]")
            : null;
        if (!link) return;
        var box = link.closest("[data-ph-share]");
        if (!box) return;
        event.preventDefault();
        var url = box.getAttribute("data-share-url") || window.location.href;
        var text = box.getAttribute("data-share-text") || document.title;
        var net = link.getAttribute("data-ph-share-net");
        var enc = encodeURIComponent;
        var shareUrl = "";
        if (net === "whatsapp")
          shareUrl = "https://wa.me/?text=" + enc(text + " " + url);
        else if (net === "facebook")
          shareUrl = "https://www.facebook.com/sharer/sharer.php?u=" + enc(url);
        else if (net === "x")
          shareUrl =
            "https://twitter.com/intent/tweet?text=" +
            enc(text) +
            "&url=" +
            enc(url);
        else if (net === "linkedin")
          shareUrl =
            "https://www.linkedin.com/sharing/share-offsite/?url=" + enc(url);
        else if (net === "copy") {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              wishlistToast("Link copied.");
            });
          } else {
            wishlistToast(url);
          }
          return;
        }
        if (shareUrl)
          window.open(shareUrl, "_blank", "noopener,width=620,height=540");
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
          name: c.currency_name || c.name || code,
        };
      }
      fetch("/store-user/api/v1/currency/meta", { credentials: "same-origin" })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          if (!data || String(data.status_code) !== "0") return;
          var payload = data.data || {};
          var list = payload.currencies || payload.currency_list || payload;
          if (!Array.isArray(list)) {
            list = Object.keys(list).map(function (k) {
              return list[k];
            });
          }
          var currencies = list.map(normalizeCurrency).filter(Boolean);
          var unique = [];
          var seen = {};
          currencies.forEach(function (c) {
            if (!seen[c.code]) {
              seen[c.code] = true;
              unique.push(c);
            }
          });
          if (unique.length < 2) return;
          var current =
            (window.zs_currency &&
              (zs_currency.code || zs_currency.currency_code)) ||
            "";
          select.innerHTML = unique
            .map(function (c) {
              var label =
                c.symbol +
                " " +
                c.code +
                (c.name && c.name !== c.code ? " — " + c.name : "");
              return (
                '<option value="' +
                esc(c.code) +
                '"' +
                (String(c.code) === String(current) ? " selected" : "") +
                ">" +
                esc(label) +
                "</option>"
              );
            })
            .join("");
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
              body: JSON.stringify({ currency_code: code }),
            })
              .then(function () {
                window.location.reload();
              })
              .catch(function () {
                select.disabled = false;
                wishlistToast("Could not change currency.");
              });
          });
        })
        .catch(function () {});
    }

    function escHtml(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c];
      });
    }

    function t(en, ar) {
      return document.documentElement.dir === "rtl" ? ar : en;
    }

    var JOB_ICON =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>';

    function jobMetaHtml(job, withArea) {
      var meta = [];
      if (withArea && job.area)
        meta.push('<span class="ph-job-tag">' + escHtml(job.area) + "</span>");
      if (job.location)
        meta.push(
          '<span class="ph-job-chip">' + escHtml(job.location) + "</span>",
        );
      if (job.type)
        meta.push('<span class="ph-job-chip">' + escHtml(job.type) + "</span>");
      if (job.experience)
        meta.push(
          '<span class="ph-job-chip">' + escHtml(job.experience) + "</span>",
        );
      return meta.length
        ? '<div class="ph-job-meta">' + meta.join("") + "</div>"
        : "";
    }

    function jobSearchText(job) {
      return [
        job.title,
        job.area,
        job.location,
        job.type,
        job.summary,
        job.experience,
        (job.responsibilities || []).join(" "),
        (job.requirements || []).join(" "),
        (job.benefits || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
    }

    var JOB_PAGE_PATH = "/job";

    function applyJob(job) {
      var match;
      var target = qs("#apply");
      if (!target) {
        window.location.href =
          "/join-us?apply=" + encodeURIComponent(job.id || "") + "#apply";
        return;
      }
      var position = qs("#ph-j-position");
      if (position) position.value = job.title || "";
      var area = qs("#ph-j-area");
      var wanted = job.area || "";
      if (area && wanted) {
        match = Array.from(area.options).filter(function (o) {
          return o.text === wanted;
        })[0];
        if (match) area.value = match.value || match.text;
      }
      target.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }

    function jobCardHtml(job) {
      var html =
        '<article class="ph-job-card" data-ph-job-card data-search="' +
        escHtml(jobSearchText(job)) +
        '">';
      html +=
        '<div class="ph-job-card-top"><span class="ph-job-icon" aria-hidden="true">' +
        JOB_ICON +
        "</span>" +
        '<div class="ph-job-card-head"><h3 class="ph-h3">' +
        escHtml(job.title) +
        "</h3>" +
        (job.area
          ? '<p class="ph-job-card-area">' + escHtml(job.area) + "</p>"
          : "") +
        "</div></div>";
      html += jobMetaHtml(job, false);
      if (job.summary)
        html +=
          '<p class="ph-copy ph-job-summary">' + escHtml(job.summary) + "</p>";
      html +=
        '<div class="ph-job-foot">' +
        '<button type="button" style="color: #1f3d2b;" class="ph-btn ph-btn-ghost" data-ph-job-view data-job-id="' +
        escHtml(job.id || "") +
        '">' +
        t("View details", "عرض التفاصيل") +
        "</button>" +
        '<button type="button" class="ph-btn" data-ph-job-apply data-job-id="' +
        escHtml(job.id || "") +
        '">' +
        t("Apply", "قدّم") +
        "</button>" +
        "</div></article>";
      return html;
    }

    function jobDetailHtml(job) {
      var html = '<article class="ph-job-detail-card">';
      html +=
        '<button type="button" class="ph-job-back" data-ph-job-back>← ' +
        t("Back to all positions", "العودة إلى كل الوظائف") +
        "</button>";
      html +=
        '<div class="ph-job-detail-head"><span class="ph-job-icon ph-job-icon-lg" aria-hidden="true">' +
        JOB_ICON +
        "</span>" +
        '<div><h3 class="ph-h2">' +
        escHtml(job.title) +
        "</h3>" +
        jobMetaHtml(job, true) +
        "</div></div>";
      if (job.summary)
        html +=
          '<p class="ph-lead ph-job-detail-summary">' +
          escHtml(job.summary) +
          "</p>";
      html += '<div class="ph-job-detail-grid">';
      if (job.responsibilities && job.responsibilities.length) {
        html +=
          '<div class="ph-job-block"><p class="ph-field-label">' +
          t("What you will do", "ماذا ستفعل") +
          "</p><ul>";
        job.responsibilities.forEach(function (r) {
          html += "<li>" + escHtml(r) + "</li>";
        });
        html += "</ul></div>";
      }
      if (job.requirements && job.requirements.length) {
        html +=
          '<div class="ph-job-block"><p class="ph-field-label">' +
          t("What we look for", "ما الذي نبحث عنه") +
          "</p><ul>";
        job.requirements.forEach(function (r) {
          html += "<li>" + escHtml(r) + "</li>";
        });
        html += "</ul></div>";
      }
      html += "</div>";
      if (job.benefits && job.benefits.length) {
        html +=
          '<div class="ph-job-block"><p class="ph-field-label">' +
          t("Benefits", "المزايا") +
          '</p><ul class="ph-job-benefits">';
        job.benefits.forEach(function (r) {
          html += "<li>" + escHtml(r) + "</li>";
        });
        html += "</ul></div>";
      }
      html +=
        '<div class="ph-job-detail-foot"><button type="button" class="ph-btn" data-ph-job-apply>' +
        t("Apply for this role", "قدّم على هذه الوظيفة") +
        "</button></div>";
      return html + "</article>";
    }

    function renderJobs(list, jobs, cbs) {
      list.innerHTML = jobs.map(jobCardHtml).join("");
      qsa("[data-ph-job-view]", list).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var job = jobs.filter(function (j) {
            return j.id === btn.getAttribute("data-job-id");
          })[0];
          if (job && cbs && cbs.view) cbs.view(job);
        });
      });
      qsa("[data-ph-job-apply]", list).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var job = jobs.filter(function (j) {
            return j.id === btn.getAttribute("data-job-id");
          })[0];
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
          if (isJobPage) {
            showDetail(job);
            return;
          }
          window.location.href =
            JOB_PAGE_PATH + "?job=" + encodeURIComponent(job.id || "");
        },
        apply: function (job) {
          applyJob(job);
        },
      };

      function jobById(id) {
        return (
          jobs.filter(function (j) {
            return j.id === id;
          })[0] || null
        );
      }

      function applyFilter() {
        var q = ((search && search.value) || "").trim().toLowerCase();
        var visible = 0;
        qsa("[data-ph-job-card]", list).forEach(function (card) {
          var show =
            !q || (card.getAttribute("data-search") || "").indexOf(q) >= 0;
          card.hidden = !show;
          if (show) visible++;
        });
        if (empty) empty.hidden = visible > 0 || !jobs.length;
        if (tools) tools.hidden = !jobs.length;
      }

      function showList(push) {
        var url;
        currentJobId = null;
        if (detail) {
          detail.hidden = true;
          detail.innerHTML = "";
        }
        list.hidden = false;
        if (tools) tools.hidden = false;
        if (empty)
          empty.hidden =
            jobs.length === 0
              ? false
              : search && search.value.trim() !== ""
                ? false
                : true;
        applyFilter();
        if (push !== false && window.history && window.history.pushState) {
          url = window.location.pathname;
          window.history.pushState({ phJob: null }, "", url);
        }
      }

      function showDetail(job, push) {
        var back;
        currentJobId = job.id || null;
        if (detail) {
          detail.innerHTML = jobDetailHtml(job);
          detail.hidden = false;
          qsa("[data-ph-job-apply]", detail).forEach(function (btn) {
            btn.addEventListener("click", function () {
              applyJob(job);
            });
          });
          back = qs("[data-ph-job-back]", detail);
          if (back)
            back.addEventListener("click", function () {
              showList();
            });
        }
        list.hidden = true;
        if (tools) tools.hidden = true;
        if (empty) empty.hidden = true;
        if (push !== false && window.history && window.history.pushState) {
          window.history.pushState(
            { phJob: job.id },
            "",
            window.location.pathname + "?job=" + encodeURIComponent(job.id),
          );
        }
        if (detail)
          detail.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
          });
      }

      function syncFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var id = params.get("job");
        if (!id) {
          if (currentJobId) showList(false);
          return;
        }
        var job = jobById(id);
        if (job) showDetail(job, false);
      }

      function start(jobsData) {
        var applyJobFound;
        jobs = (jobsData && jobsData.jobs) || [];
        if (!jobs.length) {
          if (empty) empty.hidden = false;
          return;
        }
        renderJobs(list, jobs, cbs);
        if (search) search.addEventListener("input", applyFilter);
        window.addEventListener("popstate", syncFromUrl);
        applyFilter();
        syncFromUrl();
        var applyId = new URLSearchParams(window.location.search).get("apply");
        if (applyId) {
          applyJobFound = jobById(applyId);
          if (applyJobFound) applyJob(applyJobFound);
        }
      }
      var urlEl = qs("[data-ph-jobs-url]");
      var url = urlEl && urlEl.getAttribute("data-ph-jobs-url");
      if (url) {
        window
          .fetch(url, { credentials: "same-origin" })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(start)
          .catch(function () {
            start(null);
          });
        return;
      }
      var dataEl = qs("[data-ph-jobs-data]");
      try {
        start(dataEl ? JSON.parse(dataEl.textContent) : null);
      } catch (err) {
        start(null);
      }
    }

    function bindCheckoutSummary() {
      var box = qs(".phx-checkout .theme-cart-details");
      if (!box || qs("[data-ph-summary-toggle]", box)) return;
      var list = qs(".theme-cart-details-summary-list", box);
      if (!list || !list.parentNode) return;
      var title = qs(".theme-cart-details-summary-title", box);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "phx-summary-toggle";
      btn.setAttribute("data-ph-summary-toggle", "");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = (title && title.textContent.trim()) || "Order summary";
      list.parentNode.insertBefore(btn, list);
      btn.addEventListener("click", function () {
        var open = box.classList.toggle("is-summary-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
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
      document.addEventListener("ph-catalog-updated", function (event) {
        var root = event.detail.root;
        upgradeStoreImages(root);
        if (window.phFormatPrices) window.phFormatPrices(root);
        if (window.__phWishlistSync) window.__phWishlistSync();
      });
      fillPagePhotos();
      fillFileSlots();
      fillMissingCatPhotos();
      bindProductBuy();
      bindCheckoutSummary();
      window.setTimeout(bindCheckoutSummary, 800);
      bindSearchSuggest();
      bindSearchResults();
      bindWishlist();
      bindWishlistPage();
      bindQuickView();
      bindSaveForLater();
      bindShare();
      bindCurrency();
      bindJobs();
      bindCart();
      bindCartDrawer();
      loadCartBadge();
    });
  })();

  (function () {
    if (!document.querySelector(".theme-portal-form-container")) return;
    var portalFont =
      "'Plus Jakarta Sans','Tajawal',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif";
    var pageCss =
      "html,body{background:#f7f4ec!important;color:#1b3022!important;font-family:" +
      portalFont +
      "!important}" +
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
    var frameCss =
      "html,body,.bg_one,.signin_container,.signin_box{background:#fff!important;color:#1b3022!important;font-family:" +
      portalFont +
      "!important}" +
      ".signin_head,.service_name,.titlename,.username,.hellouser,#headtitle,#trytitle{color:#1b3022!important}#headtitle{font-weight:700;font-size:22px;letter-spacing:.04em}" +
      ".textbox{border:1px solid #d7d0c4!important;border-radius:0!important;color:#1b3022!important;background:#fff!important;font-family:" +
      portalFont +
      "!important}" +
      ".btn.blue,#nextbtn,button.btn{background:#c39b3e!important;border:0!important;color:#1b3022!important;border-radius:0!important;font-weight:700!important;letter-spacing:.08em;text-transform:uppercase}" +
      "a,.bluetext{color:#1b3022!important}" +
      "a:hover,.bluetext:hover{color:#c39b3e!important}";
    function paint(frame) {
      var doc, rtl, fontLink, s;
      try {
        doc = frame.contentDocument;
        if (!doc || !doc.head || doc.getElementById("ph-portal-frame")) return;
        rtl = document.documentElement.getAttribute("dir") === "rtl" ||
          document.documentElement.classList.contains("ph-rtl");
        if (rtl && !doc.getElementById("ph-portal-frame-font")) {
          fontLink = doc.createElement("link");
          fontLink.id = "ph-portal-frame-font";
          fontLink.rel = "stylesheet";
          fontLink.href =
            "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap";
          doc.head.appendChild(fontLink);
        }
        s = doc.createElement("style");
        s.id = "ph-portal-frame";
        s.textContent = frameCss;
        doc.head.appendChild(s);
      } catch (err) {}
    }
    var frame = document.querySelector("iframe");
    if (!frame) return;
    paint(frame);
    frame.addEventListener("load", function () {
      paint(frame);
    });
  })();

  (function () {
    var products;
    var grid = document.querySelector("[data-ph-subcat-grid]");
    if (grid) {
      products = [].slice.call(
        document.querySelectorAll('a[href*="/products/"]'),
      );
      [].slice
        .call(grid.querySelectorAll("[data-ph-cat-id]"))
        .forEach(function (card) {
          var heading = card.querySelector("h3,.ph-h3");
          var name = ((heading ? heading.textContent : card.textContent) || "")
            .split("|")[0]
            .trim()
            .toLowerCase();
          if (!name) return;
          var match = products.filter(function (a) {
            return (
              a !== card &&
              (a.textContent || "").toLowerCase().indexOf(name) >= 0
            );
          })[0];
          if (!match) return;
          card.setAttribute("href", match.getAttribute("href"));
          var more = card.querySelector(".ph-more");
          if (more) more.textContent = "View specimen";
        });
      return;
    }
    if (location.pathname.indexOf("/categories/") < 0) return;
    var only = [].slice.call(
      document.querySelectorAll('.ph-product-grid a[href*="/products/"]'),
    );
    // Keep the category page available even when it contains one product.
  })();

  /* Language switch — dictionaries live in window.PH_I18N (built from lang/*.js). */
  (function () {
    var KEY = "ph_lang_v2";
    var RTL_LANGS = { ar: 1, he: 1, fa: 1, ur: 1 };

    function knownLangs() {
      var codes = ["en"];
      var i18n = window.PH_I18N || {};
      for (var k in i18n) {
        if (
          Object.prototype.hasOwnProperty.call(i18n, k) &&
          codes.indexOf(k) < 0
        )
          codes.push(k);
      }
      return codes;
    }
    var BILINGUAL = /^(.*[A-Za-z].*?)\s*\|\s*([\u0600-\u06FF][^|]*)$/;
    var SIZE = /^(\d+(?:\.\d+)?-\d+(?:\.\d+)?) MTR CT$/;

    function readLang() {
      var m;
      var v = "";
      try {
        v = localStorage.getItem(KEY) || "";
      } catch (e) {}
      if (!v) {
        m = document.cookie.match(/(?:^|; )ph_lang_v2=([^;]+)/);
        if (m) v = m[1];
      }
      v = String(v || "").toLowerCase();
      if (!/^[a-z]{2}(-[a-z]{2,4})?$/.test(v)) return "en";
      if (v !== "en" && knownLangs().indexOf(v) < 0) return "en";
      return v;
    }

    function writeLang(v) {
      try {
        localStorage.setItem(KEY, v);
      } catch (e) {}
      document.cookie =
        KEY + "=" + v + "; path=/; max-age=31536000; SameSite=Lax";
    }

    var lang = readLang();
    var DICT =
      lang !== "en" ? (window.PH_I18N && window.PH_I18N[lang]) || null : null;
    var DICT_CASE = {};
    Object.keys(DICT || {}).forEach(function (key) {
      DICT_CASE[key.toLowerCase()] = DICT[key];
    });
    var html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", RTL_LANGS[lang] ? "rtl" : "ltr");
    html.classList.toggle("ph-ar", lang === "ar");
    html.classList.toggle("ph-rtl", !!RTL_LANGS[lang]);

    function localizedFor(text) {
      var baseLabel, sizeValue, translatedMethod, translatedDuration, translatedPrice, translatedLead, inner;
      var key = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!key || !/[A-Za-z]/.test(key)) return null;
      var bilingual = key.match(BILINGUAL);
      if (lang === "en" && bilingual) return bilingual[1].trim();
      if (DICT && Object.prototype.hasOwnProperty.call(DICT, key))
        return DICT[key];
      if (Object.prototype.hasOwnProperty.call(DICT_CASE, key.toLowerCase()))
        return DICT_CASE[key.toLowerCase()];
      if (lang !== "ar") return null;
      // Zoho composes checkout labels at runtime; exact dictionary keys alone
      // cannot cover item counts, lead times, required labels or size values.
      var countedSubtotal = key.match(/^Subtotal\s*\(\s*(\d+)\s+Items?\s*\)$/i);
      if (countedSubtotal)
        return "المجموع الفرعي (عدد المنتجات: " + countedSubtotal[1] + ")";
      var shownProducts = key.match(/^(\d+) products shown$/);
      if (shownProducts) return "عدد المنتجات المعروضة: " + shownProducts[1];
      var countedItems = key.match(/^(\d+)\s+Items?$/i);
      if (countedItems) return "عدد المنتجات: " + countedItems[1];
      var decoratedLabel = key.match(/^(.*?)\s*([:*])$/);
      if (decoratedLabel) {
        baseLabel = localizedFor(decoratedLabel[1]);
        if (baseLabel !== null) return baseLabel + " " + decoratedLabel[2];
      }
      var sizeLabel = key.match(/^Size\s*:\s*(.+)$/i);
      if (sizeLabel) {
        sizeValue = localizedFor(sizeLabel[1]);
        return (
          "المقاس: " +
          (sizeValue === null ? "\u2066" + sizeLabel[1] + "\u2069" : sizeValue)
        );
      }
      var duration = key.match(
        /^\(?\s*(\d+)\s*[-–]\s*(\d+)\s+business days?\s*\)?$/i,
      );
      if (duration)
        return "من " + duration[1] + " إلى " + duration[2] + " أيام عمل";
      var oneDuration = key.match(/^\(?\s*(\d+)\s+business days?\s*\)?$/i);
      if (oneDuration) return oneDuration[1] + " أيام عمل";
      var shippingDuration = key.match(
        /^(Standard Shipping|Express Shipping|Shipping|Delivery)\s*\(([^)]+)\)$/i,
      );
      if (shippingDuration) {
        translatedMethod = localizedFor(shippingDuration[1]);
        translatedDuration = localizedFor(shippingDuration[2]);
        if (translatedMethod !== null && translatedDuration !== null)
          return translatedMethod + " (" + translatedDuration + ")";
      }
      var pricedDuration = key.match(
        /^(AED\s*[\d,]+(?:\.\d+)?)\s*(\([^)]+\))$/i,
      );
      if (pricedDuration) {
        translatedPrice = localizedFor(pricedDuration[1]);
        translatedLead = localizedFor(pricedDuration[2]);
        if (translatedPrice !== null && translatedLead !== null)
          return translatedPrice + " (" + translatedLead + ")";
      }
      var dirhamAmount = key.match(/^AED\s*([\d,]+(?:\.\d+)?)$/i);
      if (dirhamAmount) return "\u2066" + dirhamAmount[1] + " د.إ\u2069";
      var pair = key.match(BILINGUAL);
      if (pair) return pair[2].trim();
      var size = key.match(SIZE);
      if (size) return "\u2066" + size[1] + "\u2069 م (ارتفاع الجذع الصافي)";
      var slideOf = key.match(/^Slide (\d+) of (\d+)$/);
      if (slideOf) return "الشريحة " + slideOf[1] + " من " + slideOf[2];
      var slideN = key.match(/^Slide (\d+)$/);
      if (slideN) return "الشريحة " + slideN[1];
      var ofN = key.match(/^(\d+) of (\d+)$/);
      if (ofN) return "الشريحة " + ofN[1] + " من " + ofN[2];
      if (/^\d+ in nursery$/.test(key))
        return key.replace(" in nursery", " في المشتل");
      if (/^\d+ NOS$/.test(key)) return key.replace(" NOS", " قطعة");
      if (/ added to your selection\.$/.test(key))
        return key.replace(
          / added to your selection\.$/,
          " أُضيف إلى اختياراتك.",
        );
      var unavail = key.match(/^(.*?)\s+—\s+unavailable$/);
      if (unavail) {
        inner = localizedFor(unavail[1]);
        return (inner === null ? unavail[1] : inner) + " — غير متوفر";
      }
      var resultsFor = key.match(/^Results for\s+[“"](.+)[”"]$/);
      if (resultsFor) return "نتائج البحث عن “" + resultsFor[1] + "”";
      var soldAs = key.match(/^Exclusive of 5% VAT\s*·\s*Sold as\s+(.+)$/i);
      if (soldAs)
        return (
          "غير شامل ضريبة القيمة المضافة 5% · يُباع كـ \u2066" +
          soldAs[1] +
          "\u2069"
        );
      return null;
    }

    function swapText(node) {
      var raw = node.nodeValue;
      var tr = localizedFor(raw);
      if (tr === null) return;
      var translated = raw.match(/^\s*/)[0] + tr + raw.match(/\s*$/)[0];
      if (translated !== raw) node.nodeValue = translated;
    }

    var ATTRS = ["placeholder", "aria-label", "title", "alt"];
    function swapAttrs(el) {
      var v, tr, val;
      for (var i = 0; i < ATTRS.length; i++) {
        v = el.getAttribute(ATTRS[i]);
        if (!v) continue;
        tr = localizedFor(v);
        if (tr !== null && tr !== v) el.setAttribute(ATTRS[i], tr);
      }
      if (
        el.tagName === "INPUT" &&
        /^(submit|button)$/i.test(el.type || "") &&
        el.value
      ) {
        val = localizedFor(el.value);
        if (val !== null) el.value = val;
      }
    }

    var SKIP = {
      SCRIPT: 1,
      STYLE: 1,
      NOSCRIPT: 1,
      TEXTAREA: 1,
      CODE: 1,
      SVG: 1,
    };
    function skipped(el) {
      return (
        SKIP[el.tagName] ||
        SKIP[String(el.tagName).toUpperCase()] ||
        el.hasAttribute("data-ph-no-translate")
      );
    }

    function translate(scope) {
      if ((!DICT && lang !== "en") || !scope) return;
      if (scope.nodeType === 3) {
        if (
          scope.parentNode &&
          scope.parentNode.nodeType === 1 &&
          skipped(scope.parentNode)
        )
          return;
        swapText(scope);
        return;
      }
      if (scope.nodeType !== 1 || skipped(scope)) return;
      if (scope.closest && scope.closest("[data-ph-no-translate]")) return;
      swapAttrs(scope);
      var walker = document.createTreeWalker(
        scope,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function (n) {
            if (n.nodeType === 1 && skipped(n)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );
      var n;
      var texts = [];
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) texts.push(n);
        else swapAttrs(n);
      }
      texts.forEach(swapText);
    }

    function translateTitle() {
      if (!DICT) return;
      document.title = document.title
        .split("|")
        .map(function (part) {
          var tr = localizedFor(part);
          return tr === null ? part.trim() : tr;
        })
        .join(" | ");
    }

    function watchChanges() {
      if (
        (!DICT && lang !== "en") ||
        !window.MutationObserver ||
        !document.body
      )
        return;
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
          if (r.type === "characterData" || r.type === "attributes")
            queue.push(r.target);
          for (var i = 0; i < r.addedNodes.length; i++)
            queue.push(r.addedNodes[i]);
        });
        if (!queued && queue.length) {
          queued = true;
          (window.requestAnimationFrame || window.setTimeout)(flush);
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    }

    var LANG_NAMES = { en: "English", ar: "العربية" };
    function langLabel(code) {
      return LANG_NAMES[code] || code.toUpperCase();
    }
    function langShort(code) {
      return code === "ar" ? "عربي" : code.toUpperCase();
    }

    function closeLangDrops(except) {
      var b;
      var drops = document.querySelectorAll("[data-ph-lang-drop]");
      for (var i = 0; i < drops.length; i++) {
        if (drops[i] === except) continue;
        drops[i].setAttribute("hidden", "");
        b = drops[i].parentNode &&
          drops[i].parentNode.querySelector("[data-ph-lang-toggle]");
        if (b) b.setAttribute("aria-expanded", "false");
      }
    }

    function setupLangMenus() {
      var menu, drop, btn, cur, item;
      var menus = document.querySelectorAll(".ph-lang-menu");
      if (!menus.length) return;
      var codes = knownLangs().filter(function (c) {
        return c !== lang;
      });
      var i, j;
      for (i = 0; i < menus.length; i++) {
        menu = menus[i];
        drop = menu.querySelector("[data-ph-lang-drop]");
        btn = menu.querySelector("[data-ph-lang-toggle]");
        cur = menu.querySelector("[data-ph-lang-current]");
        if (cur) {
          cur.textContent = langShort(lang);
          cur.setAttribute("lang", lang === "ar" ? "ar" : "en");
        }
        if (!drop) continue;
        if (!codes.length) {
          menu.hidden = true;
          continue;
        }
        drop.innerHTML = "";
        for (j = 0; j < codes.length; j++) {
          item = document.createElement("button");
          item.type = "button";
          item.className = "ph-lang-item";
          item.setAttribute("data-ph-lang-set", codes[j]);
          item.setAttribute("lang", codes[j]);
          item.textContent = langLabel(codes[j]);
          drop.appendChild(item);
        }
        if (btn && !btn.__phBound) {
          btn.__phBound = true;
          btn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            var d =
              this.parentNode &&
              this.parentNode.querySelector("[data-ph-lang-drop]");
            if (!d) return;
            var willOpen = d.hasAttribute("hidden");
            closeLangDrops(d);
            if (willOpen) {
              d.removeAttribute("hidden");
              this.setAttribute("aria-expanded", "true");
            } else {
              this.setAttribute("aria-expanded", "false");
            }
          });
        }
      }
      if (!document.__phLangDocBound) {
        document.__phLangDocBound = true;
        document.addEventListener("click", function (event) {
          var t = event.target;
          var item = t && t.closest ? t.closest("[data-ph-lang-set]") : null;
          if (item) {
            event.preventDefault();
            writeLang(item.getAttribute("data-ph-lang-set"));
            location.reload();
            return;
          }
          if (
            !(
              t &&
              t.closest &&
              (t.closest("[data-ph-lang-drop]") ||
                t.closest("[data-ph-lang-toggle]"))
            )
          ) {
            closeLangDrops();
          }
        });
        document.addEventListener("keydown", function (event) {
          if (event.key === "Escape") closeLangDrops();
        });
      }
    }

    function markCurrentLinks() {
      var href;
      var path = window.phRoutePath
        ? window.phRoutePath()
        : location.pathname.replace(/\/+$/, "") || "/";
      var links = document.querySelectorAll(".ph-nav-list > li > a");
      for (var i = 0; i < links.length; i++) {
        href = window.phRoutePath
          ? window.phRoutePath(links[i].href)
          : (links[i].getAttribute("href") || "").replace(/\/+$/, "") || "/";
        if (href === path) links[i].setAttribute("aria-current", "page");
      }
    }

    function watchMessageBar() {
      if (!document.body) return;
      function bar() {
        var el;
        var list = document.querySelectorAll(".zpdark-section");
        for (var i = 0; i < list.length; i++) {
          el = list[i];
          if (
            /removeBanner/.test(el.innerHTML) &&
            el.offsetHeight > 0 &&
            getComputedStyle(el).position === "fixed"
          )
            return el;
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
        document.body.style.setProperty(
          "--ph-msgbar",
          el ? el.offsetHeight + "px" : "0px",
        );
      }
      update();
      if (window.MutationObserver)
        new MutationObserver(update).observe(document.body, {
          childList: true,
        });
    }

    var CARET =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    function setupDrawer() {
      var desktop, onChange;
      var nav = document.querySelector("[data-ph-nav]");
      var toggle = document.querySelector("[data-ph-menu-toggle]");
      if (!nav || !toggle) return;
      function sync() {
        var open = nav.classList.contains("is-open");
        var desktop =
          !window.matchMedia || window.matchMedia("(min-width: 981px)").matches;
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
        var firstLink;
        var open = nav.classList.toggle("is-open");
        sync();
        if (open) {
          firstLink = nav.querySelector(".ph-nav-list a[href]");
          if (firstLink) firstLink.focus();
        } else {
          toggle.focus();
        }
      });
      var closers = document.querySelectorAll("[data-ph-menu-close]");
      for (var i = 0; i < closers.length; i++) {
        closers[i].addEventListener("click", () => {
          close(true);
        });
      }
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && nav.classList.contains("is-open"))
          close(true);
      });
      nav.addEventListener("keydown", function (event) {
        if (event.key !== "Tab" || !nav.classList.contains("is-open")) return;
        var nodes = Array.from(
          nav.querySelectorAll("a[href],button,input,select"),
        ).filter(function (el) {
          return (
            !el.disabled &&
            el.getClientRects().length &&
            getComputedStyle(el).visibility !== "hidden"
          );
        });
        var first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      nav.addEventListener("click", function (event) {
        if (
          event.target.closest("a[href]") &&
          nav.classList.contains("is-open")
        ) {
          nav.classList.remove("is-open");
          sync();
        }
      });
      var drops = nav.querySelectorAll(
        ".ph-nav-list > li.ph-drop:not(.ph-drop-mega)",
      );
      for (var j = 0; j < drops.length; j++) {
        (function (li) {
          var link = li.querySelector(":scope > a");
          if (!link) return;
          var existing = li.querySelector(":scope > .ph-submenu-toggle");
          var btn = existing || document.createElement("button");
          btn.type = "button";
          if (!existing) btn.className = "ph-sub-toggle";
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-label", "Show sub-menu");
          btn.innerHTML = CARET;
          if (!existing) link.insertAdjacentElement("afterend", btn);
          btn.addEventListener("click", function () {
            var open = li.classList.toggle("is-expanded");
            btn.setAttribute("aria-expanded", open ? "true" : "false");
          });
        })(drops[j]);
      }
      if (window.matchMedia) {
        desktop = window.matchMedia("(min-width: 981px)");
        onChange = function (m) {
          if (m.matches) nav.classList.remove("is-open");
          sync();
        };
        if (desktop.addEventListener)
          desktop.addEventListener("change", onChange);
        else if (desktop.addListener) desktop.addListener(onChange);
      }
    }

    function bindHostedForms() {
      function message(en, ar) {
        return document.documentElement.dir === "rtl" ? ar : en;
      }
      document.addEventListener("submit", function (event) {
        var file;
        var form = event.target;
        if (!form || !form.matches || !form.matches("form[data-ph-mail-form]"))
          return;
        event.preventDefault();
        if (form.getAttribute("data-ph-sending") === "true") return;
        if (!form.reportValidity()) return;
        var error = form.querySelector(".ph-form-error");
        var done = form.querySelector(".ph-form-done");
        if (error) error.hidden = true;
        if (done) done.hidden = true;
        function fail(text) {
          if (error) {
            error.textContent = text;
            error.setAttribute("role", "alert");
            error.hidden = false;
          }
        }
        var endpoint = form.getAttribute("data-ph-endpoint");
        if (!endpoint || !window.fetch) {
          fail(
            message(
              "Sending is unavailable. Please email nursery@pheladelfia.com.",
              "تعذّر الإرسال. يرجى مراسلتنا على nursery@pheladelfia.com.",
            ),
          );
          return;
        }
        var data = new FormData();
        data.append(
          "form_type",
          form.getAttribute("data-ph-form-type") || "contact",
        );
        Array.prototype.forEach.call(
          form.querySelectorAll(
            "input[name]:not([type=file]), select[name], textarea[name]",
          ),
          function (field) {
            if (
              field.disabled ||
              ((field.type === "checkbox" || field.type === "radio") &&
                !field.checked)
            )
              return;
            var key = field.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");
            if (key === "subject") key = "enquiry_type";
            data.append(key, (field.value || "").trim());
          },
        );
        var attachment = form.querySelector("input[type=file][name]");
        if (attachment && attachment.files && attachment.files.length) {
          file = attachment.files[0];
          if (
            !/\.(pdf|doc|docx)$/i.test(file.name) ||
            file.size === 0 ||
            file.size > 10 * 1024 * 1024
          ) {
            fail(
              message(
                "Please attach a PDF, DOC or DOCX file up to 10MB.",
                "يرجى إرفاق ملف PDF أو DOC أو DOCX لا يتجاوز 10 ميجابايت.",
              ),
            );
            return;
          }
          data.append("attachment", file);
        }
        var button = form.querySelector("button[type=submit]");
        var originalText = button && button.textContent;
        form.setAttribute("data-ph-sending", "true");
        form.setAttribute("aria-busy", "true");
        if (button) {
          button.disabled = true;
          button.textContent = message("Sending…", "جارٍ الإرسال…");
        }
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller
          ? setTimeout(function () {
              controller.abort();
            }, 60000)
          : null;
        fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: data,
          signal: controller ? controller.signal : undefined,
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return null;
              })
              .then(function (body) {
                return { ok: res.ok, status: res.status, body: body };
              });
          })
          .then(function (result) {
            var failure;
            var body = result.body || {};
            if (
              result.ok &&
              body.success === true &&
              body.needs_otp === true &&
              body.otp_token
            ) {
              showOtpStep(form, data, body.otp_token, body.otp_email || "");
              return;
            }
            if (!result.ok || body.success !== true) {
              failure = new Error("Submission not confirmed");
              failure.status = result.status;
              failure.body = body;
              throw failure;
            }
            finishForm(form, button, originalText);
          })
          .catch(function (failure) {
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
            if (failure.status === 429)
              fail(
                message(
                  "Too many attempts. Please try again in 15 minutes.",
                  "محاولات كثيرة. يرجى المحاولة بعد 15 دقيقة.",
                ),
              );
            else if (failure.status === 413 || failure.status === 422)
              fail(
                failure.body && failure.body.message
                  ? failure.body.message
                  : message(
                      "Check your details and attach a valid PDF, DOC or DOCX up to 10MB.",
                      "راجع البيانات وأرفق ملف PDF أو DOC أو DOCX صالحًا لا يتجاوز 10 ميجابايت.",
                    ),
              );
            else
              fail(
                message(
                  "We could not confirm sending. Please try again or email nursery@pheladelfia.com.",
                  "لم نتمكن من تأكيد الإرسال. حاول مرة أخرى أو راسل nursery@pheladelfia.com.",
                ),
              );
          })
          .then(function () {
            if (timer) clearTimeout(timer);
            form.removeAttribute("data-ph-sending");
            form.removeAttribute("aria-busy");
            if (button && form.getAttribute("data-ph-otp-open") !== "true") {
              button.disabled = false;
            }
          });
      });

      function finishForm(form, button, originalText) {
        var otpBox = form.querySelector(".ph-otp-box");
        if (otpBox) otpBox.hidden = true;
        form.removeAttribute("data-ph-otp-open");
        form.reset();
        var done = form.querySelector(".ph-form-done");
        if (done) {
          done.setAttribute("role", "status");
          done.hidden = false;
        }
        if (button) {
          button.textContent = message("Sent", "تم الإرسال");
          button.hidden = true;
        }
      }

      function showOtpStep(form, data, token, email) {
        var otpBox = form.querySelector(".ph-otp-box");
        var submitBtn;
        if (!otpBox) {
          otpBox = document.createElement("div");
          otpBox.className = "ph-otp-box";
          otpBox.innerHTML =
            '<label class="ph-field-label" for="ph-otp-code">' +
            message("Verification code", "رمز التحقق") +
            "</label>" +
            '<div class="ph-otp-row">' +
            '<input id="ph-otp-code" class="ph-otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr">' +
            '<button type="button" class="ph-btn ph-btn-primary ph-otp-verify">' +
            message("Verify & send", "تحقق وأرسل") +
            "</button>" +
            "</div>" +
            '<p class="ph-otp-hint"></p>' +
            '<button type="button" class="ph-otp-resend">' +
            message("Resend code", "إعادة إرسال الرمز") +
            "</button>";
          submitBtn = form.querySelector("button[type=submit]");
          if (submitBtn) submitBtn.insertAdjacentElement("beforebegin", otpBox);
          else form.appendChild(otpBox);
        }
        var hint = otpBox.querySelector(".ph-otp-hint");
        if (hint)
          hint.textContent = message(
            "We sent a 6-digit code to " +
              email +
              ". It expires in 10 minutes.",
            "أرسلنا رمزًا مكوّنًا من 6 أرقام إلى " +
              email +
              " — تنتهي صلاحيته خلال 10 دقائق.",
          );
        var input = otpBox.querySelector(".ph-otp-input");
        if (input) {
          input.value = "";
          input.focus();
        }
        form.setAttribute("data-ph-otp-open", "true");
        form._phOtp = { data: data, token: token };
        otpBox.hidden = false;
        otpBox.scrollIntoView({ behavior: "smooth", block: "center" });

        var verifyBtn = otpBox.querySelector(".ph-otp-verify");
        var resendBtn = otpBox.querySelector(".ph-otp-resend");
        var error = form.querySelector(".ph-form-error");

        function postVerify(code, onDone) {
          if (!window.fetch) {
            if (error) {
              error.textContent = message(
                "Sending is unavailable.",
                "الإرسال غير متاح.",
              );
              error.hidden = false;
            }
            return;
          }
          verifyBtn.disabled = true;
          resendBtn.disabled = true;
          fetch(form.getAttribute("data-ph-endpoint"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              action: "verify",
              otp_token: form._phOtp.token,
              otp_code: code,
            }),
          })
            .then(function (res) {
              return res
                .json()
                .catch(function () {
                  return null;
                })
                .then(function (body) {
                  return { ok: res.ok, body: body };
                });
            })
            .then(function (result) {
              if (result.ok && result.body && result.body.success === true) {
                onDone(true);
              } else {
                onDone(false, result.body && result.body.message);
              }
            })
            .catch(function () {
              onDone(false);
            });
        }

        verifyBtn.onclick = function () {
          var code = (input.value || "").replace(/\D/g, "");
          if (code.length !== 6) {
            if (error) {
              error.textContent = message(
                "Enter the 6-digit code we emailed you.",
                "أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إليك.",
              );
              error.hidden = false;
            }
            return;
          }
          if (error) error.hidden = true;
          verifyBtn.textContent = message("Verifying…", "جارٍ التحقق…");
          postVerify(code, function (ok, serverMessage) {
            var button;
            verifyBtn.disabled = false;
            resendBtn.disabled = false;
            verifyBtn.textContent = message("Verify & send", "تحقق وأرسل");
            if (ok) {
              button = form.querySelector("button[type=submit]");
              finishForm(form, button, button && button.textContent);
            } else {
              if (error) {
                error.textContent =
                  serverMessage ||
                  message(
                    "Incorrect code. Please try again.",
                    "رمز غير صحيح. حاول مرة أخرى.",
                  );
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
          fetch(endpoint, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: form._phOtp.data,
          })
            .then(function (res) {
              return res.json().catch(function () {
                return null;
              });
            })
            .then(function (body) {
              resendBtn.disabled = false;
              resendBtn.textContent = message(
                "Resend code",
                "إعادة إرسال الرمز",
              );
              if (
                body &&
                body.success === true &&
                body.needs_otp === true &&
                body.otp_token
              ) {
                form._phOtp.token = body.otp_token;
                if (hint)
                  hint.textContent = message(
                    "We sent a new 6-digit code to " +
                      (body.otp_email || email) +
                      ". It expires in 10 minutes.",
                    "أرسلنا رمزًا جديدًا مكوّنًا من 6 أرقام إلى " +
                      (body.otp_email || email) +
                      " — تنتهي صلاحيته خلال 10 دقائق.",
                  );
                input.value = "";
                input.focus();
              } else if (error) {
                error.textContent =
                  (body && body.message) ||
                  message(
                    "Could not resend the code. Please try again.",
                    "تعذّرت إعادة إرسال الرمز. حاول مرة أخرى.",
                  );
                error.hidden = false;
              }
            })
            .catch(function () {
              resendBtn.disabled = false;
              resendBtn.textContent = message(
                "Resend code",
                "إعادة إرسال الرمز",
              );
              if (error) {
                error.textContent = message(
                  "Could not resend the code. Please try again.",
                  "تعذّرت إعادة إرسال الرمز. حاول مرة أخرى.",
                );
                error.hidden = false;
              }
            });
        };
      }
    }

    function fillYear() {
      var list = document.querySelectorAll("[data-ph-year]");
      for (var i = 0; i < list.length; i++)
        list[i].textContent = String(new Date().getFullYear());
    }

    function start() {
      setupLangMenus();
      bindHostedForms();
      setupDrawer();
      markCurrentLinks();
      fillYear();
      watchMessageBar();
      translate(document.body);
      translateTitle();
      watchChanges();
    }

    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", start);
    else start();
  })();
}
