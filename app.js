import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

/* ================================================================
   I18N
   ================================================================ */
const I18N = {
  ru: {
    lang_name:'Русский',
    tab_maps:'Карты',tab_models:'Модели',tab_tex:'Текстуры',
    files:'Файлы',open_storage:'Открыть хранилище',
    vmf_open:'Карта',vmf_tex:'Текстуры',
    stats:'Статистика',brushes:'Брашей',polygons:'Полигонов',
    triangles:'Треугольников',entities:'Сущностей',materials:'Материалов',
    vtf_tex:'Текстур VTF',entity_icons:'Иконок сущностей',map_size:'Размер карты',
    display:'Отображение',show_triggers:'Показывать триггеры',
    show_entities:'Показывать сущности',show_entity_icons:'Иконки сущностей',
    icons_on_top:'Иконки сквозь стены',icon_size:'Размер иконок',
    icons_loaded:'Загружено иконок: {n}',
    glass_transparent:'Прозрачное стекло',
    textures:'Текстуры',screenshot:'Скриншот',hd_quality:'HD-качество (×2)',
    hide_panels:'Скрывать панели',export_glb:'Экспорт GLB',
    glb_entities:'Сущности',glb_triggers:'Триггеры',max_size:'Макс. размер',
    fallback_colors:'Запасные цвета',
    c_concrete:'бетон',c_metal:'металл',c_tile:'плитка',
    c_glass:'стекло',c_sign:'знаки',c_light:'свет',
    drop_vmf_title:'Перетащите .vmf или папку',
    drop_vmf_desc:'или нажмите, чтобы выбрать файл<br>Папку с <b>.vtf</b> текстурами и иконками <b>.png</b> можно дропнуть отдельно',
    drop_vmf_small:'Всё сохраняется локально в браузере (иконки — только в память)',
    waiting_file:'Ожидание файла…',
    mouse_hint:'ЛКМ — вращение · ПКМ — панорама · Колесо — зум',
    inspector:'Инспектор',load_models:'Загрузить модели',
    load_mats:'Загрузить материалы',model:'Модель',
    textures_vtf:'Текстуры VTF',apply_skin:'Применять скелет',
    show_phy:'Показывать .phy',auto_fit:'Авто-кадрирование',
    info:'Информация',load_models_first:'Загрузите модели,<br>затем материалы',
    mouse_hint_m:'ЛКМ — вращение · колесо — зум · ПКМ — панорама',
    loading:'Загрузка…',
    grid:'Сетка',wireframe:'Каркас',collisions:'Коллизии',
    light:'Свет',rotation:'Вращение',show_all:'Показать целиком',
    hide_panel:'Скрыть панель',show_panel:'Показать панель',
    drop_tex_title:'Перетащи папку или .vtf файлы',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 и др.',
    pick_folder:'Выбрать папку',pick_files:'Выбрать файлы',
    clear_list:'Очистить список',vtf_label:'VTF',skipped_label:'Пропущено',
    pick_vtf:'Выбери .vtf файл в списке ниже',
    mipmap:'Мипмап:',frame:'Кадр:',download_png:'⬇ Скачать PNG',
    contents_emoji:'📂 Содержимое',search_all:'Поиск по всем папкам…',
    nothing_found:'Ничего не найдено',empty:'Пусто',
    storage_title:'Хранилище файлов',
    files_count:'Файлов:',total_size:'Объём:',quota:'Место:',
    del_vtf:'🗑 Удалить все .vtf',del_all:'🗑 Удалить всё',apply:'✓ Применить',
    confirm_del_vtf:'Удалить все .vtf из хранилища?',
    confirm_del_all:'Полностью очистить хранилище?',
    saved_files:'Сохранено файлов: {n}',parsing:'Парсинг файла…',
    found_brushes:'Найдено {n} брашей…',processing:'Обработка: {n} / {m}',
    building_meshes:'Сборка мешей…',done_brushes:'Готово · {n} брашей · {m} трис',
    reading:'Чтение файла…',read_fail:'Не удалось прочитать файл',
    error:'Ошибка: {msg}',tex_added:'Текстуры добавлены в хранилище',
    shot_saved:'Скриншот сохранён: {name}',prep_glb:'Подготовка GLB…',
    glb_saved:'GLB сохранён: {name} ({size} МБ)',
    ready:'Готово. Файлы сохраняются локально в браузере.',
    stat_file:'Файл',stat_mdl:'MDL',stat_bones:'Костей',
    stat_meshes:'Мешей',stat_verts:'Вершин',stat_tris:'Треуг.',
    stat_mats:'Материалов',stat_mode:'Режим',stat_layout:'Раскладка',
    stat_phy:'PHY',
    folders_files:'Папок: {n} · Файлов: {m}',
    found_of:'Найдено: {n} из {m}',
    mip_frame:'мип {mip} · кадр {frame}/{total}',
    approx_fmt:'Формат <b>{fmt}</b> — приблизительно.',
    mode_skin:'вкл ({n})',mode_bind:'bind pose',phy_error:'ошибка',
  },
  en: {
    lang_name:'English',
    tab_maps:'Maps',tab_models:'Models',tab_tex:'Textures',
    files:'Files',open_storage:'Open storage',
    vmf_open:'Map',vmf_tex:'Textures',
    stats:'Statistics',brushes:'Brushes',polygons:'Polygons',
    triangles:'Triangles',entities:'Entities',materials:'Materials',
    vtf_tex:'VTF textures',entity_icons:'Entity icons',map_size:'Map size',
    display:'Display',show_triggers:'Show triggers',
    show_entities:'Show entities',show_entity_icons:'Entity icons',
    icons_on_top:'Icons through walls',icon_size:'Icon size',
    icons_loaded:'Icons loaded: {n}',
    glass_transparent:'Transparent glass',
    textures:'Textures',screenshot:'Screenshot',hd_quality:'HD quality (×2)',
    hide_panels:'Hide panels',export_glb:'Export GLB',
    glb_entities:'Entities',glb_triggers:'Triggers',max_size:'Max size',
    fallback_colors:'Fallback colors',
    c_concrete:'concrete',c_metal:'metal',c_tile:'tile',
    c_glass:'glass',c_sign:'signs',c_light:'light',
    drop_vmf_title:'Drop .vmf or a folder',
    drop_vmf_desc:'or click to choose a file<br>You can also drop a folder with <b>.vtf</b> textures and <b>.png</b> icons',
    drop_vmf_small:'Everything is saved locally in your browser (icons — memory only)',
    waiting_file:'Waiting for file…',
    mouse_hint:'LMB — rotate · RMB — pan · Wheel — zoom',
    inspector:'Inspector',load_models:'Load models',
    load_mats:'Load materials',model:'Model',
    textures_vtf:'VTF textures',apply_skin:'Apply skeleton',
    show_phy:'Show .phy',auto_fit:'Auto-fit',
    info:'Information',load_models_first:'Load models,<br>then materials',
    mouse_hint_m:'LMB — rotate · wheel — zoom · RMB — pan',
    loading:'Loading…',
    grid:'Grid',wireframe:'Wireframe',collisions:'Collisions',
    light:'Light',rotation:'Rotation',show_all:'Fit all',
    hide_panel:'Hide panel',show_panel:'Show panel',
    drop_tex_title:'Drop a folder or .vtf files',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 and more',
    pick_folder:'Choose folder',pick_files:'Choose files',
    clear_list:'Clear list',vtf_label:'VTF',skipped_label:'Skipped',
    pick_vtf:'Pick a .vtf file in the list below',
    mipmap:'Mipmap:',frame:'Frame:',download_png:'⬇ Download PNG',
    contents_emoji:'📂 Contents',search_all:'Search across all folders…',
    nothing_found:'Nothing found',empty:'Empty',
    storage_title:'File storage',
    files_count:'Files:',total_size:'Size:',quota:'Quota:',
    del_vtf:'🗑 Delete all .vtf',del_all:'🗑 Delete everything',apply:'✓ Apply',
    confirm_del_vtf:'Delete all .vtf from storage?',
    confirm_del_all:'Completely clear storage?',
    saved_files:'Files saved: {n}',parsing:'Parsing file…',
    found_brushes:'Found {n} brushes…',processing:'Processing: {n} / {m}',
    building_meshes:'Building meshes…',done_brushes:'Done · {n} brushes · {m} tris',
    reading:'Reading file…',read_fail:'Failed to read file',
    error:'Error: {msg}',tex_added:'Textures added to storage',
    shot_saved:'Screenshot saved: {name}',prep_glb:'Preparing GLB…',
    glb_saved:'GLB saved: {name} ({size} MB)',
    ready:'Ready. Files are saved locally in your browser.',
    stat_file:'File',stat_mdl:'MDL',stat_bones:'Bones',
    stat_meshes:'Meshes',stat_verts:'Vertices',stat_tris:'Tris',
    stat_mats:'Materials',stat_mode:'Mode',stat_layout:'Layout',
    stat_phy:'PHY',
    folders_files:'Folders: {n} · Files: {m}',
    found_of:'Found: {n} of {m}',
    mip_frame:'mip {mip} · frame {frame}/{total}',
    approx_fmt:'Format <b>{fmt}</b> — approximate.',
    mode_skin:'on ({n})',mode_bind:'bind pose',phy_error:'error',
  },
  uk: {
    lang_name:'Українська',
    tab_maps:'Карти',tab_models:'Моделі',tab_tex:'Текстури',
    files:'Файли',open_storage:'Відкрити сховище',
    vmf_open:'Карта',vmf_tex:'Текстури',
    stats:'Статистика',brushes:'Брашів',polygons:'Полігонів',
    triangles:'Трикутників',entities:'Сутностей',materials:'Матеріалів',
    vtf_tex:'Текстур VTF',entity_icons:'Іконок сутностей',map_size:'Розмір карти',
    display:'Відображення',show_triggers:'Показувати тригери',
    show_entities:'Показувати сутності',show_entity_icons:'Іконки сутностей',
    icons_on_top:'Іконки крізь стіни',icon_size:'Розмір іконок',
    icons_loaded:'Завантажено іконок: {n}',
    glass_transparent:'Прозоре скло',
    textures:'Текстури',screenshot:'Скриншот',hd_quality:'HD-якість (×2)',
    hide_panels:'Ховати панелі',export_glb:'Експорт GLB',
    glb_entities:'Сутності',glb_triggers:'Тригери',max_size:'Макс. розмір',
    fallback_colors:'Запасні кольори',
    c_concrete:'бетон',c_metal:'метал',c_tile:'плитка',
    c_glass:'скло',c_sign:'знаки',c_light:'світло',
    drop_vmf_title:'Перетягніть .vmf або папку',
    drop_vmf_desc:'або натисніть, щоб вибрати файл<br>Папку з <b>.vtf</b> текстурами та іконками <b>.png</b> можна кинути окремо',
    drop_vmf_small:'Усе зберігається локально у браузері (іконки — лише в пам\'ять)',
    waiting_file:'Очікування файлу…',
    mouse_hint:'ЛКМ — обертання · ПКМ — панорама · Колесо — масштаб',
    inspector:'Інспектор',load_models:'Завантажити моделі',
    load_mats:'Завантажити матеріали',model:'Модель',
    textures_vtf:'Текстури VTF',apply_skin:'Застосовувати скелет',
    show_phy:'Показувати .phy',auto_fit:'Авто-кадрування',
    info:'Інформація',load_models_first:'Завантажте моделі,<br>потім матеріали',
    mouse_hint_m:'ЛКМ — обертання · колесо — масштаб · ПКМ — панорама',
    loading:'Завантаження…',
    grid:'Сітка',wireframe:'Каркас',collisions:'Колізії',
    light:'Світло',rotation:'Обертання',show_all:'Показати повністю',
    hide_panel:'Сховати панель',show_panel:'Показати панель',
    drop_tex_title:'Перетягни папку або .vtf файли',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 та ін.',
    pick_folder:'Вибрати папку',pick_files:'Вибрати файли',
    clear_list:'Очистити список',vtf_label:'VTF',skipped_label:'Пропущено',
    pick_vtf:'Вибери .vtf файл у списку нижче',
    mipmap:'Міпмап:',frame:'Кадр:',download_png:'⬇ Завантажити PNG',
    contents_emoji:'📂 Вміст',search_all:'Пошук по всіх папках…',
    nothing_found:'Нічого не знайдено',empty:'Порожньо',
    storage_title:'Сховище файлів',
    files_count:'Файлів:',total_size:'Обсяг:',quota:'Місце:',
    del_vtf:'🗑 Видалити всі .vtf',del_all:'🗑 Видалити все',apply:'✓ Застосувати',
    confirm_del_vtf:'Видалити всі .vtf зі сховища?',
    confirm_del_all:'Повністю очистити сховище?',
    saved_files:'Збережено файлів: {n}',parsing:'Парсинг файлу…',
    found_brushes:'Знайдено {n} брашів…',processing:'Обробка: {n} / {m}',
    building_meshes:'Складання мешів…',done_brushes:'Готово · {n} брашів · {m} тріс',
    reading:'Читання файлу…',read_fail:'Не вдалося прочитати файл',
    error:'Помилка: {msg}',tex_added:'Текстури додано до сховища',
    shot_saved:'Скриншот збережено: {name}',prep_glb:'Підготовка GLB…',
    glb_saved:'GLB збережено: {name} ({size} МБ)',
    ready:'Готово. Файли зберігаються локально у браузері.',
    stat_file:'Файл',stat_mdl:'MDL',stat_bones:'Кісток',
    stat_meshes:'Мешів',stat_verts:'Вершин',stat_tris:'Тріс',
    stat_mats:'Матеріалів',stat_mode:'Режим',stat_layout:'Розкладка',
    stat_phy:'PHY',
    folders_files:'Папок: {n} · Файлів: {m}',
    found_of:'Знайдено: {n} з {m}',
    mip_frame:'міп {mip} · кадр {frame}/{total}',
    approx_fmt:'Формат <b>{fmt}</b> — приблизно.',
    mode_skin:'увімк ({n})',mode_bind:'bind pose',phy_error:'помилка',
  },
  de: {
    lang_name:'Deutsch',
    tab_maps:'Karten',tab_models:'Modelle',tab_tex:'Texturen',
    files:'Dateien',open_storage:'Speicher öffnen',
    vmf_open:'Karte',vmf_tex:'Texturen',
    stats:'Statistik',brushes:'Brushes',polygons:'Polygone',
    triangles:'Dreiecke',entities:'Entities',materials:'Materialien',
    vtf_tex:'VTF-Texturen',entity_icons:'Entity-Icons',map_size:'Kartengröße',
    display:'Anzeige',show_triggers:'Trigger anzeigen',
    show_entities:'Entities anzeigen',show_entity_icons:'Entity-Icons',
    icons_on_top:'Icons durch Wände',icon_size:'Icon-Größe',
    icons_loaded:'Icons geladen: {n}',
    glass_transparent:'Transparentes Glas',
    textures:'Texturen',screenshot:'Screenshot',hd_quality:'HD-Qualität (×2)',
    hide_panels:'Panels ausblenden',export_glb:'GLB exportieren',
    glb_entities:'Entities',glb_triggers:'Trigger',max_size:'Max. Größe',
    fallback_colors:'Ersatzfarben',
    c_concrete:'Beton',c_metal:'Metall',c_tile:'Fliese',
    c_glass:'Glas',c_sign:'Schilder',c_light:'Licht',
    drop_vmf_title:'.vmf oder Ordner hierher ziehen',
    drop_vmf_desc:'oder klicken, um eine Datei zu wählen<br>Ordner mit <b>.vtf</b>-Texturen und <b>.png</b>-Icons separat ablegen',
    drop_vmf_small:'Alles wird lokal im Browser gespeichert (Icons — nur im Speicher)',
    waiting_file:'Warte auf Datei…',
    mouse_hint:'LMB — drehen · RMB — verschieben · Rad — zoomen',
    inspector:'Inspektor',load_models:'Modelle laden',
    load_mats:'Materialien laden',model:'Modell',
    textures_vtf:'VTF-Texturen',apply_skin:'Skelett anwenden',
    show_phy:'.phy anzeigen',auto_fit:'Auto-Anpassung',
    info:'Information',load_models_first:'Modelle laden,<br>dann Materialien',
    mouse_hint_m:'LMB — drehen · Rad — zoomen · RMB — verschieben',
    loading:'Lädt…',
    grid:'Raster',wireframe:'Drahtgitter',collisions:'Kollisionen',
    light:'Licht',rotation:'Rotation',show_all:'Alles zeigen',
    hide_panel:'Panel ausblenden',show_panel:'Panel anzeigen',
    drop_tex_title:'Ordner oder .vtf-Dateien ziehen',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 u.a.',
    pick_folder:'Ordner wählen',pick_files:'Dateien wählen',
    clear_list:'Liste leeren',vtf_label:'VTF',skipped_label:'Übersprungen',
    pick_vtf:'Wähle eine .vtf-Datei aus der Liste unten',
    mipmap:'Mipmap:',frame:'Frame:',download_png:'⬇ PNG herunterladen',
    contents_emoji:'📂 Inhalt',search_all:'Alle Ordner durchsuchen…',
    nothing_found:'Nichts gefunden',empty:'Leer',
    storage_title:'Dateispeicher',
    files_count:'Dateien:',total_size:'Größe:',quota:'Kontingent:',
    del_vtf:'🗑 Alle .vtf löschen',del_all:'🗑 Alles löschen',apply:'✓ Anwenden',
    confirm_del_vtf:'Alle .vtf aus dem Speicher löschen?',
    confirm_del_all:'Speicher vollständig leeren?',
    saved_files:'Dateien gespeichert: {n}',parsing:'Datei wird geparst…',
    found_brushes:'{n} Brushes gefunden…',processing:'Verarbeitung: {n} / {m}',
    building_meshes:'Meshes werden aufgebaut…',done_brushes:'Fertig · {n} Brushes · {m} Tris',
    reading:'Datei wird gelesen…',read_fail:'Datei konnte nicht gelesen werden',
    error:'Fehler: {msg}',tex_added:'Texturen zum Speicher hinzugefügt',
    shot_saved:'Screenshot gespeichert: {name}',prep_glb:'GLB wird vorbereitet…',
    glb_saved:'GLB gespeichert: {name} ({size} MB)',
    ready:'Bereit. Dateien werden lokal im Browser gespeichert.',
    stat_file:'Datei',stat_mdl:'MDL',stat_bones:'Knochen',
    stat_meshes:'Meshes',stat_verts:'Vertices',stat_tris:'Tris',
    stat_mats:'Materialien',stat_mode:'Modus',stat_layout:'Layout',
    stat_phy:'PHY',
    folders_files:'Ordner: {n} · Dateien: {m}',
    found_of:'Gefunden: {n} von {m}',
    mip_frame:'Mip {mip} · Frame {frame}/{total}',
    approx_fmt:'Format <b>{fmt}</b> — ungefähr.',
    mode_skin:'an ({n})',mode_bind:'Bind-Pose',phy_error:'Fehler',
  },
  fr: {
    lang_name:'Français',
    tab_maps:'Cartes',tab_models:'Modèles',tab_tex:'Textures',
    files:'Fichiers',open_storage:'Ouvrir le stockage',
    vmf_open:'Carte',vmf_tex:'Textures',
    stats:'Statistiques',brushes:'Brushes',polygons:'Polygones',
    triangles:'Triangles',entities:'Entités',materials:'Matériaux',
    vtf_tex:'Textures VTF',entity_icons:'Icônes d\'entités',map_size:'Taille de la carte',
    display:'Affichage',show_triggers:'Afficher les triggers',
    show_entities:'Afficher les entités',show_entity_icons:'Icônes d\'entités',
    icons_on_top:'Icônes à travers les murs',icon_size:'Taille des icônes',
    icons_loaded:'Icônes chargées : {n}',
    glass_transparent:'Verre transparent',
    textures:'Textures',screenshot:'Capture',hd_quality:'Qualité HD (×2)',
    hide_panels:'Masquer les panneaux',export_glb:'Exporter GLB',
    glb_entities:'Entités',glb_triggers:'Triggers',max_size:'Taille max',
    fallback_colors:'Couleurs de secours',
    c_concrete:'béton',c_metal:'métal',c_tile:'carrelage',
    c_glass:'verre',c_sign:'panneaux',c_light:'lumière',
    drop_vmf_title:'Déposez un .vmf ou un dossier',
    drop_vmf_desc:'ou cliquez pour choisir un fichier<br>Un dossier avec textures <b>.vtf</b> et icônes <b>.png</b> peut être déposé séparément',
    drop_vmf_small:'Tout est enregistré localement dans le navigateur (icônes — mémoire seule)',
    waiting_file:'En attente du fichier…',
    mouse_hint:'Clic gauche — rotation · Clic droit — panoramique · Molette — zoom',
    inspector:'Inspecteur',load_models:'Charger les modèles',
    load_mats:'Charger les matériaux',model:'Modèle',
    textures_vtf:'Textures VTF',apply_skin:'Appliquer le squelette',
    show_phy:'Afficher .phy',auto_fit:'Ajustement auto',
    info:'Informations',load_models_first:'Chargez les modèles,<br>puis les matériaux',
    mouse_hint_m:'Clic gauche — rotation · molette — zoom · clic droit — panoramique',
    loading:'Chargement…',
    grid:'Grille',wireframe:'Filaire',collisions:'Collisions',
    light:'Lumière',rotation:'Rotation',show_all:'Tout afficher',
    hide_panel:'Masquer le panneau',show_panel:'Afficher le panneau',
    drop_tex_title:'Déposez un dossier ou des fichiers .vtf',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 etc.',
    pick_folder:'Choisir un dossier',pick_files:'Choisir des fichiers',
    clear_list:'Vider la liste',vtf_label:'VTF',skipped_label:'Ignorés',
    pick_vtf:'Choisissez un fichier .vtf dans la liste ci-dessous',
    mipmap:'Mipmap :',frame:'Image :',download_png:'⬇ Télécharger PNG',
    contents_emoji:'📂 Contenu',search_all:'Rechercher dans tous les dossiers…',
    nothing_found:'Rien trouvé',empty:'Vide',
    storage_title:'Stockage des fichiers',
    files_count:'Fichiers :',total_size:'Taille :',quota:'Quota :',
    del_vtf:'🗑 Supprimer tous les .vtf',del_all:'🗑 Tout supprimer',apply:'✓ Appliquer',
    confirm_del_vtf:'Supprimer tous les .vtf du stockage ?',
    confirm_del_all:'Vider entièrement le stockage ?',
    saved_files:'Fichiers enregistrés : {n}',parsing:'Analyse du fichier…',
    found_brushes:'{n} brushes trouvés…',processing:'Traitement : {n} / {m}',
    building_meshes:'Construction des meshes…',done_brushes:'Terminé · {n} brushes · {m} tris',
    reading:'Lecture du fichier…',read_fail:'Impossible de lire le fichier',
    error:'Erreur : {msg}',tex_added:'Textures ajoutées au stockage',
    shot_saved:'Capture enregistrée : {name}',prep_glb:'Préparation du GLB…',
    glb_saved:'GLB enregistré : {name} ({size} Mo)',
    ready:'Prêt. Les fichiers sont enregistrés localement dans le navigateur.',
    stat_file:'Fichier',stat_mdl:'MDL',stat_bones:'Os',
    stat_meshes:'Meshes',stat_verts:'Sommets',stat_tris:'Tris',
    stat_mats:'Matériaux',stat_mode:'Mode',stat_layout:'Disposition',
    stat_phy:'PHY',
    folders_files:'Dossiers : {n} · Fichiers : {m}',
    found_of:'Trouvés : {n} sur {m}',
    mip_frame:'mip {mip} · image {frame}/{total}',
    approx_fmt:'Format <b>{fmt}</b> — approximatif.',
    mode_skin:'activé ({n})',mode_bind:'bind pose',phy_error:'erreur',
  },
  es: {
    lang_name:'Español',
    tab_maps:'Mapas',tab_models:'Modelos',tab_tex:'Texturas',
    files:'Archivos',open_storage:'Abrir almacenamiento',
    vmf_open:'Mapa',vmf_tex:'Texturas',
    stats:'Estadísticas',brushes:'Brushes',polygons:'Polígonos',
    triangles:'Triángulos',entities:'Entidades',materials:'Materiales',
    vtf_tex:'Texturas VTF',entity_icons:'Iconos de entidades',map_size:'Tamaño del mapa',
    display:'Visualización',show_triggers:'Mostrar triggers',
    show_entities:'Mostrar entidades',show_entity_icons:'Iconos de entidades',
    icons_on_top:'Iconos a través de paredes',icon_size:'Tamaño de iconos',
    icons_loaded:'Iconos cargados: {n}',
    glass_transparent:'Vidrio transparente',
    textures:'Texturas',screenshot:'Captura',hd_quality:'Calidad HD (×2)',
    hide_panels:'Ocultar paneles',export_glb:'Exportar GLB',
    glb_entities:'Entidades',glb_triggers:'Triggers',max_size:'Tamaño máx',
    fallback_colors:'Colores de reserva',
    c_concrete:'hormigón',c_metal:'metal',c_tile:'azulejo',
    c_glass:'vidrio',c_sign:'carteles',c_light:'luz',
    drop_vmf_title:'Suelta un .vmf o una carpeta',
    drop_vmf_desc:'o haz clic para elegir un archivo<br>Puedes soltar una carpeta con texturas <b>.vtf</b> e iconos <b>.png</b> por separado',
    drop_vmf_small:'Todo se guarda localmente en el navegador (iconos — solo en memoria)',
    waiting_file:'Esperando archivo…',
    mouse_hint:'Clic izq — rotar · Clic der — panorámica · Rueda — zoom',
    inspector:'Inspector',load_models:'Cargar modelos',
    load_mats:'Cargar materiales',model:'Modelo',
    textures_vtf:'Texturas VTF',apply_skin:'Aplicar esqueleto',
    show_phy:'Mostrar .phy',auto_fit:'Ajuste automático',
    info:'Información',load_models_first:'Carga modelos,<br>luego materiales',
    mouse_hint_m:'Clic izq — rotar · rueda — zoom · clic der — panorámica',
    loading:'Cargando…',
    grid:'Rejilla',wireframe:'Malla',collisions:'Colisiones',
    light:'Luz',rotation:'Rotación',show_all:'Ver todo',
    hide_panel:'Ocultar panel',show_panel:'Mostrar panel',
    drop_tex_title:'Suelta una carpeta o archivos .vtf',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 etc.',
    pick_folder:'Elegir carpeta',pick_files:'Elegir archivos',
    clear_list:'Limpiar lista',vtf_label:'VTF',skipped_label:'Omitidos',
    pick_vtf:'Elige un archivo .vtf de la lista de abajo',
    mipmap:'Mipmap:',frame:'Fotograma:',download_png:'⬇ Descargar PNG',
    contents_emoji:'📂 Contenido',search_all:'Buscar en todas las carpetas…',
    nothing_found:'Nada encontrado',empty:'Vacío',
    storage_title:'Almacenamiento de archivos',
    files_count:'Archivos:',total_size:'Tamaño:',quota:'Cuota:',
    del_vtf:'🗑 Eliminar todos los .vtf',del_all:'🗑 Eliminar todo',apply:'✓ Aplicar',
    confirm_del_vtf:'¿Eliminar todos los .vtf del almacenamiento?',
    confirm_del_all:'¿Vaciar completamente el almacenamiento?',
    saved_files:'Archivos guardados: {n}',parsing:'Analizando archivo…',
    found_brushes:'{n} brushes encontrados…',processing:'Procesando: {n} / {m}',
    building_meshes:'Construyendo mallas…',done_brushes:'Listo · {n} brushes · {m} tris',
    reading:'Leyendo archivo…',read_fail:'No se pudo leer el archivo',
    error:'Error: {msg}',tex_added:'Texturas añadidas al almacenamiento',
    shot_saved:'Captura guardada: {name}',prep_glb:'Preparando GLB…',
    glb_saved:'GLB guardado: {name} ({size} MB)',
    ready:'Listo. Los archivos se guardan localmente en el navegador.',
    stat_file:'Archivo',stat_mdl:'MDL',stat_bones:'Huesos',
    stat_meshes:'Mallas',stat_verts:'Vértices',stat_tris:'Tris',
    stat_mats:'Materiales',stat_mode:'Modo',stat_layout:'Disposición',
    stat_phy:'PHY',
    folders_files:'Carpetas: {n} · Archivos: {m}',
    found_of:'Encontrados: {n} de {m}',
    mip_frame:'mip {mip} · fotograma {frame}/{total}',
    approx_fmt:'Formato <b>{fmt}</b> — aproximado.',
    mode_skin:'act ({n})',mode_bind:'bind pose',phy_error:'error',
  },
  it: {
    lang_name:'Italiano',
    tab_maps:'Mappe',tab_models:'Modelli',tab_tex:'Texture',
    files:'File',open_storage:'Apri archivio',
    vmf_open:'Mappa',vmf_tex:'Texture',
    stats:'Statistiche',brushes:'Brush',polygons:'Poligoni',
    triangles:'Triangoli',entities:'Entità',materials:'Materiali',
    vtf_tex:'Texture VTF',entity_icons:'Icone entità',map_size:'Dimensione mappa',
    display:'Visualizzazione',show_triggers:'Mostra trigger',
    show_entities:'Mostra entità',show_entity_icons:'Icone entità',
    icons_on_top:'Icone attraverso i muri',icon_size:'Dimensione icone',
    icons_loaded:'Icone caricate: {n}',
    glass_transparent:'Vetro trasparente',
    textures:'Texture',screenshot:'Screenshot',hd_quality:'Qualità HD (×2)',
    hide_panels:'Nascondi pannelli',export_glb:'Esporta GLB',
    glb_entities:'Entità',glb_triggers:'Trigger',max_size:'Dim. max',
    fallback_colors:'Colori di riserva',
    c_concrete:'cemento',c_metal:'metallo',c_tile:'piastrella',
    c_glass:'vetro',c_sign:'cartelli',c_light:'luce',
    drop_vmf_title:'Trascina un .vmf o una cartella',
    drop_vmf_desc:'o clicca per scegliere un file<br>Una cartella con texture <b>.vtf</b> e icone <b>.png</b> può essere trascinata separatamente',
    drop_vmf_small:'Tutto viene salvato localmente nel browser (icone — solo in memoria)',
    waiting_file:'In attesa del file…',
    mouse_hint:'Tasto sx — ruota · Tasto dx — pan · Rotella — zoom',
    inspector:'Ispettore',load_models:'Carica modelli',
    load_mats:'Carica materiali',model:'Modello',
    textures_vtf:'Texture VTF',apply_skin:'Applica scheletro',
    show_phy:'Mostra .phy',auto_fit:'Auto-adatta',
    info:'Informazioni',load_models_first:'Carica i modelli,<br>poi i materiali',
    mouse_hint_m:'Tasto sx — ruota · rotella — zoom · tasto dx — pan',
    loading:'Caricamento…',
    grid:'Griglia',wireframe:'Wireframe',collisions:'Collisioni',
    light:'Luce',rotation:'Rotazione',show_all:'Mostra tutto',
    hide_panel:'Nascondi pannello',show_panel:'Mostra pannello',
    drop_tex_title:'Trascina una cartella o file .vtf',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 ecc.',
    pick_folder:'Scegli cartella',pick_files:'Scegli file',
    clear_list:'Svuota lista',vtf_label:'VTF',skipped_label:'Saltati',
    pick_vtf:'Scegli un file .vtf dalla lista qui sotto',
    mipmap:'Mipmap:',frame:'Frame:',download_png:'⬇ Scarica PNG',
    contents_emoji:'📂 Contenuto',search_all:'Cerca in tutte le cartelle…',
    nothing_found:'Nessun risultato',empty:'Vuoto',
    storage_title:'Archivio file',
    files_count:'File:',total_size:'Dimensione:',quota:'Quota:',
    del_vtf:'🗑 Elimina tutti i .vtf',del_all:'🗑 Elimina tutto',apply:'✓ Applica',
    confirm_del_vtf:'Eliminare tutti i .vtf dall\'archivio?',
    confirm_del_all:'Svuotare completamente l\'archivio?',
    saved_files:'File salvati: {n}',parsing:'Analisi del file…',
    found_brushes:'{n} brush trovati…',processing:'Elaborazione: {n} / {m}',
    building_meshes:'Costruzione mesh…',done_brushes:'Fatto · {n} brush · {m} tris',
    reading:'Lettura del file…',read_fail:'Impossibile leggere il file',
    error:'Errore: {msg}',tex_added:'Texture aggiunte all\'archivio',
    shot_saved:'Screenshot salvato: {name}',prep_glb:'Preparazione GLB…',
    glb_saved:'GLB salvato: {name} ({size} MB)',
    ready:'Pronto. I file vengono salvati localmente nel browser.',
    stat_file:'File',stat_mdl:'MDL',stat_bones:'Ossa',
    stat_meshes:'Mesh',stat_verts:'Vertici',stat_tris:'Tris',
    stat_mats:'Materiali',stat_mode:'Modalità',stat_layout:'Layout',
    stat_phy:'PHY',
    folders_files:'Cartelle: {n} · File: {m}',
    found_of:'Trovati: {n} di {m}',
    mip_frame:'mip {mip} · frame {frame}/{total}',
    approx_fmt:'Formato <b>{fmt}</b> — approssimativo.',
    mode_skin:'attivo ({n})',mode_bind:'bind pose',phy_error:'errore',
  },
  pt: {
    lang_name:'Português',
    tab_maps:'Mapas',tab_models:'Modelos',tab_tex:'Texturas',
    files:'Arquivos',open_storage:'Abrir armazenamento',
    vmf_open:'Mapa',vmf_tex:'Texturas',
    stats:'Estatísticas',brushes:'Brushes',polygons:'Polígonos',
    triangles:'Triângulos',entities:'Entidades',materials:'Materiais',
    vtf_tex:'Texturas VTF',entity_icons:'Ícones de entidades',map_size:'Tamanho do mapa',
    display:'Exibição',show_triggers:'Mostrar triggers',
    show_entities:'Mostrar entidades',show_entity_icons:'Ícones de entidades',
    icons_on_top:'Ícones através de paredes',icon_size:'Tamanho dos ícones',
    icons_loaded:'Ícones carregados: {n}',
    glass_transparent:'Vidro transparente',
    textures:'Texturas',screenshot:'Captura',hd_quality:'Qualidade HD (×2)',
    hide_panels:'Ocultar painéis',export_glb:'Exportar GLB',
    glb_entities:'Entidades',glb_triggers:'Triggers',max_size:'Tamanho máx',
    fallback_colors:'Cores alternativas',
    c_concrete:'concreto',c_metal:'metal',c_tile:'azulejo',
    c_glass:'vidro',c_sign:'placas',c_light:'luz',
    drop_vmf_title:'Solte um .vmf ou uma pasta',
    drop_vmf_desc:'ou clique para escolher um arquivo<br>Uma pasta com texturas <b>.vtf</b> e ícones <b>.png</b> pode ser solta separadamente',
    drop_vmf_small:'Tudo é salvo localmente no navegador (ícones — só em memória)',
    waiting_file:'Aguardando arquivo…',
    mouse_hint:'Botão esq — girar · Botão dir — panorâmica · Roda — zoom',
    inspector:'Inspetor',load_models:'Carregar modelos',
    load_mats:'Carregar materiais',model:'Modelo',
    textures_vtf:'Texturas VTF',apply_skin:'Aplicar esqueleto',
    show_phy:'Mostrar .phy',auto_fit:'Ajuste automático',
    info:'Informações',load_models_first:'Carregue os modelos,<br>depois os materiais',
    mouse_hint_m:'Botão esq — girar · roda — zoom · botão dir — panorâmica',
    loading:'Carregando…',
    grid:'Grade',wireframe:'Wireframe',collisions:'Colisões',
    light:'Luz',rotation:'Rotação',show_all:'Mostrar tudo',
    hide_panel:'Ocultar painel',show_panel:'Mostrar painel',
    drop_tex_title:'Solte uma pasta ou arquivos .vtf',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 etc.',
    pick_folder:'Escolher pasta',pick_files:'Escolher arquivos',
    clear_list:'Limpar lista',vtf_label:'VTF',skipped_label:'Ignorados',
    pick_vtf:'Escolha um arquivo .vtf na lista abaixo',
    mipmap:'Mipmap:',frame:'Quadro:',download_png:'⬇ Baixar PNG',
    contents_emoji:'📂 Conteúdo',search_all:'Pesquisar em todas as pastas…',
    nothing_found:'Nada encontrado',empty:'Vazio',
    storage_title:'Armazenamento de arquivos',
    files_count:'Arquivos:',total_size:'Tamanho:',quota:'Cota:',
    del_vtf:'🗑 Excluir todos os .vtf',del_all:'🗑 Excluir tudo',apply:'✓ Aplicar',
    confirm_del_vtf:'Excluir todos os .vtf do armazenamento?',
    confirm_del_all:'Limpar completamente o armazenamento?',
    saved_files:'Arquivos salvos: {n}',parsing:'Analisando arquivo…',
    found_brushes:'{n} brushes encontrados…',processing:'Processando: {n} / {m}',
    building_meshes:'Construindo malhas…',done_brushes:'Pronto · {n} brushes · {m} tris',
    reading:'Lendo arquivo…',read_fail:'Não foi possível ler o arquivo',
    error:'Erro: {msg}',tex_added:'Texturas adicionadas ao armazenamento',
    shot_saved:'Captura salva: {name}',prep_glb:'Preparando GLB…',
    glb_saved:'GLB salvo: {name} ({size} MB)',
    ready:'Pronto. Os arquivos são salvos localmente no navegador.',
    stat_file:'Arquivo',stat_mdl:'MDL',stat_bones:'Ossos',
    stat_meshes:'Malhas',stat_verts:'Vértices',stat_tris:'Tris',
    stat_mats:'Materiais',stat_mode:'Modo',stat_layout:'Layout',
    stat_phy:'PHY',
    folders_files:'Pastas: {n} · Arquivos: {m}',
    found_of:'Encontrados: {n} de {m}',
    mip_frame:'mip {mip} · quadro {frame}/{total}',
    approx_fmt:'Formato <b>{fmt}</b> — aproximado.',
    mode_skin:'ativado ({n})',mode_bind:'bind pose',phy_error:'erro',
  },
  pl: {
    lang_name:'Polski',
    tab_maps:'Mapy',tab_models:'Modele',tab_tex:'Tekstury',
    files:'Pliki',open_storage:'Otwórz magazyn',
    vmf_open:'Mapa',vmf_tex:'Tekstury',
    stats:'Statystyki',brushes:'Brushy',polygons:'Wielokąty',
    triangles:'Trójkąty',entities:'Encje',materials:'Materiały',
    vtf_tex:'Tekstury VTF',entity_icons:'Ikony encji',map_size:'Rozmiar mapy',
    display:'Wyświetlanie',show_triggers:'Pokaż triggery',
    show_entities:'Pokaż encje',show_entity_icons:'Ikony encji',
    icons_on_top:'Ikony przez ściany',icon_size:'Rozmiar ikon',
    icons_loaded:'Załadowano ikon: {n}',
    glass_transparent:'Przezroczyste szkło',
    textures:'Tekstury',screenshot:'Zrzut ekranu',hd_quality:'Jakość HD (×2)',
    hide_panels:'Ukryj panele',export_glb:'Eksportuj GLB',
    glb_entities:'Encje',glb_triggers:'Triggery',max_size:'Maks. rozmiar',
    fallback_colors:'Kolory zastępcze',
    c_concrete:'beton',c_metal:'metal',c_tile:'kafelki',
    c_glass:'szkło',c_sign:'znaki',c_light:'światło',
    drop_vmf_title:'Przeciągnij .vmf lub folder',
    drop_vmf_desc:'lub kliknij, aby wybrać plik<br>Folder z teksturami <b>.vtf</b> i ikonami <b>.png</b> można upuścić osobno',
    drop_vmf_small:'Wszystko jest zapisywane lokalnie w przeglądarce (ikony — tylko w pamięci)',
    waiting_file:'Oczekiwanie na plik…',
    mouse_hint:'LPM — obrót · PPM — panorama · Kółko — zoom',
    inspector:'Inspektor',load_models:'Wczytaj modele',
    load_mats:'Wczytaj materiały',model:'Model',
    textures_vtf:'Tekstury VTF',apply_skin:'Zastosuj szkielet',
    show_phy:'Pokaż .phy',auto_fit:'Auto-dopasowanie',
    info:'Informacje',load_models_first:'Wczytaj modele,<br>potem materiały',
    mouse_hint_m:'LPM — obrót · kółko — zoom · PPM — panorama',
    loading:'Ładowanie…',
    grid:'Siatka',wireframe:'Siatka krawędzi',collisions:'Kolizje',
    light:'Światło',rotation:'Obrót',show_all:'Pokaż całość',
    hide_panel:'Ukryj panel',show_panel:'Pokaż panel',
    drop_tex_title:'Przeciągnij folder lub pliki .vtf',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 itd.',
    pick_folder:'Wybierz folder',pick_files:'Wybierz pliki',
    clear_list:'Wyczyść listę',vtf_label:'VTF',skipped_label:'Pominięte',
    pick_vtf:'Wybierz plik .vtf z listy poniżej',
    mipmap:'Mipmapa:',frame:'Klatka:',download_png:'⬇ Pobierz PNG',
    contents_emoji:'📂 Zawartość',search_all:'Szukaj we wszystkich folderach…',
    nothing_found:'Nic nie znaleziono',empty:'Pusto',
    storage_title:'Magazyn plików',
    files_count:'Plików:',total_size:'Rozmiar:',quota:'Limit:',
    del_vtf:'🗑 Usuń wszystkie .vtf',del_all:'🗑 Usuń wszystko',apply:'✓ Zastosuj',
    confirm_del_vtf:'Usunąć wszystkie .vtf z magazynu?',
    confirm_del_all:'Całkowicie wyczyścić magazyn?',
    saved_files:'Zapisano plików: {n}',parsing:'Parsowanie pliku…',
    found_brushes:'Znaleziono {n} brushy…',processing:'Przetwarzanie: {n} / {m}',
    building_meshes:'Budowanie meshy…',done_brushes:'Gotowe · {n} brushy · {m} tris',
    reading:'Czytanie pliku…',read_fail:'Nie udało się odczytać pliku',
    error:'Błąd: {msg}',tex_added:'Tekstury dodane do magazynu',
    shot_saved:'Zrzut zapisany: {name}',prep_glb:'Przygotowanie GLB…',
    glb_saved:'GLB zapisany: {name} ({size} MB)',
    ready:'Gotowe. Pliki są zapisywane lokalnie w przeglądarce.',
    stat_file:'Plik',stat_mdl:'MDL',stat_bones:'Kości',
    stat_meshes:'Meshe',stat_verts:'Wierzchołki',stat_tris:'Tris',
    stat_mats:'Materiały',stat_mode:'Tryb',stat_layout:'Układ',
    stat_phy:'PHY',
    folders_files:'Folderów: {n} · Plików: {m}',
    found_of:'Znaleziono: {n} z {m}',
    mip_frame:'mip {mip} · klatka {frame}/{total}',
    approx_fmt:'Format <b>{fmt}</b> — przybliżony.',
    mode_skin:'wł. ({n})',mode_bind:'bind pose',phy_error:'błąd',
  },
  tr: {
    lang_name:'Türkçe',
    tab_maps:'Haritalar',tab_models:'Modeller',tab_tex:'Dokular',
    files:'Dosyalar',open_storage:'Depoyu aç',
    vmf_open:'Harita',vmf_tex:'Dokular',
    stats:'İstatistikler',brushes:'Fırçalar',polygons:'Poligonlar',
    triangles:'Üçgenler',entities:'Varlıklar',materials:'Materyaller',
    vtf_tex:'VTF dokuları',entity_icons:'Varlık simgeleri',map_size:'Harita boyutu',
    display:'Görünüm',show_triggers:'Tetikleyicileri göster',
    show_entities:'Varlıkları göster',show_entity_icons:'Varlık simgeleri',
    icons_on_top:'Duvarlardan geçen simgeler',icon_size:'Simge boyutu',
    icons_loaded:'Yüklenen simgeler: {n}',
    glass_transparent:'Şeffaf cam',
    textures:'Dokular',screenshot:'Ekran görüntüsü',hd_quality:'HD kalite (×2)',
    hide_panels:'Panelleri gizle',export_glb:'GLB dışa aktar',
    glb_entities:'Varlıklar',glb_triggers:'Tetikleyiciler',max_size:'Maks. boyut',
    fallback_colors:'Yedek renkler',
    c_concrete:'beton',c_metal:'metal',c_tile:'karo',
    c_glass:'cam',c_sign:'tabela',c_light:'ışık',
    drop_vmf_title:'.vmf veya klasör bırakın',
    drop_vmf_desc:'ya da dosya seçmek için tıklayın<br><b>.vtf</b> dokuları ve <b>.png</b> simgeleri olan klasörü ayrıca bırakabilirsiniz',
    drop_vmf_small:'Her şey tarayıcıda yerel olarak saklanır (simgeler — yalnızca bellekte)',
    waiting_file:'Dosya bekleniyor…',
    mouse_hint:'Sol tık — döndür · Sağ tık — kaydır · Tekerlek — yakınlaştır',
    inspector:'Denetçi',load_models:'Modelleri yükle',
    load_mats:'Materyalleri yükle',model:'Model',
    textures_vtf:'VTF dokuları',apply_skin:'İskeleti uygula',
    show_phy:'.phy göster',auto_fit:'Oto-oturt',
    info:'Bilgi',load_models_first:'Modelleri yükleyin,<br>sonra materyalleri',
    mouse_hint_m:'Sol tık — döndür · tekerlek — yakınlaştır · sağ tık — kaydır',
    loading:'Yükleniyor…',
    grid:'Izgara',wireframe:'Tel kafes',collisions:'Çarpışmalar',
    light:'Işık',rotation:'Döndürme',show_all:'Tamamını göster',
    hide_panel:'Paneli gizle',show_panel:'Paneli göster',
    drop_tex_title:'Klasör veya .vtf dosyaları bırakın',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 vb.',
    pick_folder:'Klasör seç',pick_files:'Dosya seç',
    clear_list:'Listeyi temizle',vtf_label:'VTF',skipped_label:'Atlanan',
    pick_vtf:'Aşağıdaki listeden bir .vtf dosyası seçin',
    mipmap:'Mipmap:',frame:'Kare:',download_png:'⬇ PNG indir',
    contents_emoji:'📂 İçerik',search_all:'Tüm klasörlerde ara…',
    nothing_found:'Hiçbir şey bulunamadı',empty:'Boş',
    storage_title:'Dosya deposu',
    files_count:'Dosyalar:',total_size:'Boyut:',quota:'Kota:',
    del_vtf:'🗑 Tüm .vtf sil',del_all:'🗑 Tümünü sil',apply:'✓ Uygula',
    confirm_del_vtf:'Depodaki tüm .vtf dosyaları silinsin mi?',
    confirm_del_all:'Depo tamamen temizlensin mi?',
    saved_files:'Kaydedilen dosyalar: {n}',parsing:'Dosya ayrıştırılıyor…',
    found_brushes:'{n} fırça bulundu…',processing:'İşleniyor: {n} / {m}',
    building_meshes:'Meshler oluşturuluyor…',done_brushes:'Tamam · {n} fırça · {m} üçgen',
    reading:'Dosya okunuyor…',read_fail:'Dosya okunamadı',
    error:'Hata: {msg}',tex_added:'Dokular depoya eklendi',
    shot_saved:'Ekran görüntüsü kaydedildi: {name}',prep_glb:'GLB hazırlanıyor…',
    glb_saved:'GLB kaydedildi: {name} ({size} MB)',
    ready:'Hazır. Dosyalar tarayıcıda yerel olarak saklanır.',
    stat_file:'Dosya',stat_mdl:'MDL',stat_bones:'Kemikler',
    stat_meshes:'Meshler',stat_verts:'Köşeler',stat_tris:'Üçgenler',
    stat_mats:'Materyaller',stat_mode:'Mod',stat_layout:'Yerleşim',
    stat_phy:'PHY',
    folders_files:'Klasörler: {n} · Dosyalar: {m}',
    found_of:'Bulundu: {n} / {m}',
    mip_frame:'mip {mip} · kare {frame}/{total}',
    approx_fmt:'Biçim <b>{fmt}</b> — yaklaşık.',
    mode_skin:'açık ({n})',mode_bind:'bind pose',phy_error:'hata',
  },
  zh: {
    lang_name:'中文',
    tab_maps:'地图',tab_models:'模型',tab_tex:'纹理',
    files:'文件',open_storage:'打开存储',
    vmf_open:'地图',vmf_tex:'纹理',
    stats:'统计',brushes:'笔刷',polygons:'多边形',
    triangles:'三角形',entities:'实体',materials:'材质',
    vtf_tex:'VTF 纹理',entity_icons:'实体图标',map_size:'地图尺寸',
    display:'显示',show_triggers:'显示触发器',
    show_entities:'显示实体',show_entity_icons:'实体图标',
    icons_on_top:'穿墙图标',icon_size:'图标尺寸',
    icons_loaded:'已加载图标：{n}',
    glass_transparent:'透明玻璃',
    textures:'纹理',screenshot:'截图',hd_quality:'HD 质量 (×2)',
    hide_panels:'隐藏面板',export_glb:'导出 GLB',
    glb_entities:'实体',glb_triggers:'触发器',max_size:'最大尺寸',
    fallback_colors:'备用颜色',
    c_concrete:'混凝土',c_metal:'金属',c_tile:'瓷砖',
    c_glass:'玻璃',c_sign:'标志',c_light:'灯光',
    drop_vmf_title:'拖入 .vmf 或文件夹',
    drop_vmf_desc:'或点击选择文件<br>含 <b>.vtf</b> 纹理和 <b>.png</b> 图标的文件夹可以单独拖入',
    drop_vmf_small:'所有内容都保存在浏览器本地（图标 — 仅内存）',
    waiting_file:'等待文件…',
    mouse_hint:'左键 — 旋转 · 右键 — 平移 · 滚轮 — 缩放',
    inspector:'检查器',load_models:'加载模型',
    load_mats:'加载材质',model:'模型',
    textures_vtf:'VTF 纹理',apply_skin:'应用骨骼',
    show_phy:'显示 .phy',auto_fit:'自动适配',
    info:'信息',load_models_first:'先加载模型，<br>再加载材质',
    mouse_hint_m:'左键 — 旋转 · 滚轮 — 缩放 · 右键 — 平移',
    loading:'加载中…',
    grid:'网格',wireframe:'线框',collisions:'碰撞',
    light:'光照',rotation:'旋转',show_all:'适应全部',
    hide_panel:'隐藏面板',show_panel:'显示面板',
    drop_tex_title:'拖入文件夹或 .vtf 文件',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 等',
    pick_folder:'选择文件夹',pick_files:'选择文件',
    clear_list:'清空列表',vtf_label:'VTF',skipped_label:'已跳过',
    pick_vtf:'在下方列表中选择 .vtf 文件',
    mipmap:'Mipmap：',frame:'帧：',download_png:'⬇ 下载 PNG',
    contents_emoji:'📂 内容',search_all:'在所有文件夹中搜索…',
    nothing_found:'未找到任何内容',empty:'空',
    storage_title:'文件存储',
    files_count:'文件数：',total_size:'大小：',quota:'配额：',
    del_vtf:'🗑 删除所有 .vtf',del_all:'🗑 全部删除',apply:'✓ 应用',
    confirm_del_vtf:'从存储中删除所有 .vtf 吗？',
    confirm_del_all:'完全清空存储吗？',
    saved_files:'已保存文件：{n}',parsing:'正在解析文件…',
    found_brushes:'找到 {n} 个笔刷…',processing:'处理中：{n} / {m}',
    building_meshes:'正在构建网格…',done_brushes:'完成 · {n} 笔刷 · {m} 三角形',
    reading:'正在读取文件…',read_fail:'无法读取文件',
    error:'错误：{msg}',tex_added:'纹理已添加到存储',
    shot_saved:'截图已保存：{name}',prep_glb:'正在准备 GLB…',
    glb_saved:'GLB 已保存：{name} ({size} MB)',
    ready:'就绪。文件保存在浏览器本地。',
    stat_file:'文件',stat_mdl:'MDL',stat_bones:'骨骼',
    stat_meshes:'网格',stat_verts:'顶点',stat_tris:'三角形',
    stat_mats:'材质',stat_mode:'模式',stat_layout:'布局',
    stat_phy:'PHY',
    folders_files:'文件夹：{n} · 文件：{m}',
    found_of:'找到：{n} / {m}',
    mip_frame:'mip {mip} · 帧 {frame}/{total}',
    approx_fmt:'格式 <b>{fmt}</b> — 近似。',
    mode_skin:'开 ({n})',mode_bind:'bind pose',phy_error:'错误',
  },
  ja: {
    lang_name:'日本語',
    tab_maps:'マップ',tab_models:'モデル',tab_tex:'テクスチャ',
    files:'ファイル',open_storage:'ストレージを開く',
    vmf_open:'マップ',vmf_tex:'テクスチャ',
    stats:'統計',brushes:'ブラシ',polygons:'ポリゴン',
    triangles:'三角形',entities:'エンティティ',materials:'マテリアル',
    vtf_tex:'VTF テクスチャ',entity_icons:'エンティティアイコン',map_size:'マップサイズ',
    display:'表示',show_triggers:'トリガーを表示',
    show_entities:'エンティティを表示',show_entity_icons:'エンティティアイコン',
    icons_on_top:'壁越しアイコン',icon_size:'アイコンサイズ',
    icons_loaded:'読み込んだアイコン: {n}',
    glass_transparent:'透明ガラス',
    textures:'テクスチャ',screenshot:'スクリーンショット',hd_quality:'HD 画質 (×2)',
    hide_panels:'パネルを隠す',export_glb:'GLB を書き出す',
    glb_entities:'エンティティ',glb_triggers:'トリガー',max_size:'最大サイズ',
    fallback_colors:'代替色',
    c_concrete:'コンクリート',c_metal:'金属',c_tile:'タイル',
    c_glass:'ガラス',c_sign:'看板',c_light:'光',
    drop_vmf_title:'.vmf またはフォルダをドロップ',
    drop_vmf_desc:'またはクリックしてファイルを選択<br><b>.vtf</b> テクスチャと <b>.png</b> アイコンのフォルダは別途ドロップできます',
    drop_vmf_small:'すべてブラウザにローカル保存されます（アイコンはメモリのみ）',
    waiting_file:'ファイルを待機中…',
    mouse_hint:'左クリック — 回転 · 右クリック — パン · ホイール — ズーム',
    inspector:'インスペクタ',load_models:'モデルを読み込む',
    load_mats:'マテリアルを読み込む',model:'モデル',
    textures_vtf:'VTF テクスチャ',apply_skin:'スケルトンを適用',
    show_phy:'.phy を表示',auto_fit:'自動フィット',
    info:'情報',load_models_first:'モデルを読み込んでから<br>マテリアルを読み込んでください',
    mouse_hint_m:'左クリック — 回転 · ホイール — ズーム · 右クリック — パン',
    loading:'読み込み中…',
    grid:'グリッド',wireframe:'ワイヤーフレーム',collisions:'コリジョン',
    light:'ライト',rotation:'回転',show_all:'全体を表示',
    hide_panel:'パネルを隠す',show_panel:'パネルを表示',
    drop_tex_title:'フォルダまたは .vtf ファイルをドロップ',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 など',
    pick_folder:'フォルダを選択',pick_files:'ファイルを選択',
    clear_list:'リストをクリア',vtf_label:'VTF',skipped_label:'スキップ',
    pick_vtf:'下のリストから .vtf ファイルを選択',
    mipmap:'ミップマップ:',frame:'フレーム:',download_png:'⬇ PNG をダウンロード',
    contents_emoji:'📂 内容',search_all:'すべてのフォルダを検索…',
    nothing_found:'何も見つかりません',empty:'空',
    storage_title:'ファイルストレージ',
    files_count:'ファイル数:',total_size:'サイズ:',quota:'容量:',
    del_vtf:'🗑 すべての .vtf を削除',del_all:'🗑 すべて削除',apply:'✓ 適用',
    confirm_del_vtf:'ストレージからすべての .vtf を削除しますか？',
    confirm_del_all:'ストレージを完全に消去しますか？',
    saved_files:'保存したファイル: {n}',parsing:'ファイルを解析中…',
    found_brushes:'{n} 個のブラシを発見…',processing:'処理中: {n} / {m}',
    building_meshes:'メッシュを構築中…',done_brushes:'完了 · {n} ブラシ · {m} 三角形',
    reading:'ファイルを読み込み中…',read_fail:'ファイルを読み込めません',
    error:'エラー: {msg}',tex_added:'テクスチャをストレージに追加しました',
    shot_saved:'スクリーンショットを保存: {name}',prep_glb:'GLB を準備中…',
    glb_saved:'GLB を保存: {name} ({size} MB)',
    ready:'準備完了。ファイルはブラウザにローカル保存されます。',
    stat_file:'ファイル',stat_mdl:'MDL',stat_bones:'ボーン',
    stat_meshes:'メッシュ',stat_verts:'頂点',stat_tris:'三角形',
    stat_mats:'マテリアル',stat_mode:'モード',stat_layout:'レイアウト',
    stat_phy:'PHY',
    folders_files:'フォルダ: {n} · ファイル: {m}',
    found_of:'検出: {n} / {m}',
    mip_frame:'ミップ {mip} · フレーム {frame}/{total}',
    approx_fmt:'フォーマット <b>{fmt}</b> — 近似。',
    mode_skin:'オン ({n})',mode_bind:'bind pose',phy_error:'エラー',
  },
  ko: {
    lang_name:'한국어',
    tab_maps:'맵',tab_models:'모델',tab_tex:'텍스처',
    files:'파일',open_storage:'저장소 열기',
    vmf_open:'맵',vmf_tex:'텍스처',
    stats:'통계',brushes:'브러시',polygons:'폴리곤',
    triangles:'삼각형',entities:'엔티티',materials:'재질',
    vtf_tex:'VTF 텍스처',entity_icons:'엔티티 아이콘',map_size:'맵 크기',
    display:'표시',show_triggers:'트리거 표시',
    show_entities:'엔티티 표시',show_entity_icons:'엔티티 아이콘',
    icons_on_top:'벽 통과 아이콘',icon_size:'아이콘 크기',
    icons_loaded:'로드된 아이콘: {n}',
    glass_transparent:'투명 유리',
    textures:'텍스처',screenshot:'스크린샷',hd_quality:'HD 품질 (×2)',
    hide_panels:'패널 숨기기',export_glb:'GLB 내보내기',
    glb_entities:'엔티티',glb_triggers:'트리거',max_size:'최대 크기',
    fallback_colors:'대체 색상',
    c_concrete:'콘크리트',c_metal:'금속',c_tile:'타일',
    c_glass:'유리',c_sign:'표지판',c_light:'조명',
    drop_vmf_title:'.vmf 또는 폴더를 드롭하세요',
    drop_vmf_desc:'또는 클릭하여 파일 선택<br><b>.vtf</b> 텍스처와 <b>.png</b> 아이콘 폴더는 별도로 드롭할 수 있습니다',
    drop_vmf_small:'모든 것이 브라우저에 로컬로 저장됩니다 (아이콘은 메모리에만)',
    waiting_file:'파일 대기 중…',
    mouse_hint:'좌클릭 — 회전 · 우클릭 — 이동 · 휠 — 줌',
    inspector:'검사기',load_models:'모델 불러오기',
    load_mats:'재질 불러오기',model:'모델',
    textures_vtf:'VTF 텍스처',apply_skin:'스켈레톤 적용',
    show_phy:'.phy 표시',auto_fit:'자동 맞춤',
    info:'정보',load_models_first:'모델을 먼저 불러온 후<br>재질을 불러오세요',
    mouse_hint_m:'좌클릭 — 회전 · 휠 — 줌 · 우클릭 — 이동',
    loading:'불러오는 중…',
    grid:'그리드',wireframe:'와이어프레임',collisions:'충돌체',
    light:'조명',rotation:'회전',show_all:'전체 보기',
    hide_panel:'패널 숨기기',show_panel:'패널 표시',
    drop_tex_title:'폴더 또는 .vtf 파일을 드롭하세요',
    drop_tex_sub:'DXT1/3/5 · BGRA/BGRX8888 · RGB565 · BGRA4444 · I8 · IA88 · A8 등',
    pick_folder:'폴더 선택',pick_files:'파일 선택',
    clear_list:'목록 지우기',vtf_label:'VTF',skipped_label:'건너뜀',
    pick_vtf:'아래 목록에서 .vtf 파일을 선택하세요',
    mipmap:'밉맵:',frame:'프레임:',download_png:'⬇ PNG 다운로드',
    contents_emoji:'📂 내용',search_all:'모든 폴더 검색…',
    nothing_found:'결과 없음',empty:'비어 있음',
    storage_title:'파일 저장소',
    files_count:'파일:',total_size:'크기:',quota:'할당량:',
    del_vtf:'🗑 모든 .vtf 삭제',del_all:'🗑 전체 삭제',apply:'✓ 적용',
    confirm_del_vtf:'저장소의 모든 .vtf를 삭제하시겠습니까?',
    confirm_del_all:'저장소를 완전히 비우시겠습니까?',
    saved_files:'저장된 파일: {n}',parsing:'파일 분석 중…',
    found_brushes:'{n}개의 브러시 발견…',processing:'처리 중: {n} / {m}',
    building_meshes:'메시 생성 중…',done_brushes:'완료 · {n} 브러시 · {m} 삼각형',
    reading:'파일 읽는 중…',read_fail:'파일을 읽을 수 없습니다',
    error:'오류: {msg}',tex_added:'텍스처를 저장소에 추가했습니다',
    shot_saved:'스크린샷 저장: {name}',prep_glb:'GLB 준비 중…',
    glb_saved:'GLB 저장됨: {name} ({size} MB)',
    ready:'준비 완료. 파일은 브라우저에 로컬 저장됩니다.',
    stat_file:'파일',stat_mdl:'MDL',stat_bones:'본',
    stat_meshes:'메시',stat_verts:'정점',stat_tris:'삼각형',
    stat_mats:'재질',stat_mode:'모드',stat_layout:'레이아웃',
    stat_phy:'PHY',
    folders_files:'폴더: {n} · 파일: {m}',
    found_of:'발견: {n} / {m}',
    mip_frame:'밉 {mip} · 프레임 {frame}/{total}',
    approx_fmt:'형식 <b>{fmt}</b> — 근사치.',
    mode_skin:'켜짐 ({n})',mode_bind:'bind pose',phy_error:'오류',
  }
};

