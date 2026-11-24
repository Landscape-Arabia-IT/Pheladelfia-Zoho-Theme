# Pheladelfia Zoho Commerce Theme

Custom Zoho Commerce (V8.x) theme for **Pheladelfia Agricultural LLC** — specialist
nursery & specimen-tree supplier, Al Ajban, Abu Dhabi (est. 2004).
Bilingual EN/AR with RTL support.

## Layout

- `template/` — all theme files. `.face` files are Zoho Liquid templates;
  `stylesheets/style.css` holds storefront styling; `js/pheladelfia.js` holds
  storefront JS including the Arabic string dictionary.
- `form-endpoint/` — PHP contact/quote form backend (PHPMailer + OTP email
  verification). `config.php` holds credentials and is **gitignored** — copy
  `config.sample.php` to create it.
- `build-zip.sh` — packages `template/` into `Pheladelfia-Nursery-V<version>-Upload.zip`
  (version read from `template/template.conf`).

## Versioning

Bump `version` and `name` in `template/template.conf` and update
`ph-theme-build` in `template/_theme.face` for each release. Keep `design_id`
unchanged unless creating a new Zoho design.

## Build

```sh
sh ./build-zip.sh
```

Requires macOS with `zip`, `unzip` and Node.js. The script verifies the archive
after building. Upload the resulting ZIP via Zoho Commerce theme manager and
preview before activating.

## Conventions

- Every UI string needs an English source string plus an Arabic entry in the
  `AR` dictionary in `template/js/pheladelfia.js`; markup must work in RTL.
- Prices are AED, exclusive of 5% VAT.
- No invented claims, stats, testimonials or client logos — use TODO
  placeholders and list them in the PR.
- Site images live in the Zoho store (`/images`), not this repo.
- Validate JS with `node --check template/js/pheladelfia.js`.
