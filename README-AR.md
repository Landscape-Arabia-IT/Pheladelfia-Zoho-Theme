# تعديل قالب Pheladelfia وبناء ZIP

المجلد ده نسخة مستقلة من مصدر القالب الحالي **V8.2.0**. أي تعديل هنا لا يغيّر ملفات المشروع الأصلية.

## فين أعدل؟

كل ملفات القالب موجودة داخل `template/`:

- ملفات `.face`: هيكل ومحتوى صفحات Zoho.
- `stylesheets/style.css`: التنسيق والألوان والتجاوب مع الموبايل.
- `js/pheladelfia.js`: التفاعلات والترجمة (يشمل مزامنة أزرار المفضلة `data-zs-wishlist-element`).
- `images/`: صور وأصول القالب.

ملاحظة: `form-endpoint/config.php` يحتوي بيانات اعتماد وهو مستثنى من Git — استخدم `form-endpoint/config.sample.php` كقالب.

حافظ على المحتوى العربي والإنجليزي معًا عند تعديل النصوص، واتبع أسلوب الترجمة الموجود في JavaScript والقوالب.

## قبل إصدار نسخة برقم جديد

عدّل بيانات الإصدار في `template/template.conf` (الحالي: `8.2.0`):

- `name`
- `version`
- `design_id` — استخدم معرّفًا جديدًا وفريدًا إذا كنت تنشئ تصميمًا جديدًا في Zoho.

وحدّث قيمة `ph-theme-build` داخل `template/_theme.face` لتطابق الإصدار الجديد. سكربت البناء يقرأ `version` من `template.conf` ويستخدمه في اسم ZIP، لكنه لا يغيّر بيانات الإصدار تلقائيًا.

## بناء ZIP على سطح المكتب

بعد حفظ التعديلات، افتح Terminal ونفّذ:

```sh
cd ~/Desktop/Pheladelfia-Zoho-Theme
sh ./build-zip.sh
```

سيظهر الملف `Pheladelfia-Nursery-V<version>-Upload.zip` في نفس المجلد. يحتوي الأرشيف على مجلد `template/` في المستوى الأعلى، ويتحقق السكربت من سلامة ZIP بعد بنائه.

المتطلبات: macOS وأوامر `zip` و`unzip` وNode.js.

## قبل رفع القالب

يمكن التأكد من وجود النسخة الناتجة بهذا الأمر:

```sh
ls -1 Pheladelfia-Nursery-V*-Upload.zip
```

البناء لا يرفع القالب إلى Zoho ولا يفعّله. اختبر ZIP في معاينة Zoho قبل تفعيله.