const LANG_KEY = 'sav_lang';
let LANG = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && I18N[saved]) return saved;
    const nav = (navigator.language || 'en').slice(0,2).toLowerCase();
    return I18N[nav] ? nav : 'en';
  } catch(_) { return 'en'; }
})();

function t(key, params){
  const dict = I18N[LANG] || I18N.en;
  let s = (dict && dict[key] != null ? dict[key] : null);
  if (s == null) s = (I18N.en[key] != null ? I18N.en[key] : key);
  if (params) for (const k in params) s = s.split('{'+k+'}').join(params[k]);
  return s;
}

/* ================================================================
   INDEXEDDB
   ================================================================ */
const DB_NAME='source_asset_viewer_db';
const DB_VER=1;
const STORE='files';
let db=null;

function openDB(){
  return new Promise((res,rej)=>{
    if(!('indexedDB' in window)) return rej(new Error('IndexedDB unsupported'));
    const rq=indexedDB.open(DB_NAME,DB_VER);
    rq.onupgradeneeded=()=>{
      const d=rq.result;
      if(!d.objectStoreNames.contains(STORE)){
        const s=d.createObjectStore(STORE,{keyPath:'path'});
        s.createIndex('ext','ext');
        s.createIndex('time','time');
      }
    };
    rq.onsuccess=()=>res(rq.result);
    rq.onerror=()=>rej(rq.error);
  });
}
async function dbPut(path,blob,extra){
  if(!db) return;
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    const m=/\.([^.]+)$/.exec(path)||[,''];
    tx.objectStore(STORE).put({
      path,blob,ext:m[1].toLowerCase(),
      size:blob.size||0,time:Date.now(),...(extra||{})
    });
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  });
}
async function dbGetAll(){
  if(!db) return [];
  return new Promise((res,rej)=>{
    const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    rq.onsuccess=()=>res(rq.result||[]);
    rq.onerror=()=>rej(rq.error);
  });
}
async function dbDelete(path){
  if(!db) return;
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(path);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  });
}
async function dbClearKeys(keys){
  if(!db||!keys.length) return;
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    const st=tx.objectStore(STORE);
    for(const k of keys) st.delete(k);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  });
}
async function dbClearAll(){
  if(!db) return;
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
  });
}
function fmtB(n){
  if(!n) return '0 B';
  const u=['B','KB','MB','GB'];let i=0,v=n;
  while(v>=1024&&i<u.length-1){v/=1024;i++;}
  return (i===0?Math.round(v):v.toFixed(v<10?2:1))+' '+u[i];
}

