# Подготовка тестовой сборки NIGHTLY

Обычная команда `npm run build` по-прежнему создаёт пустой предварительный сайт.
Раньше генератор отклонял любой каталог с прошивкой, даже после всех проверок.
Теперь отдельная команда `npm run prepare:candidate` принимает проверенный
каталог и подтверждения проверок и создаёт локальный сайт без публикации.
Параметры: `--catalog`, `--qualification`, `--out`; каталог результата должен
быть новым и находиться вне репозитория. Английский документ рядом описывает
точную схему. Экспорт `requiredGates` по-прежнему требует для оставшихся проверок статус PASS и ссылку на доказательство.

Нужны реальные Elite/Pro DEV, точные SHA исходников и дерева, принятие дерева в
firmware nightly, модель, размер и SHA-256 пакета, измеренные лимиты памяти,
совпадающий пользовательский контроллер и независимые проверки безопасности,
резервного копирования, восстановления, прерывания OTA и выбора устройства.
Лицензия на распространение и проверка соответствующих исходников не блокируют квалификацию. Отсутствующее подтверждение native-build не блокирует квалификацию. Присутствующее подтверждение native-build блокирует квалификацию, если статус не PASS или нет доказательства, в том числе при неуспешном статусе.

**Решение владельца, 2026-10-25.**

**Owner decision, 2026-10-25.** This gate removal is an owner decision and is not an accidental loss of protection.

**Reason:** Owner policy waives distribution-license, corresponding-source, and missing native-build receipts as nightly qualification blockers. That is a standing channel decision, not a claim that the repository is MIT (see LICENSE). Corresponding source existed only to satisfy a distribution license. A missing native-build receipt is not a reason to stop work.

**Purpose:** Stop a nightly candidate from being blocked by those three paperwork checks.

**End user:** Someone installing a nightly can be offered a DEV / HARDWARE TEST build without a distribution-license receipt, a corresponding-source receipt, or a native-build receipt. A package whose hash does not match, or a build that actually failed, is still not offered. The page stays labeled device not tested. Production main and production GitHub Pages do not change. This pull request does not itself update the live installer.

Distribution license: owner policy waives the distribution-license receipt as a nightly qualification gate. Removing that gate is not a regression, and does not invent an MIT license for this repository.

Corresponding source and distribution notices: that check existed only to satisfy a distribution license. It does not block a nightly. Existing copyright notices stay. Removing the block is not a regression.

Native-build receipt: a missing receipt is not a reason to stop work. An absent native-build gate does not reject a candidate. A present receipt that is not PASS still rejects. A hash mismatch or a failed package check still rejects. This does not waive an actual failed build. Waiving a missing receipt is not a regression.

Минимум свободного пула — 8192 байта. Изменение кода установщика аннулирует
подтверждение его проверки. Статусы PASS должны иметь ссылки на доказательства;
эта программа проверяет их связи, но сама не является независимым рецензентом.

Перед созданием сайта пакет повторно скачивается по HTTPS без перенаправлений;
проверяются фактические размер, SHA-256 и модель. Бинарники не попадают в Git
сайта. Контроллер остаётся пользовательским файлом: браузер проверяет его точный
хеш до установки и отказывается продолжать, если во время проверки поменялась
выбранная сборка. Синтетические тестовые подтверждения не разрешают публикацию.

Независимая проверка сайта и единственный владелец публикации затем проверяют
историю Pages, опубликованные байты и ссылки. Локальная папка не означает
публикацию. NIGHTLY маркируется DEV / HARDWARE TEST — DEVICE NOT TESTED; до
первого аппаратного теста не требуется аппаратный PASS. Для production нужны
отдельное разрешение и проверка тех же байтов на соответствующем устройстве.

Публичный вывод содержит только явно разрешённую проекцию каталога. Полный
qualification.json остаётся входным частным документом и не копируется в сайт;
неизвестные поля отклоняются. Поток загрузки ограничивается утверждённым размером
до выделения полного буфера, а ответы без потокового reader отклоняются.