/* ================================================================
   GLOBAL STORE
   ================================================================ */
const Store={
  files:new Map(),
  async init(){
    try{ db=await openDB(); }catch(e){ console.warn('IDB:',e); return; }
    const all=await dbGetAll();
    for(const f of all) this.files.set(f.path,f);
    refreshGlobalStats();
    refreshStorageModal();
  },
  async put(path,blob){
    path=path.replace(/\\/g,'/');
    const m=/\.([^.]+)$/.exec(path)||[,''];
    const rec={path,blob,ext:m[1].toLowerCase(),size:blob.size||0,time:Date.now()};
    this.files.set(path,rec);
    await dbPut(path,blob);
    refreshGlobalStats();
  },
  async delete(path){
    this.files.delete(path);
    await dbDelete(path);
    refreshGlobalStats();
    refreshStorageModal();
  },
  async deleteMany(paths){
    for(const p of paths) this.files.delete(p);
    await dbClearKeys(paths);
    refreshGlobalStats();
    refreshStorageModal();
  },
  async clearAll(){
    this.files.clear();
    await dbClearAll();
    refreshGlobalStats();
    refreshStorageModal();
  },
  get(path){ return this.files.get(path.replace(/\\/g,'/')) || null; },
  listByExt(ext){
    const out=[];
    for(const f of this.files.values()) if(f.ext===ext) out.push(f);
    return out;
  }
};

/* ================================================================
   VTF PARSER
   ================================================================ */
const VTF_SIG=0x00465456;
const VTF_FORMAT_NAMES={0:'RGBA8888',1:'ABGR8888',2:'RGB888',3:'BGR888',4:'RGB565',5:'I8',6:'IA88',
  7:'P8',8:'A8',9:'RGB888_BS',10:'BGR888_BS',11:'ARGB8888',12:'BGRA8888',13:'DXT1',14:'DXT3',15:'DXT5',
  16:'BGRX8888',17:'BGR565',18:'BGRX5551',19:'BGRA4444',20:'DXT1_1A',21:'BGRA5551',22:'UV88',
  23:'UVWQ8888',24:'RGBA16F',25:'RGBA16',26:'UVLX8888'};
const vtfFmtName=f=>VTF_FORMAT_NAMES[f]||('Format '+f);
const vtfIsBlock=f=>(f>=13&&f<=15)||f===20;
const vtfBlockSz=f=>(f===13||f===20)?8:16;
function vtfBPP(f){
  switch(f){case 0:case 1:case 11:case 12:case 16:case 23:case 26:return 4;
    case 2:case 3:return 3;case 4:case 6:case 17:case 18:case 19:case 21:case 22:return 2;
    case 5:case 7:case 8:return 1;case 24:case 25:return 8;default:return 4;}
}
function vtfMipSize(w,h,f){
  if(vtfIsBlock(f)) return Math.max(1,Math.ceil(w/4))*Math.max(1,Math.ceil(h/4))*vtfBlockSz(f);
  return w*h*vtfBPP(f);
}
function alphaPal(a0,a1){
  const p=new Uint8Array(8);p[0]=a0;p[1]=a1;
  if(a0>a1){for(let i=1;i<=6;i++)p[i+1]=Math.round(((7-i)*a0+i*a1)/7);}
  else{for(let i=1;i<=4;i++)p[i+1]=Math.round(((5-i)*a0+i*a1)/5);p[6]=0;p[7]=255;}
  return p;
}
function decodeDXT(u8,off,w,h,f){
  const out=new Uint8Array(w*h*4),bw=Math.ceil(w/4),bh=Math.ceil(h/4);
  const isD1=(f===13||f===20);let p=off;
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){
    let aP=null;
    if(!isD1){
      aP=new Uint8Array(16);
      if(f===14){for(let i=0;i<16;i+=2){const b=u8[p+(i>>1)];aP[i]=(b&0xF)*17;aP[i+1]=((b>>4)&0xF)*17;}}
      else{const a0=u8[p],a1=u8[p+1],pal=alphaPal(a0,a1);let v=0,bl=0,bp=p+2;
        for(let i=0;i<16;i++){while(bl<3){v|=u8[bp++]<<bl;bl+=8;}aP[i]=pal[v&7];v>>>=3;bl-=3;}}
      p+=8;
    }
    const c0=u8[p]|(u8[p+1]<<8),c1=u8[p+2]|(u8[p+3]<<8);
    const bits=(u8[p+4]|(u8[p+5]<<8)|(u8[p+6]<<16)|(u8[p+7]<<24))>>>0;p+=8;
    const r0=(c0>>11)&0x1F,g0=(c0>>5)&0x3F,b0=c0&0x1F;
    const r1=(c1>>11)&0x1F,g1=(c1>>5)&0x3F,b1=c1&0x1F;
    const cr0=(r0<<3)|(r0>>2),cg0=(g0<<2)|(g0>>4),cb0=(b0<<3)|(b0>>2);
    const cr1=(r1<<3)|(r1>>2),cg1=(g1<<2)|(g1>>4),cb1=(b1<<3)|(b1>>2);
    const pal=new Uint8Array(12);pal[0]=cr0;pal[1]=cg0;pal[2]=cb0;pal[3]=cr1;pal[4]=cg1;pal[5]=cb1;
    let t3=false;
    if(c0>c1||!isD1){pal[6]=(2*cr0+cr1)/3|0;pal[7]=(2*cg0+cg1)/3|0;pal[8]=(2*cb0+cb1)/3|0;
      pal[9]=(cr0+2*cr1)/3|0;pal[10]=(cg0+2*cg1)/3|0;pal[11]=(cb0+2*cb1)/3|0;}
    else{pal[6]=(cr0+cr1)/2|0;pal[7]=(cg0+cg1)/2|0;pal[8]=(cb0+cb1)/2|0;t3=true;}
    for(let y=0;y<4;y++)for(let x=0;x<4;x++){
      const px=bx*4+x,py=by*4+y;if(px>=w||py>=h) continue;
      const ci=(bits>>((y*4+x)*2))&3,o=(py*w+px)*4;
      out[o]=pal[ci*3];out[o+1]=pal[ci*3+1];out[o+2]=pal[ci*3+2];
      out[o+3]=aP?aP[y*4+x]:(t3&&ci===3?0:255);
    }
  }
  return out;
}
function decodePixels(u8,off,w,h,f){
  if(vtfIsBlock(f)) return decodeDXT(u8,off,w,h,f);
  const out=new Uint8Array(w*h*4),tot=w*h;let p=off;
  switch(f){
    case 0:for(let i=0;i<tot;i++,p+=4){out[i*4]=u8[p];out[i*4+1]=u8[p+1];out[i*4+2]=u8[p+2];out[i*4+3]=u8[p+3];}break;
    case 1:for(let i=0;i<tot;i++,p+=4){out[i*4]=u8[p+3];out[i*4+1]=u8[p+2];out[i*4+2]=u8[p+1];out[i*4+3]=u8[p];}break;
    case 2:for(let i=0;i<tot;i++,p+=3){out[i*4]=u8[p];out[i*4+1]=u8[p+1];out[i*4+2]=u8[p+2];out[i*4+3]=255;}break;
    case 3:for(let i=0;i<tot;i++,p+=3){out[i*4]=u8[p+2];out[i*4+1]=u8[p+1];out[i*4+2]=u8[p];out[i*4+3]=255;}break;
    case 4:for(let i=0;i<tot;i++,p+=2){const c=u8[p]|(u8[p+1]<<8);const r=(c>>11)&0x1F,g=(c>>5)&0x3F,b=c&0x1F;out[i*4]=(r<<3)|(r>>2);out[i*4+1]=(g<<2)|(g>>4);out[i*4+2]=(b<<3)|(b>>2);out[i*4+3]=255;}break;
    case 5:for(let i=0;i<tot;i++,p++){const v=u8[p];out[i*4]=v;out[i*4+1]=v;out[i*4+2]=v;out[i*4+3]=255;}break;
    case 6:for(let i=0;i<tot;i++,p+=2){const v=u8[p];out[i*4]=v;out[i*4+1]=v;out[i*4+2]=v;out[i*4+3]=u8[p+1];}break;
    case 7:for(let i=0;i<tot;i++,p++){const v=u8[p];out[i*4]=v;out[i*4+1]=v;out[i*4+2]=v;out[i*4+3]=255;}break;
    case 8:for(let i=0;i<tot;i++,p++){out[i*4]=255;out[i*4+1]=255;out[i*4+2]=255;out[i*4+3]=u8[p];}break;
    case 11:for(let i=0;i<tot;i++,p+=4){out[i*4]=u8[p+1];out[i*4+1]=u8[p+2];out[i*4+2]=u8[p+3];out[i*4+3]=u8[p];}break;
    case 12:for(let i=0;i<tot;i++,p+=4){out[i*4]=u8[p+2];out[i*4+1]=u8[p+1];out[i*4+2]=u8[p];out[i*4+3]=u8[p+3];}break;
    case 16:for(let i=0;i<tot;i++,p+=4){out[i*4]=u8[p+2];out[i*4+1]=u8[p+1];out[i*4+2]=u8[p];out[i*4+3]=255;}break;
    case 17:for(let i=0;i<tot;i++,p+=2){const c=u8[p]|(u8[p+1]<<8);const b=(c>>11)&0x1F,g=(c>>5)&0x3F,r=c&0x1F;out[i*4]=(r<<3)|(r>>2);out[i*4+1]=(g<<2)|(g>>4);out[i*4+2]=(b<<3)|(b>>2);out[i*4+3]=255;}break;
    case 18:for(let i=0;i<tot;i++,p+=2){const c=u8[p]|(u8[p+1]<<8);const b=c&0x1F,g=(c>>5)&0x1F,r=(c>>10)&0x1F;out[i*4]=(r<<3)|(r>>2);out[i*4+1]=(g<<3)|(g>>2);out[i*4+2]=(b<<3)|(b>>2);out[i*4+3]=255;}break;
    case 19:for(let i=0;i<tot;i++,p+=2){const c=u8[p]|(u8[p+1]<<8);const b=c&0xF,g=(c>>4)&0xF,r=(c>>8)&0xF,a=(c>>12)&0xF;out[i*4]=(r<<4)|r;out[i*4+1]=(g<<4)|g;out[i*4+2]=(b<<4)|b;out[i*4+3]=(a<<4)|a;}break;
    case 21:for(let i=0;i<tot;i++,p+=2){const c=u8[p]|(u8[p+1]<<8);const b=c&0x1F,g=(c>>5)&0x1F,r=(c>>10)&0x1F,a=(c>>15)&1;out[i*4]=(r<<3)|(r>>2);out[i*4+1]=(g<<3)|(g>>2);out[i*4+2]=(b<<3)|(b>>2);out[i*4+3]=a?255:0;}break;
    default:for(let i=0;i<tot;i++){const x=i%w,y=(i/w)|0,c=((x>>3)^(y>>3))&1?180:110;out[i*4]=c;out[i*4+1]=(c*0.6)|0;out[i*4+2]=c;out[i*4+3]=255;}
  }
  return out;
}
function flipV(pix,w,h){
  const out=new Uint8Array(pix.length),rs=w*4;
  for(let y=0;y<h;y++){const s=(h-1-y)*rs;out.set(pix.subarray(s,s+rs),y*rs);}
  return out;
}
function parseVTF(buffer){
  const u8=new Uint8Array(buffer);
  if(u8.length<64) throw new Error('VTF too small');
  const dv=new DataView(buffer);
  if(dv.getUint32(0,true)!==VTF_SIG) throw new Error('not VTF');
  const major=dv.getUint32(4,true),minor=dv.getUint32(8,true);
  const headerSize=dv.getUint32(12,true);
  const width=dv.getUint16(16,true),height=dv.getUint16(18,true);
  const flags=dv.getUint32(20,true);
  let frames=dv.getUint16(24,true);if(!frames)frames=1;
  const firstFrame=dv.getUint16(26,true);
  const hiFmt=dv.getUint32(52,true);
  let mipCount=u8[56];if(!mipCount)mipCount=1;
  const loFmt=dv.getUint32(57,true),loW=u8[61],loH=u8[62];
  let depth=1;
  if(major>7||(major===7&&minor>=2)){if(u8.length>=65)depth=dv.getUint16(63,true)||1;}
  let numRes=0;
  if(major>7||(major===7&&minor>=4)){if(headerSize>=72&&u8.length>=72)numRes=dv.getUint32(68,true);}
  if(!width||!height) throw new Error('zero dimensions');
  let loSize=0;
  if(loW>0&&loH>0&&loFmt!==0xFFFFFFFF&&loFmt<=26) loSize=vtfMipSize(loW,loH,loFmt);
  const dataStart=headerSize+numRes*8+loSize;
  const mipOffsets=[];let cur=dataStart;
  for(let i=mipCount-1;i>=0;i--){
    const mw=Math.max(1,width>>i),mh=Math.max(1,height>>i);
    mipOffsets[i]=cur;cur+=vtfMipSize(mw,mh,hiFmt)*frames*depth;
  }
  return {u8,width,height,frames,depth,mipmaps:mipCount,format:hiFmt,
    formatName:vtfFmtName(hiFmt),version:major+'.'+minor,flags,firstFrame,mipOffsets};
}
function decodeVTFFrame(vtf,mip,fi){
  const mw=Math.max(1,vtf.width>>mip),mh=Math.max(1,vtf.height>>mip);
  const mipSize=vtfMipSize(mw,mh,vtf.format),stride=mipSize*vtf.depth;
  const off=vtf.mipOffsets[mip]+fi*stride;
  if(off+mipSize>vtf.u8.length) throw new Error('mip truncated');
  const pix=decodePixels(vtf.u8,off,mw,mh,vtf.format);
  return {width:mw,height:mh,pixels:flipV(pix,mw,mh)};
}
function normMat(s){ return String(s||'').toLowerCase().replace(/^materials\//,'').replace(/\.vtf$/,'').trim(); }

/* ================================================================
   TEXSTORE
   ================================================================ */
const TexStore={
  byBase:new Map(),
  _texCache:new Map(),
  enabled:true,
  async rebuild(){
    this.byBase.clear();
    this._texCache.clear();
    for(const f of Store.listByExt('vtf')){
      const base=f.path.split('/').pop().toLowerCase().replace(/\.vtf$/,'');
      if(!this.byBase.has(base)) this.byBase.set(base,[]);
      this.byBase.get(base).push(f);
    }
    refreshGlobalStats();
  },
  findByMat(matName){
    if(!this.enabled) return null;
    const key=normMat(matName);
    if(!key) return null;
    const base=key.split('/').pop();
    const list=this.byBase.get(base);
    return list && list[0] ? list[0] : null;
  },
  async makeTexture(fileRec, maxW=512){
    if(!fileRec) return null;
    const cacheKey=fileRec.path+'@'+maxW;
    if(this._texCache.has(cacheKey)) return this._texCache.get(cacheKey);
    try{
      const buf=await fileRec.blob.arrayBuffer();
      const vtf=parseVTF(buf);
      let mip=0;
      for(let i=0;i<vtf.mipmaps;i++){
        const w=Math.max(1,vtf.width>>i);
        if(w<=maxW){mip=i;break;}
        mip=i;
      }
      const res=decodeVTFFrame(vtf,mip,0);
      const cv=document.createElement('canvas');
      cv.width=res.width;cv.height=res.height;
      const ctx=cv.getContext('2d');
      const id=ctx.createImageData(res.width,res.height);
      id.data.set(res.pixels);
      ctx.putImageData(id,0,0);
      let hasAlpha=false;
      const step=Math.max(1,Math.floor(res.width*res.height/8000));
      for(let i=3;i<res.pixels.length;i+=4*step) if(res.pixels[i]<250){hasAlpha=true;break;}
      const tex=new THREE.CanvasTexture(cv);
      tex.colorSpace=THREE.SRGBColorSpace;
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
      tex.anisotropy=4;
      tex.generateMipmaps=true;
      tex.minFilter=THREE.LinearMipmapLinearFilter;
      tex.magFilter=THREE.LinearFilter;
      tex.needsUpdate=true;
      const out={texture:tex,width:res.width,height:res.height,hasAlpha};
      this._texCache.set(cacheKey,out);
      return out;
    }catch(e){
      this._texCache.set(cacheKey,null);
      return null;
    }
  }
};

/* ================================================================
   ENTITY ICONS (только в памяти, не в IndexedDB)
   ================================================================ */
const EntityIcons = {
  map: new Map(),          // lowercase stem -> THREE.Texture
  _urls: new Set(),
  listeners: new Set(),

  addFromFile(file, name){
    return new Promise((resolve) => {
      const stem = String(name || file.name || '')
        .replace(/\.(png|jpg|jpeg|bmp)$/i, '')
        .toLowerCase().trim();
      if (!stem) return resolve(false);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const tex = new THREE.Texture(img);
          tex.needsUpdate = true;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.magFilter = THREE.LinearFilter;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.generateMipmaps = true;
          const old = this.map.get(stem);
          if (old) old.dispose();
          this.map.set(stem, tex);
          this._urls.add(url);
          this._notify();
          resolve(true);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(false);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      img.src = url;
    });
  },

  get(classname){
    const c = String(classname || '').toLowerCase();
    if (!c) return null;
    if (this.map.has(c)) return this.map.get(c);
    // fallback по префиксам: light_spot → light; info_player_start → info_player → info
    let p = c;
    while (p.includes('_')) {
      p = p.slice(0, p.lastIndexOf('_'));
      if (this.map.has(p)) return this.map.get(p);
    }
    return null;
  },

  get count(){ return this.map.size; },

  clear(){
    for (const t of this.map.values()) t.dispose();
    this.map.clear();
    for (const u of this._urls) URL.revokeObjectURL(u);
    this._urls.clear();
    this._notify();
  },

  onChange(fn){ this.listeners.add(fn); },
  _notify(){ for (const fn of this.listeners){ try{ fn(this.count); }catch(_){} } }
};

// Папки, чьи PNG считаем иконками (не пишем в IndexedDB):
const ICON_PATH_RE = /(?:^|\/)(?:features|icons?|editoricons?|entity_?icons?)\//i;

// Разделяет список дропа на "хранить в IDB" и "иконки в память"
function categorizeDroppedFiles(list){
  const storeFiles = [];
  const iconFiles = [];
  for (const {path, file} of list){
    const p = String(path || file.name || '').replace(/\\/g, '/');
    if (/\.(png|jpg|jpeg|bmp)$/i.test(p) && ICON_PATH_RE.test(p)){
      iconFiles.push({path: p, file});
    } else {
      storeFiles.push({path: p, file});
    }
  }
  return {storeFiles, iconFiles};
}

/* ================================================================
   FILE INGESTION
   ================================================================ */
async function addFilesToStore(list, {silent=false}={}){
  let saved=0;
  for(const {path,file} of list){
    const p=path.replace(/\\/g,'/');
    await Store.put(p,file);
    saved++;
  }
  await TexStore.rebuild();
  if(!silent && saved) updateStatusAll('saved_files',{n:saved});
  refreshGlobalStats();
  refreshStorageModal();
  return saved;
}
async function walkDrop(dt){
  const out=[];
  const items=dt.items;
  if(items&&items.length&&items[0].webkitGetAsEntry){
    const entries=[];
    for(const it of items){ if(it.kind!=='file') continue; const e=it.webkitGetAsEntry(); if(e) entries.push(e); }
    for(const en of entries) await walkEntry(en,'',out);
  } else {
    for(const f of dt.files||[]) out.push({path:f.name,file:f});
  }
  return out;
}
function walkEntry(en,prefix,out){
  return new Promise(resolve=>{
    if(en.isFile){
      en.file(f=>{ out.push({path:prefix+en.name,file:f}); resolve(); },()=>resolve());
    } else if(en.isDirectory){
      const reader=en.createReader();
      const all=[];
      const readBatch=()=>{
        reader.readEntries(async batch=>{
          if(!batch.length){
            for(const e of all) await walkEntry(e,prefix+en.name+'/',out);
            resolve();return;
          }
          all.push(...batch);readBatch();
        },()=>resolve());
      };
      readBatch();
    } else resolve();
  });
}

/* ================================================================
   TOP TABS
   ================================================================ */
const tabEls=document.querySelectorAll('#topbar .tab');
const panes={
  vmf:document.getElementById('paneVmf'),
  models:document.getElementById('paneModels'),
  tex:document.getElementById('paneTex')
};
let activeTab='vmf';
function switchTab(name){
  activeTab=name;
  tabEls.forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  Object.entries(panes).forEach(([k,p])=>p.classList.toggle('active',k===name));
  if(name==='vmf' && typeof vmfResize==='function') setTimeout(vmfResize,60);
  if(name==='models' && typeof modelResize==='function') setTimeout(modelResize,60);
}
tabEls.forEach(t=>t.addEventListener('click',()=>switchTab(t.dataset.tab)));

/* ================================================================
   GLOBAL STATS / MODAL
   ================================================================ */
function refreshGlobalStats(){
  const files=[...Store.files.values()];
  document.getElementById('gFiles').textContent=files.length.toLocaleString(LANG);
  const vtf=files.filter(f=>f.ext==='vtf').length;
  const mdl=files.filter(f=>f.ext==='mdl').length;
  document.getElementById('gT').textContent=vtf.toLocaleString(LANG);
  document.getElementById('gM').textContent=mdl.toLocaleString(LANG);
  const icoEl=document.getElementById('gI');
  if(icoEl) icoEl.textContent=EntityIcons.count.toLocaleString(LANG);
  const icoDot=document.getElementById('gDotI');
  if(icoDot) icoDot.classList.toggle('on',EntityIcons.count>0);
  document.getElementById('gDotT').classList.toggle('on',vtf>0);
  document.getElementById('gDotM').classList.toggle('on',mdl>0);
  document.getElementById('gDotStore').classList.toggle('on',files.length>0);
  const badge=document.getElementById('vmfTexBadge');
  if(badge) badge.textContent=vtf;
  const sTex=document.getElementById('s-tex');
  if(sTex && typeof vmfLoaded!=='undefined' && vmfLoaded) sTex.textContent=vtf.toLocaleString(LANG);
  const sIco=document.getElementById('s-icons');
  if(sIco) sIco.textContent=EntityIcons.count.toLocaleString(LANG);
}

let _lastStatusKey='waiting_file', _lastStatusParams=null;
function updateStatusAll(key,params){
  _lastStatusKey=key; _lastStatusParams=params||null;
  const st=document.getElementById('vmfStatusText');
  if(st) st.textContent=t(key,params);
}

const storageModal=document.getElementById('storageModal');
document.getElementById('gStore').addEventListener('click',()=>{refreshStorageModal();storageModal.classList.add('open');});
document.getElementById('stClose').addEventListener('click',()=>storageModal.classList.remove('open'));
storageModal.addEventListener('click',e=>{if(e.target===storageModal) storageModal.classList.remove('open');});

async function refreshStorageModal(){
  const info=document.getElementById('stList');
  info.textContent='';
  const files=[...Store.files.values()].sort((a,b)=>a.path.localeCompare(b.path));
  let total=0; for(const f of files) total+=f.size||0;
  document.getElementById('stCount').textContent=files.length.toLocaleString(LANG);
  document.getElementById('stSize').textContent=fmtB(total);
  try{
    if(navigator.storage && navigator.storage.estimate){
      const q=await navigator.storage.estimate();
      document.getElementById('stQuota').textContent=fmtB(q.usage||0)+' / '+fmtB(q.quota||0);
    } else document.getElementById('stQuota').textContent='—';
  }catch(e){document.getElementById('stQuota').textContent='—';}

  const frag=document.createDocumentFragment();
  for(const f of files){
    const row=document.createElement('div');
    row.className='st-row';
    const nm=document.createElement('span');nm.className='nm';nm.textContent=f.path;
    const sz=document.createElement('span');sz.className='sz';sz.textContent=fmtB(f.size||0);
    const del=document.createElement('button');del.className='del';del.textContent='×';del.title=t('del_all');
    del.addEventListener('click',async()=>{
      await Store.delete(f.path);
      await TexStore.rebuild();
      refreshGlobalStats();
      refreshStorageModal();
    });
    row.append(nm,sz,del);
    frag.appendChild(row);
  }
  info.appendChild(frag);
}
document.getElementById('stClearVtf').addEventListener('click',async()=>{
  if(!confirm(t('confirm_del_vtf'))) return;
  const keys=Store.listByExt('vtf').map(f=>f.path);
  await Store.deleteMany(keys);
  await TexStore.rebuild();
  refreshGlobalStats();
  refreshStorageModal();
  if(typeof vmfLoaded!=='undefined' && vmfLoaded && typeof currentMapText!=='undefined' && currentMapText){
    loadVMFText(currentMapText,currentMapName);
  }
});
document.getElementById('stClearAll').addEventListener('click',async()=>{
  if(!confirm(t('confirm_del_all'))) return;
  await Store.clearAll();
  await TexStore.rebuild();
  refreshGlobalStats();
  refreshStorageModal();
});
document.getElementById('stApply').addEventListener('click',()=>{
  storageModal.classList.remove('open');
});

/* ================================================================
   LANGUAGE SELECTOR
   ================================================================ */
const langSel=document.getElementById('langSel');
for(const code in I18N){
  const o=document.createElement('option');
  o.value=code;
  o.textContent=I18N[code].lang_name;
  langSel.appendChild(o);
}
langSel.value=LANG;
langSel.addEventListener('change',()=>setLang(langSel.value));

function setLang(code){
  if(!I18N[code]) code='en';
  LANG=code;
  try{ localStorage.setItem(LANG_KEY,code); }catch(_){}
  document.documentElement.lang=code;
  langSel.value=code;
  applyI18n();
}

function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.dataset.i18n;
    const s=t(k);
    if(s!=null) el.textContent=s;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{
    const k=el.dataset.i18nHtml;
    const s=t(k);
    if(s!=null) el.innerHTML=s;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    el.title=t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    el.placeholder=t(el.dataset.i18nPlaceholder);
  });
  const st=document.getElementById('vmfStatusText');
  if(st) st.textContent=t(_lastStatusKey,_lastStatusParams);
  if(typeof _lastModelStats!=='undefined' && _lastModelStats) renderModelStats(_lastModelStats);
  if(typeof tItems!=='undefined' && tItems.length){
    try{ tRender(); tPreview(); }catch(_){}
  }
}

/* ================================================================
   VMF VIEWER
   ================================================================ */
const vmfCanvas=document.getElementById('vmfCanvas');
const vmfRenderer=new THREE.WebGLRenderer({canvas:vmfCanvas,antialias:true,preserveDrawingBuffer:true});
vmfRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
vmfRenderer.outputColorSpace=THREE.SRGBColorSpace;

const vmfScene=new THREE.Scene();
vmfScene.background=new THREE.Color(0x0e1116);
const vmfCamera=new THREE.PerspectiveCamera(70,1,1,500000);
vmfCamera.position.set(600,600,600);
const vmfControls=new OrbitControls(vmfCamera,vmfRenderer.domElement);
vmfControls.enableDamping=true;vmfControls.dampingFactor=0.075;
vmfControls.screenSpacePanning=true;vmfControls.maxDistance=200000;vmfControls.minDistance=5;

vmfScene.add(new THREE.HemisphereLight(0xcfe0ff,0x30323a,1.15));
const vmfSunA=new THREE.DirectionalLight(0xffffff,1.15);vmfSunA.position.set(1,2,0.7);vmfScene.add(vmfSunA);
const vmfSunB=new THREE.DirectionalLight(0xffffff,0.45);vmfSunB.position.set(-1.2,1.1,-0.9);vmfScene.add(vmfSunB);

const vmfGrid=new THREE.GridHelper(4096,64,0x2a3340,0x1a2029);
vmfGrid.material.transparent=true;vmfGrid.material.opacity=0.35;vmfGrid.position.y=-0.5;
vmfScene.add(vmfGrid);

function vmfResize(){
  const w=vmfCanvas.clientWidth||panes.vmf.clientWidth;
  const h=vmfCanvas.clientHeight||panes.vmf.clientHeight;
  if(!w||!h) return;
  vmfRenderer.setSize(w,h,false);
  vmfCamera.aspect=w/h;vmfCamera.updateProjectionMatrix();
}
new ResizeObserver(vmfResize).observe(panes.vmf);

(function vmfAnimate(){
  requestAnimationFrame(vmfAnimate);
  if(activeTab!=='vmf') return;
  vmfControls.update();
  vmfRenderer.render(vmfScene,vmfCamera);
})();

const VMF_MATS={
  concrete:new THREE.MeshStandardMaterial({name:'concrete',color:0x9b9b95,roughness:0.96,metalness:0,side:THREE.DoubleSide}),
  metal:new THREE.MeshStandardMaterial({name:'metal',color:0x8d939c,roughness:0.55,metalness:0.35,side:THREE.DoubleSide}),
  tile:new THREE.MeshStandardMaterial({name:'tile',color:0xdcdcdc,roughness:0.55,metalness:0,side:THREE.DoubleSide}),
  glass:new THREE.MeshStandardMaterial({name:'glass',color:0x9fd8e8,roughness:0.08,metalness:0,transparent:true,opacity:0.30,side:THREE.DoubleSide,depthWrite:false}),
  sign:new THREE.MeshStandardMaterial({name:'sign',color:0xd88a2a,roughness:0.7,metalness:0,side:THREE.DoubleSide}),
  light:new THREE.MeshStandardMaterial({name:'light',color:0xffffff,emissive:0xfff2cc,emissiveIntensity:1,roughness:1,side:THREE.DoubleSide}),
  sky:new THREE.MeshStandardMaterial({name:'sky',color:0x7ea6d0,roughness:1,metalness:0,side:THREE.BackSide}),
  other:new THREE.MeshStandardMaterial({name:'other',color:0xb0a89c,roughness:0.85,metalness:0,side:THREE.DoubleSide})
};

function vmfSetStatus(keyOrText,params,busy=false){
  _lastStatusKey=keyOrText; _lastStatusParams=params||null;
  const st=document.getElementById('vmfStatus');
  const tx=document.getElementById('vmfStatusText');
  tx.textContent = (I18N[LANG] && I18N[LANG][keyOrText]!=null) ? t(keyOrText,params) : keyOrText;
  st.classList.toggle('busy',busy);
  st.classList.remove('hide');
  if(!busy){
    clearTimeout(vmfSetStatus._t);
    vmfSetStatus._t=setTimeout(()=>st.classList.add('hide'),4000);
  }
}
function vmfSetProgress(v){document.getElementById('vmfProgress').style.width=(v*100)+'%';}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));

function disposeGroup(g){
  if(!g) return;
  g.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    if(o.isSprite && o.material) o.material.dispose();
  });
  vmfScene.remove(g);
}

/* VMF parsing */
function tokenize(src){
  const tokens=[];const n=src.length;let i=0;
  while(i<n){
    const ch=src[i];
    if(ch===' '||ch==='\t'||ch==='\n'||ch==='\r'){i++;continue;}
    if(ch==='/'&&src[i+1]==='/'){while(i<n&&src[i]!=='\n')i++;continue;}
    if(ch==='/'&&src[i+1]==='*'){i+=2;while(i<n&&!(src[i]==='*'&&src[i+1]==='/'))i++;i+=2;continue;}
    if(ch==='{'||ch==='}'){tokens.push(ch);i++;continue;}
    if(ch==='"'){let j=i+1,s='';while(j<n&&src[j]!=='"'){s+=src[j];j++;}tokens.push(s);i=j+1;continue;}
    let j=i;while(j<n&&' \t\n\r{}"'.indexOf(src[j])===-1)j++;
    tokens.push(src.slice(i,j));i=j;
  }
  return tokens;
}
function parseBlock(tokens,i,name){
  const node={name:name||'',props:{},children:[],nextIndex:i+1};
  i++;
  while(i<tokens.length&&tokens[i]!=='}'){
    const tok=tokens[i];
    if(tokens[i+1]==='{'){const child=parseBlock(tokens,i+1,tok);node.children.push(child);i=child.nextIndex;}
    else{const key=tok;const val=tokens[i+1]!==undefined?tokens[i+1]:'';node.props[key.toLowerCase()]=val;i+=2;}
  }
  i++;node.nextIndex=i;return node;
}
function parseVMF(tokens){
  const blocks=[];let i=0;
  while(i<tokens.length){
    const name=tokens[i];
    if(tokens[i+1]==='{'){const b=parseBlock(tokens,i+1,name);blocks.push(b);i=b.nextIndex;}
    else i++;
  }
  return blocks;
}
const VMF_NUM_RE=/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
function parsePlaneStr(str){
  if(!str) return null;
  const m=String(str).match(VMF_NUM_RE);
  if(!m||m.length<9) return null;
  return [[+m[0],+m[1],+m[2]],[+m[3],+m[4],+m[5]],[+m[6],+m[7],+m[8]]];
}
function planeFromPts(p1,p2,p3){
  const ux=p1[0]-p2[0],uy=p1[1]-p2[1],uz=p1[2]-p2[2];
  const vx=p3[0]-p2[0],vy=p3[1]-p2[1],vz=p3[2]-p2[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const len=Math.hypot(nx,ny,nz);
  if(len<1e-9) return null;
  nx/=len;ny/=len;nz/=len;
  const d=nx*p1[0]+ny*p1[1]+nz*p1[2];
  return {nx,ny,nz,d};
}
function intersect3(a,b,c){
  const cx=b.ny*c.nz-b.nz*c.ny,cy=b.nz*c.nx-b.nx*c.nz,cz=b.nx*c.ny-b.ny*c.nx;
  const det=a.nx*cx+a.ny*cy+a.nz*cz;
  if(Math.abs(det)<1e-9) return null;
  const dx=c.ny*a.nz-c.nz*a.ny,dy=c.nz*a.nx-c.nx*a.nz,dz=c.nx*a.ny-c.ny*a.nx;
  const ex=a.ny*b.nz-a.nz*b.ny,ey=a.nz*b.nx-a.nx*b.nz,ez=a.nx*b.ny-a.ny*b.nx;
  return [(a.d*cx+b.d*dx+c.d*ex)/det,(a.d*cy+b.d*dy+c.d*ey)/det,(a.d*cz+b.d*dz+c.d*ez)/det];
}
function parseAxis(str){
  if(!str) return null;
  const m=String(str).match(VMF_NUM_RE);
  if(!m||m.length<5) return null;
  return {x:+m[0],y:+m[1],z:+m[2],scale:+m[3]||1,shift:+m[4]};
}
const VMF_EPS=0.09,VMF_DEDUP=0.05;
function buildSolidFaces(sides,flip=false){
  const P=sides.length;if(P<4) return null;
  const sign=flip?-1:1;
  const nx=new Float64Array(P),ny=new Float64Array(P),nz=new Float64Array(P),dd=new Float64Array(P);
  for(let i=0;i<P;i++){const pl=sides[i].plane;nx[i]=pl.nx*sign;ny[i]=pl.ny*sign;nz[i]=pl.nz*sign;dd[i]=pl.d*sign;}
  const pts=[];
  for(let i=0;i<P-2;i++)for(let j=i+1;j<P-1;j++)for(let k=j+1;k<P;k++){
    const p=intersect3(sides[i].plane,sides[j].plane,sides[k].plane);
    if(!p) continue;
    let ok=true;
    for(let m=0;m<P;m++) if(nx[m]*p[0]+ny[m]*p[1]+nz[m]*p[2]-dd[m]>VMF_EPS){ok=false;break;}
    if(!ok) continue;
    let dup=false;
    for(let q=0;q<pts.length;q++){const o=pts[q];
      if(Math.abs(o[0]-p[0])<VMF_DEDUP&&Math.abs(o[1]-p[1])<VMF_DEDUP&&Math.abs(o[2]-p[2])<VMF_DEDUP){dup=true;break;}}
    if(!dup) pts.push(p);
  }
  if(pts.length<4) return null;
  const faces=[];
  for(let i=0;i<P;i++){
    const pl=sides[i].plane;
    const fnx=pl.nx*sign,fny=pl.ny*sign,fnz=pl.nz*sign,fd=pl.d*sign;
    const on=[];
    for(const p of pts) if(Math.abs(fnx*p[0]+fny*p[1]+fnz*p[2]-fd)<VMF_EPS) on.push(p);
    if(on.length<3) continue;
    let cx=0,cy=0,cz=0;for(const p of on){cx+=p[0];cy+=p[1];cz+=p[2];}
    cx/=on.length;cy/=on.length;cz/=on.length;
    let ux,uy,uz;
    if(Math.abs(fnz)<0.9){ux=-fny;uy=fnx;uz=0;} else {ux=0;uy=-fnz;uz=fny;}
    const ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;
    const vx=fny*uz-fnz*uy,vy=fnz*ux-fnx*uz,vz=fnx*uy-fny*ux;
    on.sort((a,b)=>{
      const aa=Math.atan2((a[0]-cx)*vx+(a[1]-cy)*vy+(a[2]-cz)*vz,(a[0]-cx)*ux+(a[1]-cy)*uy+(a[2]-cz)*uz);
      const bb=Math.atan2((b[0]-cx)*vx+(b[1]-cy)*vy+(b[2]-cz)*vz,(b[0]-cx)*ux+(b[1]-cy)*uy+(b[2]-cz)*uz);
      return aa-bb;
    });
    faces.push({plane:{nx:fnx,ny:fny,nz:fnz,d:fd},poly:on,material:sides[i].material,uaxis:sides[i].uaxis,vaxis:sides[i].vaxis});
  }
  return {faces,pts};
}
function materialCategory(mat){
  const m=(mat||'').toLowerCase();
  if(m.includes('nodraw')) return 'skip';
  if(m.includes('toolstrigger')||m.includes('toolsinvisible')||m.includes('toolsskip')||
     m.includes('toolshint')||m.includes('toolsplayerclip')||m.includes('toolsblocklight')||
     m.includes('toolsorigin')||m.includes('toolsareaportal')) return 'skip';
  if(m.includes('toolsskybox')) return 'sky';
  if(m.startsWith('glass')) return 'glass';
  if(m.includes('lights/')||m.includes('/light')) return 'light';
  if(m.includes('signage')||m.includes('hazard')) return 'sign';
  if(m.includes('metal')) return 'metal';
  if(m.includes('tile')||m.includes('observation_tile')) return 'tile';
  if(m.includes('concrete')) return 'concrete';
  return 'other';
}
function collectSolid(node){
  const sides=[];
  for(const ch of node.children){
    if(ch.name!=='side') continue;
    const pts=parsePlaneStr(ch.props.plane);
    if(!pts) continue;
    const pl=planeFromPts(pts[0],pts[1],pts[2]);
    if(!pl) continue;
    sides.push({plane:pl,material:ch.props.material||'',uaxis:parseAxis(ch.props.uaxis),vaxis:parseAxis(ch.props.vaxis)});
  }
  return sides;
}

let vmfGroup=null,vmfTrigGroup=null,vmfEntGroup=null;
let currentMapName='map';
let currentMapText=null;
let vmfLoaded=false;
let vmfWireframe=false;

const vmfUI={
  dropzone:document.getElementById('vmfDropzone'),
  btnShot:document.getElementById('vmfBtnShot'),
  btnFit:document.getElementById('vmfBtnFit'),
  btnWire:document.getElementById('vmfBtnWire'),
  btnPanel:document.getElementById('vmfBtnPanel'),
  btnGLB:document.getElementById('vmfBtnGLB'),
  panel:document.getElementById('vmfPanel'),
  optTriggers:document.getElementById('optTriggers'),
  optEntities:document.getElementById('optEntities'),
  optEntIcons:document.getElementById('optEntIcons'),
  optEntIconsTop:document.getElementById('optEntIconsTop'),
  iconSize:document.getElementById('vmfIconSize'),
  optGlass:document.getElementById('optGlass'),
  optTex:document.getElementById('optTex')
};

const MAT_U_DEFAULT={x:1,y:0,z:0,scale:1,shift:0};
const MAT_V_DEFAULT={x:0,y:1,z:0,scale:1,shift:0};

async function loadVMFText(text,name){
  disposeGroup(vmfGroup);disposeGroup(vmfTrigGroup);disposeGroup(vmfEntGroup);
  vmfGroup=vmfTrigGroup=vmfEntGroup=null;
  currentMapName=(name||'map').replace(/\.(vmf|txt|vmx|map)$/i,'');
  currentMapText=text;
  vmfUI.dropzone.classList.add('hidden');
  vmfSetStatus('parsing',null,true);
  vmfSetProgress(0.02);
  await nextFrame();

  const tokens=tokenize(text);
  const tree=parseVMF(tokens);
  vmfSetProgress(0.08);await nextFrame();

  const solids=[],entities=[];
  for(const node of tree){
    if(node.name==='world'){
      for(const ch of node.children) if(ch.name==='solid') solids.push(collectSolid(ch));
    } else if(node.name==='entity'){
      const cls=(node.props.classname||'').toLowerCase();
      entities.push({classname:cls,origin:node.props.origin||null,targetname:node.props.targetname||''});
      for(const ch of node.children) if(ch.name==='solid') solids.push(collectSolid(ch));
    }
  }
  vmfSetStatus('found_brushes',{n:solids.length},true);
  vmfSetProgress(0.12);await nextFrame();

  const buckets=new Map();
  const trigPositions=[];
  let faceCount=0,triCount=0;

  const getBucket=(key,cat,matKey)=>{
    let b=buckets.get(key);
    if(!b){b={pos:[],nrm:[],uv:[],cat,matKey,texData:null};buckets.set(key,b);}
    return b;
  };
  const texPromises=[];

  for(let si=0;si<solids.length;si++){
    const sides=solids[si];
    let res=buildSolidFaces(sides);
    if(!res) res=buildSolidFaces(sides,true);
    if(!res) continue;
    let hasVisible=false,hasTool=false;
    for(const f of res.faces){
      const cat=materialCategory(f.material);
      if(cat==='skip'){hasTool=true;continue;}
      hasVisible=true;
      const mKey=normMat(f.material);
      const fileRec=TexStore.findByMat(f.material);
      const useTex=fileRec && vmfUI.optTex.checked;
      let bucket;
      if(useTex){bucket=getBucket('tex:'+mKey,cat,mKey);}
      else{bucket=getBucket('cat:'+cat,cat,null);}
      if(useTex && !bucket.texData && !bucket.texPromise){
        bucket.texPromise=true;
        texPromises.push(TexStore.makeTexture(fileRec,512).then(td=>{
          if(td){bucket.texData=td;}
        }));
      }
      const ua=f.uaxis||MAT_U_DEFAULT;
      const va=f.vaxis||MAT_V_DEFAULT;
      const tw=(bucket.texData&&bucket.texData.width)||1;
      const th=(bucket.texData&&bucket.texData.height)||1;
      const n=f.plane,poly=f.poly;
      faceCount++;
      const uScale=ua.scale||1,vScale=va.scale||1;
      for(let t=1;t<poly.length-1;t++){
        const tri=[poly[0],poly[t],poly[t+1]];
        for(const A of tri){
          bucket.pos.push(A[0],A[1],A[2]);
          bucket.nrm.push(n.nx,n.ny,n.nz);
          if(useTex){
            const u=(A[0]*ua.x+A[1]*ua.y+A[2]*ua.z)/uScale+ua.shift;
            const v=(A[0]*va.x+A[1]*va.y+A[2]*va.z)/vScale+va.shift;
            bucket.uv.push(u/tw,v/th);
          }
        }
        triCount++;
      }
    }
    if(!hasVisible && hasTool){
      let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
      for(const p of res.pts){
        if(p[0]<mnx)mnx=p[0];if(p[0]>mxx)mxx=p[0];
        if(p[1]<mny)mny=p[1];if(p[1]>mxy)mxy=p[1];
        if(p[2]<mnz)mnz=p[2];if(p[2]>mxz)mxz=p[2];
      }
      const c=[[mnx,mny,mnz],[mxx,mny,mnz],[mxx,mxy,mnz],[mnx,mxy,mnz],
               [mnx,mny,mxz],[mxx,mny,mxz],[mxx,mxy,mxz],[mnx,mxy,mxz]];
      const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      for(const [a,b] of edges) trigPositions.push(c[a][0],c[a][1],c[a][2],c[b][0],c[b][1],c[b][2]);
    }
    if(si%200===0){
      vmfSetProgress(0.12+0.78*(si/solids.length));
      vmfSetStatus('processing',{n:si,m:solids.length},true);
      await nextFrame();
    }
  }
  if(texPromises.length) await Promise.all(texPromises);

  vmfSetStatus('building_meshes',null,true);
  vmfSetProgress(0.93);await nextFrame();

  vmfGroup=new THREE.Group();
  vmfGroup.name='map';
  vmfGroup.rotation.x=-Math.PI/2;

  for(const [key,b] of buckets){
    if(b.pos.length===0) continue;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(b.pos,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(b.nrm,3));
    if(b.uv.length) g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));
    let mat;
    if(b.texData){
      mat=new THREE.MeshStandardMaterial({
        map:b.texData.texture,roughness:0.9,metalness:0,side:THREE.DoubleSide,
        transparent:b.texData.hasAlpha,alphaTest:b.texData.hasAlpha?0.35:0
      });
      mat.name=b.matKey||'tex_mat';
    } else mat=VMF_MATS[b.cat]||VMF_MATS.other;
    const mesh=new THREE.Mesh(g,mat);
    mesh.name=key;
    if(vmfWireframe && mat.map) mat.wireframe=true;
    vmfGroup.add(mesh);
  }
  vmfScene.add(vmfGroup);

  vmfTrigGroup=new THREE.Group();vmfTrigGroup.name='triggers';vmfTrigGroup.rotation.x=-Math.PI/2;
  if(trigPositions.length){
    const tg=new THREE.BufferGeometry();
    tg.setAttribute('position',new THREE.Float32BufferAttribute(trigPositions,3));
    vmfTrigGroup.add(new THREE.LineSegments(tg,new THREE.LineBasicMaterial({color:0xff8a3d,transparent:true,opacity:0.65})));
  }
  vmfTrigGroup.visible=vmfUI.optTriggers.checked;
  vmfScene.add(vmfTrigGroup);

  /* --- Сущности: спрайты-иконки + запасные точки --- */
  vmfEntGroup=new THREE.Group();
  vmfEntGroup.name='entities';
  vmfEntGroup.rotation.x=-Math.PI/2;
  vmfEntGroup.visible=vmfUI.optEntities.checked;
  {
    const pos=[],col=[];
    const C_LIGHT=new THREE.Color(0xffe066),C_PROP=new THREE.Color(0x62b6ff);
    const C_NPC=new THREE.Color(0x6ee7a0),C_OTHER=new THREE.Color(0xd98cff);
    const showIcons = vmfUI.optEntIcons ? vmfUI.optEntIcons.checked : true;
    const onTop     = vmfUI.optEntIconsTop ? vmfUI.optEntIconsTop.checked : true;
    const iconSize  = vmfUI.iconSize ? (+vmfUI.iconSize.value || 96) : 96;

    for(const e of entities){
      if(!e.origin) continue;
      const nums=String(e.origin).match(VMF_NUM_RE);
      if(!nums||nums.length<3) continue;
      const x=+nums[0], y=+nums[1], z=+nums[2];

      let c=C_OTHER;
      if(e.classname.startsWith('light')) c=C_LIGHT;
      else if(e.classname.startsWith('prop_')) c=C_PROP;
      else if(e.classname.startsWith('npc_')) c=C_NPC;

      const tex = showIcons ? EntityIcons.get(e.classname) : null;
      if (tex){
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: !onTop,
          depthWrite: false,
          sizeAttenuation: true,
          toneMapped: false
        });
        const spr = new THREE.Sprite(mat);
        spr.position.set(x, y, z);
        spr.scale.set(iconSize, iconSize, 1);
        spr.renderOrder = onTop ? 999 : 1;
        spr.userData.classname = e.classname;
        vmfEntGroup.add(spr);
      } else {
        pos.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
    }
    if(pos.length){
      const eg=new THREE.BufferGeometry();
      eg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      eg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
      vmfEntGroup.add(new THREE.Points(eg,new THREE.PointsMaterial({
        size:14,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:0.95,depthWrite:false
      })));
    }
  }
  vmfScene.add(vmfEntGroup);

  const box=new THREE.Box3().setFromObject(vmfGroup);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());

  document.getElementById('s-solids').textContent=solids.length.toLocaleString(LANG);
  document.getElementById('s-faces').textContent=faceCount.toLocaleString(LANG);
  document.getElementById('s-tris').textContent=triCount.toLocaleString(LANG);
  document.getElementById('s-ents').textContent=entities.length.toLocaleString(LANG);
  document.getElementById('s-mats').textContent=[...buckets.keys()].length.toLocaleString(LANG);
  document.getElementById('s-tex').textContent=Store.listByExt('vtf').length.toLocaleString(LANG);
  const sIco=document.getElementById('s-icons');
  if(sIco) sIco.textContent=EntityIcons.count.toLocaleString(LANG);
  document.getElementById('s-size').textContent=isFinite(size.x)
    ?`${Math.round(size.x)}×${Math.round(size.y)}×${Math.round(size.z)}`:'—';

  vmfFitCamera(box,center,size);
  vmfUI.btnShot.disabled=false;
  vmfUI.btnFit.disabled=false;
  vmfUI.btnWire.disabled=false;
  vmfUI.btnPanel.disabled=false;
  vmfUI.btnGLB.disabled=false;
  vmfSetProgress(1);setTimeout(()=>vmfSetProgress(0),500);
  vmfLoaded=true;
  vmfSetStatus('done_brushes',{n:solids.length,m:triCount.toLocaleString(LANG)},false);
}
function vmfFitCamera(box,center,size){
  if(!isFinite(size.x)||size.length()===0){
    vmfCamera.position.set(600,600,600);vmfControls.target.set(0,0,0);vmfControls.update();return;
  }
  const radius=Math.max(size.length()*0.5,64);
  vmfControls.target.copy(center);
  vmfCamera.position.copy(center).add(new THREE.Vector3(radius*0.85,radius*0.75,radius*0.85));
  vmfCamera.near=Math.max(1,radius/2000);
  vmfCamera.far=radius*30+20000;
  vmfCamera.updateProjectionMatrix();vmfControls.update();
  vmfGrid.position.y=box.min.y-1;
  const gs=Math.max(1024,Math.ceil(radius*2/512)*512);
  vmfGrid.scale.setScalar(gs/4096);
}

function vmfReadFile(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async ()=>{
    try{
      await addFilesToStore([{path:file.name,file}],{silent:true});
      await loadVMFText(reader.result,file.name);
    }catch(err){console.error(err);vmfSetStatus('error',{msg:err.message},false);}
  };
  reader.onerror=()=>vmfSetStatus('read_fail',null,false);
  vmfSetStatus('reading',null,true);
  reader.readAsText(file,'utf-8');
}

document.getElementById('vmfBtnOpen').addEventListener('click',()=>document.getElementById('vmfFileInput').click());
document.getElementById('vmfCard').addEventListener('click',()=>document.getElementById('vmfFileInput').click());
document.getElementById('vmfFileInput').addEventListener('change',e=>{
  if(e.target.files&&e.target.files[0]) vmfReadFile(e.target.files[0]);
  e.target.value='';
});
document.getElementById('vmfBtnTex').addEventListener('click',()=>document.getElementById('vmfTexInput').click());
document.getElementById('vmfTexInput').addEventListener('change',async e=>{
  if(e.target.files.length){
    const list=[...e.target.files].map(f=>({path:f.webkitRelativePath||f.name,file:f}));
    const {storeFiles, iconFiles} = categorizeDroppedFiles(list);
    for (const {file} of iconFiles) await EntityIcons.addFromFile(file, file.name);
    if (storeFiles.length){
      await addFilesToStore(storeFiles);
      await TexStore.rebuild();
    }
    refreshGlobalStats();
    if(currentMapText) await loadVMFText(currentMapText,currentMapName);
  }
  e.target.value='';
});

['dragenter','dragover'].forEach(ev=>panes.vmf.addEventListener(ev,e=>{
  e.preventDefault();vmfUI.dropzone.classList.remove('hidden');vmfUI.dropzone.classList.add('dragover');
}));
['dragleave','drop'].forEach(ev=>panes.vmf.addEventListener(ev,e=>{
  e.preventDefault();
  if(ev==='dragleave'&&e.relatedTarget&&panes.vmf.contains(e.relatedTarget)) return;
  vmfUI.dropzone.classList.remove('dragover');
}));

panes.vmf.addEventListener('drop',async e=>{
  e.preventDefault();
  const dt=e.dataTransfer;
  const first=dt.files&&dt.files[0];
  if(first && /\.(vmf|txt|vmx|map)$/i.test(first.name)){
    vmfReadFile(first);return;
  }
  try{
    const list=await walkDrop(dt);
    const {storeFiles, iconFiles} = categorizeDroppedFiles(list);

    // Иконки — только в память (RAM), никогда в IndexedDB
    if (iconFiles.length){
      for (const {file} of iconFiles) await EntityIcons.addFromFile(file, file.name);
    }

    const hasVmf = storeFiles.some(x=>/\.(vmf|txt|vmx|map)$/i.test(x.file.name));
    const hasVtf = storeFiles.some(x=>/\.vtf$/i.test(x.file.name));

    if (storeFiles.length){
      await addFilesToStore(storeFiles);
      await TexStore.rebuild();
    }

    if(hasVmf){
      const target=storeFiles.find(x=>/\.(vmf|txt|vmx|map)$/i.test(x.file.name));
      const text=await target.file.text();
      await loadVMFText(text,target.file.name);
    } else if(hasVtf && currentMapText){
      await loadVMFText(currentMapText,currentMapName);
    } else if(hasVtf){
      vmfSetStatus('tex_added',null,false);
    } else if (iconFiles.length && currentMapText){
      await loadVMFText(currentMapText,currentMapName);
      vmfSetStatus(t('icons_loaded',{n:EntityIcons.count}), null, false);
    }
  }catch(err){console.error(err);vmfSetStatus('error',{msg:err.message},false);}
});

vmfUI.optTriggers.addEventListener('change',()=>{if(vmfTrigGroup) vmfTrigGroup.visible=vmfUI.optTriggers.checked;});
vmfUI.optEntities.addEventListener('change',()=>{if(vmfEntGroup) vmfEntGroup.visible=vmfUI.optEntities.checked;});
vmfUI.optGlass.addEventListener('change',()=>{
  VMF_MATS.glass.opacity=vmfUI.optGlass.checked?0.30:1.0;
  VMF_MATS.glass.transparent=vmfUI.optGlass.checked;
  VMF_MATS.glass.needsUpdate=true;
});
vmfUI.optTex.addEventListener('change',async()=>{if(currentMapText) await loadVMFText(currentMapText,currentMapName);});

if(vmfUI.optEntIcons){
  vmfUI.optEntIcons.addEventListener('change',()=>{
    if(!vmfEntGroup) return;
    const show=vmfUI.optEntIcons.checked;
    vmfEntGroup.traverse(o=>{ if(o.isSprite) o.visible=show; });
  });
}
if(vmfUI.optEntIconsTop){
  vmfUI.optEntIconsTop.addEventListener('change',()=>{
    if(!vmfEntGroup) return;
    const onTop=vmfUI.optEntIconsTop.checked;
    vmfEntGroup.traverse(o=>{
      if(o.isSprite && o.material){
        o.material.depthTest = !onTop;
        o.material.needsUpdate = true;
        o.renderOrder = onTop ? 999 : 1;
      }
    });
  });
}
if(vmfUI.iconSize){
  vmfUI.iconSize.addEventListener('change',()=>{
    if(!vmfEntGroup) return;
    const s=+vmfUI.iconSize.value || 96;
    vmfEntGroup.traverse(o=>{ if(o.isSprite) o.scale.set(s,s,1); });
  });
}

document.getElementById('vmfBtnFit').addEventListener('click',()=>{
  if(!vmfGroup) return;
  const box=new THREE.Box3().setFromObject(vmfGroup);
  vmfFitCamera(box,box.getCenter(new THREE.Vector3()),box.getSize(new THREE.Vector3()));
});
document.getElementById('vmfBtnWire').addEventListener('click',e=>{
  vmfWireframe=!vmfWireframe;
  e.currentTarget.classList.toggle('active',vmfWireframe);
  for(const k in VMF_MATS) VMF_MATS[k].wireframe=vmfWireframe;
  if(vmfGroup) vmfGroup.traverse(o=>{if(o.isMesh&&o.material&&o.material.map) o.material.wireframe=vmfWireframe;});
});
document.getElementById('vmfBtnPanel').addEventListener('click',()=>{
  vmfUI.panel.classList.toggle('open');
  document.getElementById('vmfBtnPanel').classList.toggle('active',vmfUI.panel.classList.contains('open'));
});
document.getElementById('vmfBtnShot').addEventListener('click',async()=>{
  if(!vmfGroup) return;
  const btn=document.getElementById('vmfBtnShot');btn.disabled=true;
  const prevPanelOpen=vmfUI.panel.classList.contains('open');
  if(document.getElementById('optUI').checked){
    vmfUI.panel.classList.remove('open');
    document.getElementById('vmfBtnPanel').classList.remove('active');
    document.getElementById('vmfStatus').classList.add('hide');
    document.getElementById('vmfHint').classList.add('hide');
    await nextFrame();await nextFrame();
  }
  const oldPR=vmfRenderer.getPixelRatio();
  if(document.getElementById('optHD').checked){
    vmfRenderer.setPixelRatio(oldPR*2);
    vmfRenderer.setSize(panes.vmf.clientWidth,panes.vmf.clientHeight,false);
    vmfCamera.aspect=panes.vmf.clientWidth/panes.vmf.clientHeight;
    vmfCamera.updateProjectionMatrix();
    await nextFrame();await nextFrame();
  }
  vmfRenderer.render(vmfScene,vmfCamera);
  const url=vmfRenderer.domElement.toDataURL('image/png');
  if(document.getElementById('optHD').checked){
    vmfRenderer.setPixelRatio(oldPR);
    vmfRenderer.setSize(panes.vmf.clientWidth,panes.vmf.clientHeight,false);
    vmfCamera.aspect=panes.vmf.clientWidth/panes.vmf.clientHeight;
    vmfCamera.updateProjectionMatrix();
  }
  if(document.getElementById('optUI').checked && prevPanelOpen){
    vmfUI.panel.classList.add('open');
    document.getElementById('vmfBtnPanel').classList.add('active');
  }
  const fl=document.getElementById('vmfFlash');
  fl.classList.add('on');requestAnimationFrame(()=>fl.classList.remove('on'));
  const ts=new Date(),pad=n=>String(n).padStart(2,'0');
  const stamp=`${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const suffix=document.getElementById('optHD').checked?'_HD':'';
  const fname=`${currentMapName}_${stamp}${suffix}.png`;
  const a=document.createElement('a');a.href=url;a.download=fname;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  btn.disabled=false;
  vmfSetStatus('shot_saved',{name:fname},false);
});
document.getElementById('vmfBtnGLB').addEventListener('click',async()=>{
  if(!vmfGroup) return;
  const btn=document.getElementById('vmfBtnGLB');btn.disabled=true;
  vmfSetStatus('prep_glb',null,true);
  vmfSetProgress(0.05);await nextFrame();
  const root=new THREE.Group();root.name=currentMapName||'map';
  root.add(vmfGroup.clone(true));
  if(document.getElementById('optGLBEnts').checked && vmfEntGroup) root.add(vmfEntGroup.clone(true));
  if(document.getElementById('optGLBTriggers').checked && vmfTrigGroup) root.add(vmfTrigGroup.clone(true));
  root.traverse(o=>{if(o.isMesh&&o.material){if(o.material.wireframe) o.material.wireframe=false;}});
  const maxTex=parseInt(document.getElementById('glbTexSize').value,10)||2048;
  const exporter=new GLTFExporter();
  await new Promise(resolve=>{
    exporter.parse(root,(result)=>{
      try{
        const blob=new Blob([result],{type:'model/gltf-binary'});
        const url=URL.createObjectURL(blob);
        const fname=(currentMapName||'map')+'.glb';
        const a=document.createElement('a');a.href=url;a.download=fname;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        vmfSetStatus('glb_saved',{name:fname,size:(blob.size/1024/1024).toFixed(1)},false);
      }catch(e){vmfSetStatus('error',{msg:e.message},false);}
      finally{btn.disabled=false;resolve();}
    },(e)=>{vmfSetStatus('error',{msg:(e.message||e)},false);btn.disabled=false;resolve();},
    {binary:true,embedImages:true,onlyVisible:false,maxTextureSize:maxTex});
  });
});

setTimeout(()=>document.getElementById('vmfHint').classList.add('hide'),6000);

/* ================================================================
   MODEL VIEWER
   ================================================================ */
const sI32=(dv,o)=>(o>=0&&o+4<=dv.byteLength)?dv.getInt32(o,true):0;
const sI16=(dv,o)=>(o>=0&&o+2<=dv.byteLength)?dv.getInt16(o,true):0;
const sU16=(dv,o)=>(o>=0&&o+2<=dv.byteLength)?dv.getUint16(o,true):0;
const sU8 =(dv,o)=>(o>=0&&o<dv.byteLength)?dv.getUint8(o):0;
const sR32=(dv,o)=>(o>=0&&o+4<=dv.byteLength)?dv.getFloat32(o,true):0;
function cstr(dv,off){if(off<0||off>=dv.byteLength) return '';let s='',c;for(let i=off;i<dv.byteLength;i++){c=dv.getUint8(i);if(!c)break;s+=String.fromCharCode(c);}return s;}

const IDST=0x54534449,MESH_SIZE=88,MODEL_SIZE=144,TEXTURE_SIZE=64,BODYPART_SIZE=16,BONE_SIZE=216;
function parseMDL(buffer){
  const dv=new DataView(buffer);
  if(sI32(dv,0)!==IDST) throw new Error('not IDST');
  const mdl={version:sI32(dv,4),checksum:sI32(dv,8),name:cstr(dv,12),textures:[],skin:[],bodyparts:[],bones:[]};
  const numTex=sI32(dv,0xCC),texIdx=sI32(dv,0xD0);
  const numSkin=sI32(dv,0xDC),skinIdx=sI32(dv,0xE4);
  const numBP=sI32(dv,0xE8),bpIdx=sI32(dv,0xEC);
  if(numBP<0||numBP>512) throw new Error('numBodyParts='+numBP);
  for(let i=0;i<numTex;i++){const t=texIdx+i*TEXTURE_SIZE;mdl.textures.push(cstr(dv,t+sI32(dv,t)));}
  for(let i=0;i<numSkin;i++) mdl.skin.push(sI16(dv,skinIdx+i*2));
  for(let bp=0;bp<numBP;bp++){
    const b=bpIdx+bp*BODYPART_SIZE;
    const szname=sI32(dv,b),numModels=sI32(dv,b+4),modelIdx=sI32(dv,b+12);
    if(numModels<0||numModels>512) continue;
    const bodypart={name:cstr(dv,b+szname),models:[]};
    for(let m=0;m<numModels;m++){
      const mB=b+modelIdx+m*MODEL_SIZE;
      const numMesh=sI32(dv,mB+72),meshIdx=sI32(dv,mB+76);
      if(numMesh<0||numMesh>4096) continue;
      const model={name:cstr(dv,mB),meshes:[]};
      for(let me=0;me<numMesh;me++){
        const meB=mB+meshIdx+me*MESH_SIZE;
        model.meshes.push({material:sI32(dv,meB+0),numVertices:sI32(dv,meB+8),vertexOffset:sI32(dv,meB+12)});
      }
      bodypart.models.push(model);
    }
    mdl.bodyparts.push(bodypart);
  }
  const numBones=sI32(dv,0x9C),boneIndex=sI32(dv,0xA0);
  if(numBones>0&&numBones<=512&&boneIndex>0&&boneIndex+numBones*BONE_SIZE<=dv.byteLength){
    for(let i=0;i<numBones;i++){
      const b=boneIndex+i*BONE_SIZE;
      const poseToBone=[];
      for(let k=0;k<12;k++) poseToBone.push(sR32(dv,b+96+k*4));
      mdl.bones.push({name:cstr(dv,b+sI32(dv,b+0)),parent:sI32(dv,b+4),poseToBone});
    }
  }
  return mdl;
}
const IDSV=0x56534449,VVD_VERTEX_SIZE=48;
function parseVVD(buffer){
  const dv=new DataView(buffer);
  if(sI32(dv,0)!==IDSV) throw new Error('not IDSV');
  return {version:sI32(dv,4),checksum:sI32(dv,8),numLODs:sI32(dv,12),
    numLODVertexes:Array.from({length:8},(_,i)=>sI32(dv,16+i*4)),
    vertexDataStart:sI32(dv,56),dv};
}
function vvdVertex(vvd,index){
  const p=vvd.vertexDataStart+index*VVD_VERTEX_SIZE,dv=vvd.dv;
  return {pos:[sR32(dv,p+16),sR32(dv,p+20),sR32(dv,p+24)],
    nrm:[sR32(dv,p+28),sR32(dv,p+32),sR32(dv,p+36)],
    uv:[sR32(dv,p+40),sR32(dv,p+44)]};
}
function invertRigid3x4(m){
  const a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8],j=m[9],k=m[10],l=m[11];
  return [a,e,i,-(a*d+e*h+i*l),b,f,j,-(b*d+f*h+j*l),c,g,k,-(c*d+g*h+k*l)];
}
const VPHY=0x59485056;
function parsePHY(buffer){
  const dv=new DataView(buffer);if(sI32(dv,4)!==VPHY) throw new Error('not VPHY');
  const solidCount=sI32(dv,8),solids=[];let off=16;
  for(let s=0;s<solidCount&&off+32<=dv.byteLength;s++){
    const bs=sI32(dv,off);if(bs<=32||off+bs>dv.byteLength) break;
    const be=off+bs,ss=off+32;let hulls=[];
    for(const no of [28,40,24,36]){
      const n=sI32(dv,ss+no);if(n<=0||n>4096) continue;
      const r=readLL(dv,ss,ss+no+4,n,be);if(r&&r.length){hulls=r;break;}
    }
    solids.push(hulls);off=be;
  }
  return {solidCount,solids};
}
function readLL(dv,ss,lo,n,be){
  const h=[];
  for(let i=0;i<n;i++){const o=lo+i*4;if(o+4>dv.byteLength) return null;
    const lp=ss+sI32(dv,o);if(lp<0||lp+16>be) return null;
    const pts=readLP(dv,lp,be);if(pts) h.push(pts);}
  return h.length?h:null;
}
function readLP(dv,lp,be){
  const c=sI32(dv,lp+4),po=sI32(dv,lp+8);if(c<3||c>4096) return null;
  const pp=lp+po;if(pp<0||pp+c*12>be) return null;const pts=[];
  for(let i=0;i<c;i++){
    const x=sR32(dv,pp+i*12),y=sR32(dv,pp+i*12+4),z=sR32(dv,pp+i*12+8);
    if(!isFinite(x)||!isFinite(y)||!isFinite(z)) return null;
    if(Math.abs(x)>1e6||Math.abs(y)>1e6||Math.abs(z)>1e6) return null;
    pts.push(new THREE.Vector3(x,y,z));
  }
  return pts;
}
const FALLBACK_COLORS=[0x8fa6bf,0xb08a6a,0x7f9f7f,0x9a8fb5,0xb5a08f,0x6f8fa6,0xa6908a,0x8aa6a0].map(c=>new THREE.Color(c));
let SKIN_APPLY=false,SKIN_MATRICES=[],SKIN_BONE_COUNT=0;
function resetSkinState(){SKIN_APPLY=false;SKIN_MATRICES=[];SKIN_BONE_COUNT=0;}
function getVTXStructSizes(v){const h=v>=49;
  return {mdlVersion:v,hasTopology:h,stripGroupHdrSize:h?33:25,stripHdrSize:h?35:27,
    meshHdrSize:9,lodHdrSize:12,modelHdrSize:8,bodyPartHdrSize:8,vertexSize:9};}
function skinVertex(pos,boneIds,n){
  if(!SKIN_APPLY||!SKIN_MATRICES.length||n<=0) return pos;
  const tot=SKIN_MATRICES.length,used=[];
  for(let i=0;i<Math.min(n,3);i++){const bi=boneIds[i];if(bi>=0&&bi<tot)used.push(bi);}
  if(!used.length) return pos;
  const w=1/used.length;let x=0,y=0,z=0;
  for(const bi of used){const m=SKIN_MATRICES[bi];
    x+=(m[0]*pos[0]+m[1]*pos[1]+m[2]*pos[2]+m[3])*w;
    y+=(m[4]*pos[0]+m[5]*pos[1]+m[6]*pos[2]+m[7])*w;
    z+=(m[8]*pos[0]+m[9]*pos[1]+m[10]*pos[2]+m[11])*w;}
  return [x,y,z];
}
function readVTXVert(dv,p,mvo,maxVVD){
  if(p+9>dv.byteLength) return null;
  const nBones=dv.getUint8(p+3),origId=dv.getUint16(p+4,true),vvdId=mvo+origId;
  if(vvdId<0||vvdId>=maxVVD||nBones>3) return null;
  return {vvdId,boneIds:[dv.getUint8(p+6),dv.getUint8(p+7),dv.getUint8(p+8)],nBones};
}
function buildLmap(dv,sgBase,vsz,mvo,maxVVD){
  const nV=sI32(dv,sgBase+0),vOff=sI32(dv,sgBase+4);
  if(nV<=0||nV>200000||vOff<=0) return null;
  const vb=sgBase+vOff;
  if(vb>=dv.byteLength||vb+nV*vsz>dv.byteLength) return null;
  const vvdMap=new Int32Array(nV),boneMap=new Int32Array(nV*3),nBoneArr=new Uint8Array(nV);
  for(let i=0;i<nV;i++){
    const v=readVTXVert(dv,vb+i*vsz,mvo,maxVVD);
    if(!v){vvdMap[i]=-1;continue;}
    vvdMap[i]=v.vvdId;
    boneMap[i*3]=v.boneIds[0];boneMap[i*3+1]=v.boneIds[1];boneMap[i*3+2]=v.boneIds[2];
    nBoneArr[i]=v.nBones;
  }
  return {vvdMap,boneMap,nBoneArr,numVerts:nV};
}
function parseStrips(dv,sgBase,lmap,nV,nStrips,stOff,stSz,vvd){
  if(nStrips<=0||nStrips>200000||stOff<=0) return null;
  const P=[],N=[],U=[],I=[];const vm=new Map();let ni=0,rej=0;
  const push=(li)=>{
    const vvdId=lmap.vvdMap[li];if(vvdId<0) return -1;
    if(vm.has(vvdId)) return vm.get(vvdId);
    const v=vvdVertex(vvd,vvdId);
    const p=SKIN_APPLY?skinVertex(v.pos,[lmap.boneMap[li*3],lmap.boneMap[li*3+1],lmap.boneMap[li*3+2]],lmap.nBoneArr[li]):v.pos;
    const [x,y,z]=p;
    if(!isFinite(x)||!isFinite(y)||!isFinite(z)) return -1;
    if(Math.abs(x)>1e5||Math.abs(y)>1e5||Math.abs(z)>1e5) return -1;
    P.push(x,y,z);N.push(v.nrm[0],v.nrm[1],v.nrm[2]);U.push(v.uv[0],v.uv[1]);
    const id=ni++;vm.set(vvdId,id);return id;
  };
  for(let st=0;st<nStrips;st++){
    const sb=sgBase+stOff+st*stSz;
    if(sb+stSz>dv.byteLength) continue;
    const sn=sI32(dv,sb+0),so=sI32(dv,sb+4),sf=sU8(dv,sb+18);
    if(sn<=0||sn>2000000||so<=0) continue;
    const ib=sgBase+so;
    if(ib+sn*2>dv.byteLength) continue;
    if(sf&0x02){
      for(let i=0;i+2<sn;i+=3){
        const la=sU16(dv,ib+i*2),lb=sU16(dv,ib+(i+1)*2),lc=sU16(dv,ib+(i+2)*2);
        if(la>=nV||lb>=nV||lc>=nV){rej++;continue;}
        const a=push(la),b=push(lb),c=push(lc);
        if(a<0||b<0||c<0){rej++;continue;}
        if(a===b||b===c||a===c) continue;
        I.push(a,b,c);
      }
    } else if(sf&0x01){
      let lP=-1,lP2=-1;
      for(let i=0;i<sn;i++){
        const lc=sU16(dv,ib+i*2);
        if(lc>=nV){lP=lP2=-1;continue;}
        if(lP>=0&&lP2>=0){
          const a=push(lP2),b=push(lP),c=push(lc);
          if(a>=0&&b>=0&&c>=0&&!(a===b||b===c||a===c)){
            if(i&1) I.push(b,a,c); else I.push(a,b,c);
          } else rej++;
        }
        lP2=lP;lP=lc;
      }
    }
  }
  if(I.length<3) return null;
  return {positions:P,normals:N,uvs:U,indices:I,rejected:rej,deep:false};
}
function parseDeep(dv,sgBase,lmap,nV,nI,iOff,vvd,hs){
  let ib=sgBase+iOff,ic=nI;
  if(iOff<=0||ib>=dv.byteLength||ib<sgBase+hs){ib=sgBase+hs;ic=Math.floor((dv.byteLength-ib)/2);}
  const mp=Math.floor((dv.byteLength-ib)/2);
  if(ic<=0||ic>mp) ic=mp;
  if(ic>2000000) ic=2000000;
  const P=[],N=[],U=[],I=[];const vm=new Map();let ni=0,rej=0,vt=0;
  const push=(li)=>{
    const vvdId=lmap.vvdMap[li];if(vvdId<0) return -1;
    if(vm.has(vvdId)) return vm.get(vvdId);
    const v=vvdVertex(vvd,vvdId);
    const p=SKIN_APPLY?skinVertex(v.pos,[lmap.boneMap[li*3],lmap.boneMap[li*3+1],lmap.boneMap[li*3+2]],lmap.nBoneArr[li]):v.pos;
    const [x,y,z]=p;
    if(!isFinite(x)||!isFinite(y)||!isFinite(z)) return -1;
    if(Math.abs(x)>1e5||Math.abs(y)>1e5||Math.abs(z)>1e5) return -1;
    P.push(x,y,z);N.push(v.nrm[0],v.nrm[1],v.nrm[2]);U.push(v.uv[0],v.uv[1]);
    const id=ni++;vm.set(vvdId,id);return id;
  };
  for(let i=0;i+2<ic;i+=3){
    const p=ib+i*2;if(p+6>dv.byteLength) break;
    const la=dv.getUint16(p,true),lb=dv.getUint16(p+2,true),lc=dv.getUint16(p+4,true);
    if(la>=nV||lb>=nV||lc>=nV){rej++;continue;}
    const a=push(la),b=push(lb),c=push(lc);
    if(a<0||b<0||c<0){rej++;continue;}
    if(a===b||b===c||a===c) continue;
    I.push(a,b,c);vt++;
  }
  if(vt<3) return null;
  return {positions:P,normals:N,uvs:U,indices:I,rejected:rej,deep:true};
}
function parseSG(dv,sgBase,sizes,mvo,maxVVD,vvd,forceDeep){
  if(sgBase+24>dv.byteLength) return null;
  const lmap=buildLmap(dv,sgBase,sizes.vertexSize,mvo,maxVVD);
  if(!lmap) return null;
  const nI=sI32(dv,sgBase+8),iOff=sI32(dv,sgBase+12),nS=sI32(dv,sgBase+16),sOff=sI32(dv,sgBase+20);
  if(!forceDeep&&nS>0&&sOff>0&&nI>0){
    const std=parseStrips(dv,sgBase,lmap,lmap.numVerts,nS,sOff,sizes.stripHdrSize,vvd);
    if(std&&std.indices.length>=3) return std;
  }
  return parseDeep(dv,sgBase,lmap,lmap.numVerts,nI,iOff,vvd,24);
}
function parseHierarchy(dv,mdl,vvd,maxVVD,sizes,forceDeep){
  const group=new THREE.Group();group.rotation.x=-Math.PI/2;
  const stats={verts:0,tris:0,meshes:0,rejected:0};
  const nBP=sI32(dv,28),bpOff=sI32(dv,32);
  if(nBP<=0||nBP>64||bpOff<=0||bpOff>=dv.byteLength) return null;
  for(let bp=0;bp<nBP;bp++){
    const bpB=bpOff+bp*sizes.bodyPartHdrSize;
    if(bpB+8>dv.byteLength) break;
    const nMod=sI32(dv,bpB+0),moOff=sI32(dv,bpB+4);
    if(nMod<=0||nMod>64||moOff<=0) continue;
    for(let m=0;m<nMod;m++){
      const mB=bpB+moOff+m*sizes.modelHdrSize;
      if(mB+8>dv.byteLength) continue;
      const nLod=sI32(dv,mB+0),lOff=sI32(dv,mB+4);
      if(nLod<=0||nLod>8||lOff<=0) continue;
      const lodB=mB+lOff;
      if(lodB+sizes.lodHdrSize>dv.byteLength) continue;
      const nMe=sI32(dv,lodB+0),meOff=sI32(dv,lodB+4);
      if(nMe<=0||nMe>1024||meOff<=0) continue;
      const mdlBp=mdl.bodyparts[bp];
      const mdlMod=(mdlBp&&mdlBp.models[m])?mdlBp.models[m]:null;
      for(let me=0;me<nMe;me++){
        const meB=lodB+meOff+me*sizes.meshHdrSize;
        if(meB+8>dv.byteLength) continue;
        const nSG=sI32(dv,meB+0),sgOff=sI32(dv,meB+4);
        if(nSG<=0||nSG>64||sgOff<=0) continue;
        let mat=0,mvo=0;
        if(mdlMod&&mdlMod.meshes[me]){mat=mdlMod.meshes[me].material;mvo=mdlMod.meshes[me].vertexOffset;}
        const P=[],N=[],U=[],I=[];let ni=0;
        for(let sg=0;sg<nSG;sg++){
          const sgB=meB+sgOff+sg*sizes.stripGroupHdrSize;
          const r=parseSG(dv,sgB,sizes,mvo,maxVVD,vvd,forceDeep);
          if(!r) continue;
          stats.rejected+=(r.rejected||0);
          const sh=ni;
          for(let i=0;i<r.positions.length;i++) P.push(r.positions[i]);
          for(let i=0;i<r.normals.length;i++) N.push(r.normals[i]);
          for(let i=0;i<r.uvs.length;i++) U.push(r.uvs[i]);
          for(let i=0;i<r.indices.length;i++) I.push(r.indices[i]+sh);
          ni+=r.positions.length/3;
        }
        if(I.length<3) continue;
        const geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
        geo.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
        geo.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
        geo.setIndex(I);geo.computeBoundingSphere();
        const skinIdx=mdl.skin[mat]??0;
        const texName=mdl.textures[skinIdx]||'';
        const material=new THREE.MeshStandardMaterial({
          color:FALLBACK_COLORS[mat%FALLBACK_COLORS.length],
          roughness:0.65,metalness:0.05,side:THREE.DoubleSide});
        material.userData.texName=texName;
        if(TexStore.enabled&&texName){
          const fileRec=TexStore.findByMat(texName);
          if(fileRec){
            TexStore.makeTexture(fileRec,1024).then(td=>{
              if(td){material.map=td.texture;material.color.set(0xffffff);material.needsUpdate=true;}
            });
          }
        }
        group.add(new THREE.Mesh(geo,material));
        stats.verts+=P.length/3;stats.tris+=I.length/3;stats.meshes++;
      }
    }
  }
  return stats.meshes>0?{group,stats}:null;
}
function buildModel(mdl,vvd,vtxBuf,applySkin){
  const dv=new DataView(vtxBuf);
  const maxVVD=vvd.numLODVertexes[0]||0;
  if(!maxVVD) return {group:new THREE.Group(),stats:{verts:0,tris:0,meshes:0},layout:'—'};
  resetSkinState();SKIN_BONE_COUNT=mdl.bones.length;
  if(applySkin&&SKIN_BONE_COUNT>1){SKIN_APPLY=true;SKIN_MATRICES=mdl.bones.map(b=>invertRigid3x4(b.poseToBone));}
  let best=null,bestName='';
  const primary=getVTXStructSizes(mdl.version);
  try{
    let r=parseHierarchy(dv,mdl,vvd,maxVVD,primary,false);
    if(r&&r.stats.tris>0){best=r;bestName=`std v${mdl.version}`;}
    if(!best||best.stats.tris<500){
      r=parseHierarchy(dv,mdl,vvd,maxVVD,primary,true);
      if(r&&r.stats.tris>0&&(!best||r.stats.tris>best.stats.tris)){best=r;bestName=`deep v${mdl.version}`;}
    }
  }catch(e){}
  if(!best){
    const fb=[{sg:28,st:27,mh:9,lod:12,vtx:9},{sg:28,st:28,mh:12,lod:12,vtx:9},
      {sg:25,st:27,mh:9,lod:12,vtx:10},{sg:36,st:35,mh:12,lod:12,vtx:9},{sg:33,st:35,mh:9,lod:12,vtx:9}];
    for(const f of fb){
      const sizes=Object.assign({},primary,{stripGroupHdrSize:f.sg,stripHdrSize:f.st,
        meshHdrSize:f.mh,lodHdrSize:f.lod,vertexSize:f.vtx});
      for(const fd of [false,true]){
        try{const r=parseHierarchy(dv,mdl,vvd,maxVVD,sizes,fd);
          if(r&&r.stats.tris>0&&(!best||r.stats.tris>best.stats.tris)){best=r;bestName=`${fd?'deep':'std'}-alt`;}
        }catch(e){}
      }
      if(best&&best.stats.tris>500) break;
    }
  }
  if(!best) return {group:new THREE.Group(),stats:{verts:0,tris:0,meshes:0},layout:'—'};
  best.layout=bestName;
  best.skinning={enabled:SKIN_APPLY,bones:SKIN_BONE_COUNT};
  return best;
}

const modelCanvas=document.getElementById('modelCanvas');
const isMobile=matchMedia('(pointer: coarse)').matches||innerWidth<900;
const modelRenderer=new THREE.WebGLRenderer({canvas:modelCanvas,antialias:!isMobile,powerPreference:'high-performance'});
modelRenderer.setPixelRatio(Math.min(devicePixelRatio,2));
modelRenderer.outputColorSpace=THREE.SRGBColorSpace;
modelRenderer.toneMapping=THREE.ACESFilmicToneMapping;
modelRenderer.toneMappingExposure=1.05;
const modelScene=new THREE.Scene();
modelScene.background=new THREE.Color(0x05070a);
const modelCamera=new THREE.PerspectiveCamera(45,1,0.5,100000);
modelCamera.position.set(120,90,160);
const modelControls=new OrbitControls(modelCamera,modelRenderer.domElement);
modelControls.enableDamping=true;modelControls.dampingFactor=0.08;
modelControls.rotateSpeed=isMobile?0.9:1.0;
modelControls.zoomSpeed=isMobile?1.1:1.0;
modelControls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
modelControls.target.set(0,40,0);

const lightGroup=new THREE.Group();
const hemi=new THREE.HemisphereLight(0xbfd4ff,0x2a2f38,1.15);
const keyL=new THREE.DirectionalLight(0xffffff,2.2);keyL.position.set(1,1.6,1);
const fillL=new THREE.DirectionalLight(0x88aaff,0.8);fillL.position.set(-1,0.4,-1);
const rim=new THREE.DirectionalLight(0xff88cc,0.5);rim.position.set(-0.5,-0.3,1);
lightGroup.add(hemi,keyL,fillL,rim);
modelScene.add(lightGroup);
const ambient=new THREE.AmbientLight(0xffffff,0.35);ambient.visible=false;
modelScene.add(ambient);

const modelGrid=new THREE.GridHelper(2048,64,0x3a4553,0x1f2630);
modelGrid.material.transparent=true;modelGrid.material.opacity=0.9;
modelScene.add(modelGrid);
const axisX=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1024,0.01,0),new THREE.Vector3(1024,0.01,0)]),
  new THREE.LineBasicMaterial({color:0xff4d4d,transparent:true,opacity:0.5}));
const axisZ=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0.01,-1024),new THREE.Vector3(0,0.01,1024)]),
  new THREE.LineBasicMaterial({color:0x4d8cff,transparent:true,opacity:0.5}));
modelScene.add(axisX);modelScene.add(axisZ);

let currentModelRoot=null,phyRoot=null,autoRotate=false,lastEntry=null;
function modelResize(){
  const w=modelCanvas.clientWidth,h=modelCanvas.clientHeight;
  if(!w||!h) return;
  modelRenderer.setSize(w,h,false);
  modelCamera.aspect=w/h;modelCamera.updateProjectionMatrix();
}
new ResizeObserver(modelResize).observe(panes.models);

let lastT=0,fr=0;
function tick(t){
  requestAnimationFrame(tick);
  if(activeTab!=='models') return;
  fr++;
  if(t-lastT>500){document.getElementById('fps').textContent=Math.round(fr*1000/(t-lastT));fr=0;lastT=t;}
  if(autoRotate&&currentModelRoot) currentModelRoot.rotation.z+=0.005;
  modelControls.update();
  modelRenderer.render(modelScene,modelCamera);
}
requestAnimationFrame(tick);

function clearModelScene(){
  if(currentModelRoot){modelScene.remove(currentModelRoot);disposeTree(currentModelRoot);currentModelRoot=null;}
  if(phyRoot){modelScene.remove(phyRoot);disposeTree(phyRoot);phyRoot=null;}
}
function disposeTree(r){
  r.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}
  });
}
function frameObject(obj){
  const box=new THREE.Box3().setFromObject(obj);
  if(box.isEmpty()) return;
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const radius=Math.max(size.x,size.y,size.z)*0.5||50;
  modelControls.target.copy(center);
  const pad=isMobile?1.45:1.25;
  const dist=radius/Math.sin(THREE.MathUtils.degToRad(modelCamera.fov*0.5))*pad;
  const dir=new THREE.Vector3(0.65,0.5,0.85).normalize();
  modelCamera.position.copy(center).addScaledVector(dir,dist);
  modelCamera.near=Math.max(0.1,radius/500);
  modelCamera.far=Math.max(2000,radius*50);
  modelCamera.updateProjectionMatrix();modelControls.update();
}

let FILE_MAP=new Map(),MODELS=[],curIdx=0;
let showGrid=true,showWire=false,showPhy=false;
let _lastModelStats=null;

function findSibling(stem,suf){return FILE_MAP.get(stem+suf)||null;}
function findVTX(stem){
  for(const p of ['.dx90.vtx','.dx80.vtx','.sw.vtx','.vtx']){const f=FILE_MAP.get(stem+p);if(f)return f;}
  for(const [k,f] of FILE_MAP){if(k.startsWith(stem+'.')&&k.endsWith('.vtx')) return f;}
  return null;
}
function rebuildFileMapFromStore(){
  FILE_MAP=new Map();
  for(const f of Store.files.values()){
    const fileFacade={
      name:f.path.split('/').pop(),
      _rec:f,
      arrayBuffer:async()=>f.blob.arrayBuffer(),
      text:async()=>f.blob.text(),
      size:f.size
    };
    const lower=f.path.toLowerCase();
    FILE_MAP.set(lower,fileFacade);
    FILE_MAP.set(fileFacade.name.toLowerCase(),fileFacade);
  }
}
function scanModels(){
  MODELS=[];
  const seen=new Set();
  for(const [key,file] of FILE_MAP){
    if(!key.endsWith('.mdl')||seen.has(key)) continue;
    seen.add(key);
    const stem=key.replace(/\.mdl$/,'');
    const vvd=findSibling(stem,'.vvd'),vtx=findVTX(stem);
    if(!vvd&&!vtx) continue;
    MODELS.push({name:file.name,mdlFile:file,vvdFile:vvd,vtxFile:vtx,phyFile:findSibling(stem,'.phy')});
  }
  MODELS.sort((a,b)=>a.name.localeCompare(b.name));
  refreshGlobalStats();
  if(!MODELS.length){
    document.getElementById('sEmpty').style.display='';
    document.getElementById('secModel').style.display='none';
    document.getElementById('secOpts').style.display='none';
    document.getElementById('secStats').style.display='none';
    return;
  }
  document.getElementById('sEmpty').style.display='none';
  document.getElementById('secModel').style.display='';
  document.getElementById('secOpts').style.display='';
  document.getElementById('secStats').style.display='';
  document.getElementById('modelSel').innerHTML=MODELS.map((m,i)=>{
    const warn=(m.vvdFile&&m.vtxFile)?'':' ⚠';
    return `<option value="${i}">${m.name}${warn}</option>`;
  }).join('');
  document.getElementById('modelSel').value='0';curIdx=0;loadCurrentModel();
}

function renderModelStats(d){
  _lastModelStats=d;
  const el=document.getElementById('stats');
  if(!d){el.innerHTML='';return;}
  el.innerHTML=`
    <div><span>${t('stat_file')}</span><span>${d.name}</span></div>
    <div><span>${t('stat_mdl')}</span><span>v${d.mdlVersion}</span></div>
    <div><span>${t('stat_bones')}</span><span>${d.bones}</span></div>
    <div><span>${t('stat_meshes')}</span><span>${d.meshes}</span></div>
    <div><span>${t('stat_verts')}</span><span>${d.verts.toLocaleString(LANG)}</span></div>
    <div><span>${t('stat_tris')}</span><span>${d.tris.toLocaleString(LANG)}</span></div>
    <div><span>${t('stat_mats')}</span><span>${d.mats}</span></div>
    <div><span>${t('stat_mode')}</span><span>${d.mode}</span></div>
    <div><span>${t('stat_layout')}</span><span>${d.layout}</span></div>
    <div><span>${t('stat_phy')}</span><span>${d.phy}</span></div>`;
}

async function loadCurrentModel(){
  const entry=MODELS[curIdx];if(!entry) return;
  lastEntry=entry;resetSkinState();clearModelScene();
  document.getElementById('vLoad').classList.add('show');
  try{
    if(!entry.vvdFile||!entry.vtxFile) throw new Error('need .vvd and .vtx');
    const [mB,vB,xB]=await Promise.all([
      entry.mdlFile.arrayBuffer(),entry.vvdFile.arrayBuffer(),entry.vtxFile.arrayBuffer()]);
    const mdl=parseMDL(mB),vvd=parseVVD(vB);
    const wantSkin=document.getElementById('chkSkin').checked,canSkin=mdl.bones.length>1;
    if(wantSkin&&!canSkin) document.getElementById('chkSkin').checked=false;
    const res=buildModel(mdl,vvd,xB,wantSkin&&canSkin);
    const {group,stats,layout,skinning}=res;
    if(!stats.meshes) throw new Error('cannot build geometry');
    currentModelRoot=group;modelScene.add(group);
    let phyInfo='—';
    if(entry.phyFile){
      try{
        const phyBuf=await entry.phyFile.arrayBuffer();
        const phy=parsePHY(phyBuf);
        let h=0;const g=new THREE.Group();g.rotation.x=-Math.PI/2;
        for(const s of phy.solids) for(const pts of s){
          if(pts.length<4) continue;
          try{g.add(new THREE.Mesh(new ConvexGeometry(pts),
            new THREE.MeshBasicMaterial({color:0xffb84d,wireframe:true,transparent:true,opacity:0.85})));h++;}catch(_){}
        }
        phyRoot=g;g.visible=showPhy;modelScene.add(g);
        phyInfo=`${phy.solidCount} · ${h} hull`;
      }catch(e){phyInfo=t('phy_error');}
    }
    const sl=skinning.enabled?t('mode_skin',{n:skinning.bones}):t('mode_bind');
    renderModelStats({
      name:mdl.name||entry.name,
      mdlVersion:mdl.version,
      bones:mdl.bones.length,
      meshes:stats.meshes,
      verts:stats.verts,
      tris:stats.tris,
      mats:mdl.textures.length,
      mode:sl,
      layout:layout,
      phy:phyInfo
    });
    if(document.getElementById('chkFit').checked) frameObject(group);
    applyModelWireframe();
    refreshGlobalStats();
  }catch(err){
    renderModelStats(null);
    document.getElementById('stats').innerHTML=`<div><span style="color:#f85149">${t('error',{msg:''})}</span><span>${err.message}</span></div>`;
  }finally{document.getElementById('vLoad').classList.remove('show');}
}
function applyModelWireframe(){
  if(!currentModelRoot) return;
  currentModelRoot.traverse(o=>{if(o.isMesh&&o.material) o.material.wireframe=showWire;});
}

document.getElementById('btnModels').addEventListener('click',()=>document.getElementById('pickModels').click());
document.getElementById('btnMats').addEventListener('click',()=>document.getElementById('pickMats').click());
document.getElementById('modelSel').addEventListener('change',e=>{curIdx=parseInt(e.target.value,10)|0;loadCurrentModel();});
document.getElementById('chkSkin').addEventListener('change',()=>{if(lastEntry) loadCurrentModel();});
document.getElementById('chkTex').addEventListener('change',()=>{
  TexStore.enabled=document.getElementById('chkTex').checked;
  TexStore._texCache.clear();
  if(!currentModelRoot) return;
  currentModelRoot.traverse(o=>{
    if(o.isMesh&&o.material){
      const tex=o.material.userData.texName;
      if(TexStore.enabled&&tex){
        const rec=TexStore.findByMat(tex);
        if(rec) TexStore.makeTexture(rec,1024).then(td=>{if(td){o.material.map=td.texture;o.material.color.set(0xffffff);o.material.needsUpdate=true;}});
      } else {o.material.map=null;o.material.needsUpdate=true;}
    }
  });
});
document.getElementById('chkPhy').addEventListener('change',()=>{
  showPhy=document.getElementById('chkPhy').checked;
  if(phyRoot) phyRoot.visible=showPhy;
  document.getElementById('btnPhy').classList.toggle('on',showPhy);
});
document.getElementById('btnGrid').addEventListener('click',()=>{
  showGrid=!showGrid;modelGrid.visible=showGrid;axisX.visible=showGrid;axisZ.visible=showGrid;
  document.getElementById('btnGrid').classList.toggle('on',showGrid);
});
document.getElementById('btnWire').addEventListener('click',()=>{
  showWire=!showWire;applyModelWireframe();
  document.getElementById('btnWire').classList.toggle('on',showWire);
});
document.getElementById('btnPhy').addEventListener('click',()=>{
  showPhy=!showPhy;if(phyRoot)phyRoot.visible=showPhy;
  document.getElementById('chkPhy').checked=showPhy;
  document.getElementById('btnPhy').classList.toggle('on',showPhy);
});
document.getElementById('btnSpin').addEventListener('click',()=>{
  autoRotate=!autoRotate;document.getElementById('btnSpin').classList.toggle('on',autoRotate);
});
document.getElementById('btnFit').addEventListener('click',()=>{if(currentModelRoot) frameObject(currentModelRoot);});
let lightsOn=true;
document.getElementById('btnSun').addEventListener('click',()=>{
  lightsOn=!lightsOn;
  lightGroup.visible=lightsOn;
  ambient.visible=!lightsOn;
  document.getElementById('btnSun').classList.toggle('on',lightsOn);
});
const sideEl=document.getElementById('side');
const burgerFloat=document.getElementById('burgerFloat');
function toggleSide(force){
  const collapse=(typeof force==='boolean')?force:!sideEl.classList.contains('collapsed');
  sideEl.classList.toggle('collapsed',collapse);
  burgerFloat.classList.toggle('show',collapse);
  setTimeout(modelResize,260);
}
document.getElementById('burgerBtn').addEventListener('click',()=>toggleSide(true));
burgerFloat.addEventListener('click',()=>toggleSide(false));

document.getElementById('pickModels').addEventListener('change',async e=>{
  const list=[...e.target.files].map(f=>({path:f.webkitRelativePath||f.name,file:f}));
  if(list.length){await addFilesToStore(list);rebuildFileMapFromStore();scanModels();}
  e.target.value='';
});
document.getElementById('pickMats').addEventListener('change',async e=>{
  const list=[...e.target.files].map(f=>({path:f.webkitRelativePath||f.name,file:f}));
  if(list.length){
    await addFilesToStore(list);
    await TexStore.rebuild();
    if(currentModelRoot){
      currentModelRoot.traverse(o=>{
        if(o.isMesh&&o.material){
          const tx=o.material.userData.texName;
          if(tx){const rec=TexStore.findByMat(tx);
            if(rec) TexStore.makeTexture(rec,1024).then(td=>{if(td){o.material.map=td.texture;o.material.color.set(0xffffff);o.material.needsUpdate=true;}});}
        }
      });
    }
  }
  e.target.value='';
});

['dragenter','dragover'].forEach(ev=>panes.models.addEventListener(ev,e=>e.preventDefault()));
panes.models.addEventListener('drop',async e=>{
  e.preventDefault();
  const list=await walkDrop(e.dataTransfer);
  if(list.length){
    await addFilesToStore(list);
    await TexStore.rebuild();
    rebuildFileMapFromStore();
    scanModels();
  }
});

/* ================================================================
   TEXTURE BROWSER PANE
   ================================================================ */
let tItems=[],tCur=-1,tSkip=0,tRoot=null,tPath='';

function detectCommonRoot(paths){
  if(!paths.length) return null;
  const withSlash=paths.filter(p=>p.indexOf('/')>0);
  if(withSlash.length!==paths.length) return null;
  const top=withSlash[0].split('/')[0];
  for(const p of withSlash){ if(p.split('/')[0]!==top) return null; }
  return top;
}

async function tAddFromStore(opts={}){
  const {resetView=false, keepSelection=false} = opts;
  if(resetView){ tRoot=null; tPath=''; }
  const prevSelected = (!keepSelection && tCur>=0 && tItems[tCur]) ? tItems[tCur].fileRec?.path : null;
  if(!keepSelection) tCur=-1;

  tItems=[]; tSkip=0;
  const vtfFiles = Store.listByExt('vtf');
  tRoot = detectCommonRoot(vtfFiles.map(f=>f.path));

  let i=0;
  for(const f of vtfFiles){
    i++;
    if(i%20===0) await new Promise(r=>setTimeout(r,0));
    let rel = f.path;
    if(tRoot && rel.startsWith(tRoot+'/')) rel = rel.slice(tRoot.length+1);
    const name = f.path.split('/').pop();
    try{
      const buf = await f.blob.arrayBuffer();
      tItems.push({name, relPath:rel, size:f.size, fileRec:f, vtf:parseVTF(buf)});
    }catch(err){
      tItems.push({name, relPath:rel, size:f.size, error:err.message});
      tSkip++;
    }
  }
  tItems.sort((a,b)=> a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0);

  buildThumbs();
  document.getElementById('tViewerSec').hidden = tItems.length === 0;

  if(prevSelected){
    const idx = tItems.findIndex(it=> it.fileRec && it.fileRec.path === prevSelected);
    if(idx>=0) tCur = idx;
  }
  tRender();
  tPreview();

  if(tCur === -1 || tCur >= tItems.length){
    const fi = tItems.findIndex(it=>!it.error && it.relPath.indexOf('/') < 0);
    if(fi >= 0) tSelect(fi);
    else if(tItems.length && !tItems[0].error) tSelect(0);
  }
}

function buildThumbs(){
  for(const it of tItems){
    if(it.error || it.thumb) continue;
    try{
      const v = it.vtf;
      let mip = 0;
      for(let m = v.mipmaps - 1; m >= 0; m--){
        const mw = Math.max(1, v.width >> m);
        if(mw >= 16){ mip = m; break; }
        mip = m;
      }
      const res = decodeVTFFrame(v, mip, 0);
      const T = 72;
      const scale = Math.min(T/res.width, T/res.height, 1);
      const tw = Math.max(1, Math.round(res.width*scale));
      const th = Math.max(1, Math.round(res.height*scale));
      const full = document.createElement('canvas');
      full.width = res.width; full.height = res.height;
      const fc = full.getContext('2d');
      const id = fc.createImageData(res.width, res.height);
      id.data.set(res.pixels);
      fc.putImageData(id, 0, 0);
      const tmp = document.createElement('canvas');
      tmp.width = tw; tmp.height = th;
      const tc = tmp.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.drawImage(full, 0, 0, tw, th);
      it.thumb = tmp.toDataURL('image/png');
    }catch(e){ it.thumb = null; }
  }
}

function tContents(path){
  const pre = path ? path+'/' : '';
  const fm = new Map();
  const files = [];
  for(const it of tItems){
    if(pre && it.relPath.indexOf(pre) !== 0) continue;
    const rest = it.relPath.slice(pre.length);
    if(!rest) continue;
    const sl = rest.indexOf('/');
    if(sl >= 0){
      const name = rest.slice(0, sl);
      fm.set(name, (fm.get(name)||0)+1);
    } else files.push(it);
  }
  return {
    folders: [...fm.entries()].map(([name,count])=>({name,count}))
              .sort((a,b)=>a.name.localeCompare(b.name)),
    files: files.sort((a,b)=>a.name.localeCompare(b.name))
  };
}

function tNav(p){ tPath = p; document.getElementById('tSearch').value=''; tRender(); }

function tBc(){
  const el = document.getElementById('tBc');
  el.textContent = '';
  if(!tRoot){
    const c = document.createElement('span');
    c.className = 't-crumb cur';
    c.innerHTML = '<span style="opacity:.85;margin-right:5px">📁</span>' + t('contents_emoji').replace('📂 ','');
    el.appendChild(c);
    return;
  }
  const r = document.createElement('span');
  r.className = 't-crumb' + (tPath ? '' : ' cur');
  r.innerHTML = '<span style="opacity:.85;margin-right:5px">📁</span>' + tRoot;
  if(tPath) r.addEventListener('click', ()=>tNav(''));
  el.appendChild(r);

  if(tPath){
    const parts = tPath.split('/');
    parts.forEach((p, idx)=>{
      const sep = document.createElement('span');
      sep.className = 't-sep'; sep.textContent = '›';
      el.appendChild(sep);
      const pu = parts.slice(0, idx+1).join('/');
      const isLast = idx === parts.length - 1;
      const c = document.createElement('span');
      c.className = 't-crumb' + (isLast ? ' cur' : '');
      c.textContent = p;
      if(!isLast) c.addEventListener('click', ()=>tNav(pu));
      el.appendChild(c);
    });
  }
}

let tST = null;
document.getElementById('tSearch').addEventListener('input', ()=>{
  clearTimeout(tST); tST = setTimeout(tRender, 120);
});

function tRender(){
  tBc();
  const q = document.getElementById('tSearch').value.trim().toLowerCase();
  const el = document.getElementById('tList');
  el.textContent = '';

  if(q){
    const ms = tItems.filter(it=> it.relPath.toLowerCase().indexOf(q) >= 0);
    document.getElementById('tCount').textContent = t('found_of',{n:ms.length,m:tItems.length});
    if(!ms.length){
      const d = document.createElement('div');
      d.className = 't-empty'; d.textContent = t('nothing_found');
      el.appendChild(d);
      return;
    }
    const frag = document.createDocumentFragment();
    for(const it of ms) frag.appendChild(tRow(it, it.relPath));
    el.appendChild(frag);
    return;
  }

  const {folders, files} = tContents(tPath);
  document.getElementById('tCount').textContent = t('folders_files',{n:folders.length,m:files.length});

  if(!folders.length && !files.length){
    const d = document.createElement('div');
    d.className = 't-empty'; d.textContent = t('empty');
    el.appendChild(d);
    return;
  }

  const frag = document.createDocumentFragment();

  for(const fo of folders){
    const np = tPath ? tPath+'/'+fo.name : fo.name;
    const row = document.createElement('div');
    row.className = 't-item folder';
    const th = document.createElement('div');
    th.className = 't-thumb'; th.textContent = '📁';
    const info = document.createElement('div');
    info.className = 't-info';
    const nm = document.createElement('div');
    nm.className = 't-name'; nm.textContent = fo.name;
    const sb = document.createElement('div');
    sb.className = 't-sub'; sb.textContent = fo.count + ' VTF';
    info.append(nm, sb);
    const arr = document.createElement('div');
    arr.className = 't-arrow'; arr.textContent = '›';
    row.append(th, info, arr);
    row.addEventListener('click', ()=>tNav(np));
    frag.appendChild(row);
  }

  for(const it of files) frag.appendChild(tRow(it, it.name));
  el.appendChild(frag);
}

function tRow(it, disp){
  const row = document.createElement('div');
  row.className = 't-item' +
    (tItems[tCur] === it ? ' active' : '') +
    (it.error ? ' err' : '');

  const th = document.createElement('div');
  th.className = 't-thumb';
  if(it.thumb) th.style.backgroundImage = `url(${it.thumb})`;
  else if(it.error){
    th.style.background = 'rgba(255,96,96,.15)';
    th.textContent = '⚠';
    th.style.color = '#ffb3b3';
  } else {
    th.textContent = '🖼';
    th.style.color = '#5f6a80';
  }

  const info = document.createElement('div');
  info.className = 't-info';
  const nm = document.createElement('div');
  nm.className = 't-name'; nm.textContent = it.name;
  const sb = document.createElement('div');
  sb.className = 't-sub';
  if(it.error) sb.textContent = '✕ ' + it.error;
  else sb.textContent = it.vtf.width + '×' + it.vtf.height + ' · ' + it.vtf.formatName;
  info.append(nm, sb);

  if(disp.indexOf('/') >= 0){
    sb.textContent = '📂 ' + disp.slice(0, disp.lastIndexOf('/'));
  }

  const mt = document.createElement('div');
  mt.className = 't-meta';
  mt.textContent = fmtB(it.size);

  row.append(th, info, mt);
  if(!it.error) row.addEventListener('click', ()=>tSelect(tItems.indexOf(it)));
  return row;
}

function tSelect(i){
  if(i < 0 || i >= tItems.length || tItems[i].error) return;
  tCur = i;
  tRender();
  tPreview();
}

function tPreview(){
  const chipsEl = document.getElementById('tChips');
  const mipSel  = document.getElementById('tMip');
  const frameSel= document.getElementById('tFrame');
  document.getElementById('tWarn').innerHTML = '';
  chipsEl.textContent = '';
  mipSel.textContent = '';
  frameSel.textContent = '';
  mipSel.disabled = true;
  frameSel.disabled = true;

  if(tCur < 0 || tCur >= tItems.length || tItems[tCur].error){
    document.getElementById('tView').innerHTML =
      '<div class="t-ph"><span class="big">🖼️</span>' + t('pick_vtf') + '</div>';
    return;
  }

  const it = tItems[tCur], v = it.vtf;

  const chips = [
    [LANG==='ru'?'Размер':LANG==='en'?'Size':LANG==='de'?'Größe':LANG==='fr'?'Taille':LANG==='es'?'Tamaño':LANG==='it'?'Dimensione':LANG==='pt'?'Tamanho':LANG==='pl'?'Rozmiar':LANG==='uk'?'Розмір':LANG==='tr'?'Boyut':LANG==='zh'?'尺寸':LANG==='ja'?'サイズ':'크기', v.width + '×' + v.height],
    [LANG==='ru'?'Формат':LANG==='en'?'Format':LANG==='de'?'Format':LANG==='fr'?'Format':LANG==='es'?'Formato':LANG==='it'?'Formato':LANG==='pt'?'Formato':LANG==='pl'?'Format':LANG==='uk'?'Формат':LANG==='tr'?'Biçim':LANG==='zh'?'格式':LANG==='ja'?'フォーマット':'형식', v.formatName],
    [LANG==='ru'?'Мипы':LANG==='en'?'Mips':LANG==='de'?'Mips':LANG==='fr'?'Mips':LANG==='es'?'Mips':LANG==='it'?'Mip':LANG==='pt'?'Mips':LANG==='pl'?'Mipy':LANG==='uk'?'Міпи':LANG==='tr'?'Mip':LANG==='zh'?'Mip 层':LANG==='ja'?'ミップ':'밉', String(v.mipmaps)],
    [LANG==='ru'?'Кадров':LANG==='en'?'Frames':LANG==='de'?'Frames':LANG==='fr'?'Images':LANG==='es'?'Fotogramas':LANG==='it'?'Frame':LANG==='pt'?'Quadros':LANG==='pl'?'Klatki':LANG==='uk'?'Кадрів':LANG==='tr'?'Kare':LANG==='zh'?'帧数':LANG==='ja'?'フレーム':'프레임', String(v.frames)],
    [LANG==='ru'?'Версия':LANG==='en'?'Version':LANG==='de'?'Version':LANG==='fr'?'Version':LANG==='es'?'Versión':LANG==='it'?'Versione':LANG==='pt'?'Versão':LANG==='pl'?'Wersja':LANG==='uk'?'Версія':LANG==='tr'?'Sürüm':LANG==='zh'?'版本':LANG==='ja'?'バージョン':'버전', 'v' + v.version]
  ];
  if(v.depth > 1) chips.push(['Depth', String(v.depth)]);
  if(v.flags) chips.push(['Flags', '0x' + v.flags.toString(16).padStart(8,'0')]);

  for(const [k, val] of chips){
    const c = document.createElement('span');
    c.className = 't-chip';
    c.innerHTML = k + ': <b>' + val + '</b>';
    chipsEl.appendChild(c);
  }

  const pc = document.createElement('span');
  pc.className = 't-chip';
  pc.innerHTML = (LANG==='ru'?'Путь:':LANG==='en'?'Path:':LANG==='de'?'Pfad:':LANG==='fr'?'Chemin :':LANG==='es'?'Ruta:':LANG==='it'?'Percorso:':LANG==='pt'?'Caminho:':LANG==='pl'?'Ścieżka:':LANG==='uk'?'Шлях:':LANG==='tr'?'Yol:':LANG==='zh'?'路径：':LANG==='ja'?'パス:':'경로:') + ' <b>' + (tRoot ? tRoot + '/' : '') + it.relPath + '</b>';
  chipsEl.appendChild(pc);

  for(let i = 0; i < v.mipmaps; i++){
    const mw = Math.max(1, v.width >> i);
    const mh = Math.max(1, v.height >> i);
    const o = document.createElement('option');
    o.value = i;
    o.textContent = i + ' — ' + mw + '×' + mh;
    mipSel.appendChild(o);
  }
  for(let i = 0; i < v.frames; i++){
    const o = document.createElement('option');
    o.value = i;
    o.textContent = t('frame').replace(':', '') + ' ' + (i+1) + '/' + v.frames;
    frameSel.appendChild(o);
  }
  mipSel.disabled = false;
  frameSel.disabled = v.frames <= 1;
  mipSel.onchange = tDraw;
  frameSel.onchange = tDraw;
  tDraw();
}

function tDraw(){
  const it = tItems[tCur];
  if(!it || it.error) return;
  const v = it.vtf;
  const mip = parseInt(document.getElementById('tMip').value || '0', 10);
  const f   = parseInt(document.getElementById('tFrame').value || '0', 10);

  let res;
  try{ res = decodeVTFFrame(v, mip, f); }
  catch(e){
    document.getElementById('tView').innerHTML =
      '<div class="t-ph" style="color:#ffb3b3">⚠️ ' + e.message + '</div>';
    return;
  }

  const el = document.getElementById('tView');
  el.textContent = '';
  const cv = document.createElement('canvas');
  cv.width = res.width; cv.height = res.height;
  const ctx = cv.getContext('2d');
  const id = ctx.createImageData(res.width, res.height);
  id.data.set(res.pixels);
  ctx.putImageData(id, 0, 0);
  if(res.width <= 256 && res.height <= 256) cv.style.imageRendering = 'pixelated';
  el.appendChild(cv);

  const n = document.createElement('div');
  n.style.cssText = 'color:#8a93a8;font-size:11.5px;font-family:var(--mono);text-align:center';
  n.textContent = res.width + '×' + res.height + ' · ' + t('mip_frame',{mip:mip,frame:f+1,total:v.frames});
  el.appendChild(n);

  const fm = v.format;
  if(fm === 24 || fm === 25 || fm === 23 || fm === 26 || fm === 7 || fm === 22){
    document.getElementById('tWarn').innerHTML =
      '<div class="t-warn">' + t('approx_fmt',{fmt:vtfFmtName(fm)}) + '</div>';
  }
}

document.getElementById('tPng').addEventListener('click', ()=>{
  const it = tItems[tCur];
  if(!it || it.error) return;
  const cv = document.getElementById('tView').querySelector('canvas');
  if(!cv) return;
  cv.toBlob(blob=>{
    if(!blob) return;
    const base = it.name.replace(/\.vtf$/i, '');
    const m = document.getElementById('tMip').value || '0';
    const f = document.getElementById('tFrame').value || '0';
    const s = (document.getElementById('tMip').options.length > 1 ? '_mip' + m : '') +
              (it.vtf.frames > 1 ? '_f' + (parseInt(f,10) + 1) : '');
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = base + s + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 10000);
  }, 'image/png');
});

document.getElementById('tPickFolder').addEventListener('click', e=>{
  e.stopPropagation();
  document.getElementById('tFolderInput').click();
});
document.getElementById('tPickFiles').addEventListener('click', e=>{
  e.stopPropagation();
  document.getElementById('tFileInput').click();
});
document.getElementById('tClear').addEventListener('click', e=>{
  e.stopPropagation();
  tItems=[]; tCur=-1; tSkip=0; tRoot=null; tPath='';
  document.getElementById('tFileInput').value='';
  document.getElementById('tFolderInput').value='';
  document.getElementById('tSearch').value='';
  document.getElementById('tViewerSec').hidden = true;
  document.getElementById('tTotal').textContent = '0';
  document.getElementById('tSkip').textContent = '0';
});
document.getElementById('tDrop').addEventListener('click', e=>{
  if(!e.target.closest('button')) document.getElementById('tFolderInput').click();
});

document.getElementById('tFileInput').addEventListener('change', async ()=>{
  const inp = document.getElementById('tFileInput');
  if(inp.files.length){
    const list = [...inp.files].map(f=>({path:f.name, file:f}));
    await addFilesToStore(list);
    await TexStore.rebuild();
    await tAddFromStore({resetView:false, keepSelection:false});
  }
  inp.value = '';
});
document.getElementById('tFolderInput').addEventListener('change', async ()=>{
  const inp = document.getElementById('tFolderInput');
  if(inp.files.length){
    const list = [...inp.files].map(f=>({
      path: f.webkitRelativePath || f.name, file: f
    }));
    await addFilesToStore(list);
    await TexStore.rebuild();
    await tAddFromStore({resetView:true, keepSelection:false});
  }
  inp.value = '';
});

['dragenter','dragover'].forEach(ev=>{
  document.getElementById('tDrop').addEventListener(ev, e=>{
    e.preventDefault();
    document.getElementById('tDrop').classList.add('over');
  });
});
['dragleave','drop'].forEach(ev=>{
  document.getElementById('tDrop').addEventListener(ev, e=>{
    e.preventDefault();
    if(ev === 'dragleave' && document.getElementById('tDrop').contains(e.relatedTarget)) return;
    document.getElementById('tDrop').classList.remove('over');
  });
});
document.getElementById('tDrop').addEventListener('drop', async e=>{
  e.preventDefault();
  const list = await walkDrop(e.dataTransfer);
  if(list.length){
    const hasFolder = list.some(x=> x.path && x.path.indexOf('/') >= 0);
    await addFilesToStore(list);
    await TexStore.rebuild();
    await tAddFromStore({resetView:hasFolder, keepSelection:false});
  }
});

const _tRender = tRender;
tRender = function(){
  document.getElementById('tTotal').textContent =
    tItems.filter(it=>!it.error).length.toLocaleString(LANG);
  document.getElementById('tSkip').textContent =
    tSkip.toLocaleString(LANG);
  _tRender();
};

/* ================================================================
   KEYBOARD
   ================================================================ */
window.addEventListener('keydown',e=>{
  if(e.key==='p'||e.key==='P'||e.key==='з'||e.key==='З'||(e.code==='Space'&&!e.repeat)){
    if(activeTab==='vmf' && vmfGroup && !document.getElementById('vmfBtnShot').disabled){
      e.preventDefault();
      document.getElementById('vmfBtnShot').click();
    }
  }
});

/* ================================================================
   INIT
   ================================================================ */
document.documentElement.lang = LANG;
applyI18n();

EntityIcons.onChange(() => refreshGlobalStats());

(async function init(){
  await Store.init();
  await TexStore.rebuild();
  rebuildFileMapFromStore();
  scanModels();
  await tAddFromStore();
  refreshGlobalStats();
  updateStatusAll('ready');
  applyI18n();
  vmfResize();modelResize();
})();