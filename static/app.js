document.addEventListener('DOMContentLoaded', () => {
  let savesData = [];
  let systemSaveData = null;
  let selectedSave = null;
  let currentDir = '';
  let defaultPcDir = '';
  let currentDirection = 'pc2ps5'; // 'pc2ps5', 'pc2pc', 'ps52pc'
  let targetMode = 'auto'; // 'auto' or 'slot'

  // DOM elements
  const savesListEl = document.getElementById('savesList');
  const pcSaveDirPathEl = document.getElementById('pcSaveDirPath');
  const dropZoneArea = document.getElementById('dropZoneArea');
  const ps5StatusIndicator = document.getElementById('ps5StatusIndicator');
  const ps5StatusText = document.getElementById('ps5StatusText');
  const inputSourceId = document.getElementById('inputSourceId');
  const inputTargetId = document.getElementById('inputTargetId');
  const lblSourceId = document.getElementById('lblSourceId');
  const lblTargetId = document.getElementById('lblTargetId');
  const inputOutputDir = document.getElementById('inputOutputDir');
  const btnConvertSelected = document.getElementById('btnConvertSelected');
  const btnConvertSelectedText = document.getElementById('btnConvertSelectedText');
  const btnConvertBatch = document.getElementById('btnConvertBatch');
  const btnDefaultPcDir = document.getElementById('btnDefaultPcDir');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const btnUploadFolder = document.getElementById('btnUploadFolder');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const btnOpenFolder = document.getElementById('btnOpenFolder');
  const btnClearLog = document.getElementById('btnClearLog');
  const consoleOutput = document.getElementById('consoleOutput');
  const ps5TargetOptionsCard = document.getElementById('ps5TargetOptionsCard');
  const patchesBanner = document.getElementById('patchesBanner');
  const modeCardAuto = document.getElementById('modeCardAuto');
  const modeCardSlot = document.getElementById('modeCardSlot');

  function log(text) {
    const timestamp = new Date().toLocaleTimeString();
    consoleOutput.textContent += `\n[${timestamp}] ${text}`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function getSlotTitle(filename) {
    if (filename === 'data000.bin') {
      return 'Автосохранение (Продолжить)';
    }
    const match = filename.match(/data(\d+)Slot\.bin/i);
    if (match) {
      const slotNum = parseInt(match[1], 10);
      return `Слот ${slotNum}`;
    }
    return filename;
  }

  // Load saves from directory
  async function loadSaves(dirPath) {
    savesListEl.innerHTML = '<div class="loading-spinner">Поиск сохранений...</div>';
    try {
      const url = dirPath ? `/api/saves?dir=${encodeURIComponent(dirPath)}` : '/api/saves';
      const res = await fetch(url);
      const data = await res.json();
      
      currentDir = data.current_dir;
      defaultPcDir = data.default_dir;
      pcSaveDirPathEl.textContent = currentDir;

      if (!inputOutputDir.value) {
        inputOutputDir.value = data.default_output_dir;
      }

      savesData = data.saves || [];
      systemSaveData = data.system_save || null;
      
      // Auto-select latest or first
      selectedSave = savesData.find(s => s.is_latest) || savesData[0] || null;
      renderSaves();
    } catch (err) {
      savesListEl.innerHTML = `<div class="loading-spinner" style="color: #ef4444;">Ошибка: ${err.message}</div>`;
      log(`Ошибка подключения к бэкенду: ${err.message}`);
    }
  }

  function renderSaves() {
    if (!savesData.length) {
      savesListEl.innerHTML = '<div class="loading-spinner">Сохранений (.bin) в этой папке не найдено. Вы можете загрузить архив или файл.</div>';
      return;
    }

    savesListEl.innerHTML = '';
    
    savesData.forEach((save) => {
      const isSelected = selectedSave && selectedSave.name === save.name;
      const card = document.createElement('div');
      card.className = `save-card ${save.is_latest ? 'latest' : ''} ${isSelected ? 'selected' : ''}`;

      const title = getSlotTitle(save.name);

      card.innerHTML = `
        <div class="radio-custom ${isSelected ? 'checked' : ''}">
          <div class="radio-inner"></div>
        </div>
        <div class="save-info">
          <div class="save-top-row">
            <span class="save-title">${title}</span>
            <span class="save-filename">${save.name}</span>
            ${save.is_latest ? '<span class="badge badge-latest">✨ Самый свежий</span>' : ''}
          </div>
          <div class="save-meta">
            <span class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${save.mtime_str}</span>
            <span class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> ${save.size_str}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedSave = save;
        document.querySelectorAll('.save-card').forEach(c => {
          c.classList.remove('selected');
          const r = c.querySelector('.radio-custom');
          if (r) r.classList.remove('checked');
        });
        card.classList.add('selected');
        const r = card.querySelector('.radio-custom');
        if (r) r.classList.add('checked');
      });

      savesListEl.appendChild(card);
    });

    if (systemSaveData) {
      const sysNote = document.createElement('div');
      sysNote.className = 'system-save-notice';
      sysNote.innerHTML = `
        <svg class="sys-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span><strong>${systemSaveData.name}</strong> — системные настройки (видео/звук). Не перезаписывайте его.</span>
      `;
      savesListEl.appendChild(sysNote);
    }
  }

  // Upload handler for single file, archive or folder
  async function uploadFile(file) {
    log(`Загрузка: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);
    savesListEl.innerHTML = `<div class="loading-spinner">Загрузка и распаковка ${file.name}...</div>`;

    try {
      const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file
      });
      const data = await res.json();
      
      if (data.success) {
        currentDir = data.current_dir;
        pcSaveDirPathEl.textContent = currentDir;
        savesData = data.saves || [];
        systemSaveData = data.system_save || null;
        selectedSave = savesData.find(s => s.is_latest) || savesData[0] || null;
        
        if (data.is_archive) {
          log(`📦 Архив ${data.archive_name} успешно распакован! Найдено сохранений: ${savesData.length}`);
        } else {
          log(`📄 Файл ${file.name} успешно загружен!`);
        }
        renderSaves();
      } else {
        log(`❌ Ошибка загрузки: ${data.error}`);
        loadSaves(currentDir);
      }
    } catch (err) {
      log(`❌ Ошибка сети при загрузке: ${err.message}`);
      loadSaves(currentDir);
    }
  }

  // Drag and Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZoneArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneArea.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZoneArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneArea.classList.remove('dragover');
    }, false);
  });

  dropZoneArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  });

  // Upload buttons
  btnUploadFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFile(fileInput.files[0]);
    }
  });

  btnUploadFolder.addEventListener('click', () => folderInput.click());
  folderInput.addEventListener('change', async () => {
    const files = Array.from(folderInput.files).filter(f => f.name.endsWith('.bin'));
    if (!files.length) {
      alert('В выбранной папке не найдено файлов сохранений .bin');
      return;
    }
    log(`Найдено ${files.length} файлов .bin в папке, загружаем...`);
    for (const file of files) {
      await uploadFile(file);
    }
  });

  btnDefaultPcDir.addEventListener('click', () => {
    log('Возврат к папке автопоиска ПК...');
    loadSaves(defaultPcDir);
  });

  // Direction Switcher
  const directionTabs = document.querySelectorAll('.direction-tab');
  directionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      directionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentDirection = tab.dataset.direction;
      updateDirectionUI();
    });
  });

  function updateDirectionUI() {
    if (currentDirection === 'pc2ps5') {
      ps5TargetOptionsCard.style.display = 'flex';
      lblSourceId.textContent = 'Исходный SteamID (ПК):';
      lblTargetId.textContent = 'Ключ PS5 (Шифрование):';
      inputSourceId.value = '76561197960285355';
      inputTargetId.value = '394424879635983';
      inputTargetId.readOnly = true;
      patchesBanner.innerHTML = `
        <div class="patch-badge">✓ Автопатч _MainRegionHash (3208943443)</div>
        <div class="patch-badge">✓ Автопатч _ApplicationVersion (16785408)</div>
      `;
      btnConvertSelectedText.textContent = 'Конвертировать для PS5';
      btnConvertBatch.textContent = 'Конвертировать ВСЕ сейвы для PS5';
    } else if (currentDirection === 'pc2pc') {
      ps5TargetOptionsCard.style.display = 'none';
      lblSourceId.textContent = 'Исходный SteamID (с сейва):';
      lblTargetId.textContent = 'Целевой SteamID (ваш аккаунт):';
      inputSourceId.value = '76561197960285355';
      inputTargetId.value = '76561197960285355';
      inputTargetId.readOnly = false;
      patchesBanner.innerHTML = `
        <div class="patch-badge" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.3);">
          ✓ Перешифровка ключа под целевой SteamID ПК
        </div>
      `;
      btnConvertSelectedText.textContent = 'Перенести сейв на ПК (Смена ID)';
      btnConvertBatch.textContent = 'Перенести ВСЕ сейвы на ПК';
    } else if (currentDirection === 'ps52pc') {
      ps5TargetOptionsCard.style.display = 'none';
      lblSourceId.textContent = 'Ключ PS5 (394424879635983):';
      lblTargetId.textContent = 'Целевой SteamID (для ПК):';
      inputSourceId.value = '394424879635983';
      inputTargetId.value = '76561197960285355';
      inputTargetId.readOnly = false;
      patchesBanner.innerHTML = `
        <div class="patch-badge" style="background: rgba(168, 85, 247, 0.1); color: #c084fc; border-color: rgba(168, 85, 247, 0.3);">
          ✓ Расшифровка PS5 + Обратный патч для ПК
        </div>
      `;
      btnConvertSelectedText.textContent = 'Конвертировать с PS5 на ПК';
      btnConvertBatch.textContent = 'Конвертировать ВСЕ сейвы с PS5 на ПК';
    }
  }

  // PS5 Status Check
  async function checkPs5Status() {
    try {
      const res = await fetch('/api/ps5_status?ip=192.168.1.173:8082');
      const data = await res.json();
      if (data.online) {
        ps5StatusIndicator.className = 'status-indicator online';
        ps5StatusText.textContent = 'PS5 Garlic: В сети (192.168.1.173)';
      } else {
        ps5StatusIndicator.className = 'status-indicator offline';
        ps5StatusText.textContent = 'PS5 Garlic: Не в сети';
      }
    } catch {
      ps5StatusIndicator.className = 'status-indicator offline';
      ps5StatusText.textContent = 'PS5 Garlic: Не в сети';
    }
  }

  // Mode Auto/Slot Toggle
  modeCardAuto.addEventListener('click', () => {
    targetMode = 'auto';
    modeCardAuto.classList.add('active');
    modeCardSlot.classList.remove('active');
    modeCardAuto.querySelector('input').checked = true;
  });

  modeCardSlot.addEventListener('click', () => {
    targetMode = 'slot';
    modeCardSlot.classList.add('active');
    modeCardAuto.classList.remove('active');
    modeCardSlot.querySelector('input').checked = true;
  });

  // Advanced Settings Toggle & Presets
  const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  const advancedBody = document.getElementById('advancedBody');
  const advancedArrow = document.getElementById('advancedArrow');
  const inputGameId = document.getElementById('inputGameId');
  const chkUseGameFolder = document.getElementById('chkUseGameFolder');
  const selectRegionPreset = document.getElementById('selectRegionPreset');
  const inputRegionHash = document.getElementById('inputRegionHash');
  const selectVersionPreset = document.getElementById('selectVersionPreset');
  const inputAppVersion = document.getElementById('inputAppVersion');

  btnToggleAdvanced.addEventListener('click', () => {
    const isHidden = advancedBody.style.display === 'none';
    advancedBody.style.display = isHidden ? 'block' : 'none';
    advancedArrow.classList.toggle('open', isHidden);
  });

  selectRegionPreset.addEventListener('change', () => {
    if (selectRegionPreset.value === 'ps5_eu_us') {
      inputRegionHash.value = '3208943443';
    } else if (selectRegionPreset.value === 'pc_global') {
      inputRegionHash.value = '1874947740';
    }
  });

  selectVersionPreset.addEventListener('change', () => {
    if (selectVersionPreset.value === 'ps5_102') {
      inputAppVersion.value = '16785408';
    } else if (selectVersionPreset.value === 'pc_1012') {
      inputAppVersion.value = '16781314';
    }
  });

  // Convert Selected Save
  btnConvertSelected.addEventListener('click', async () => {
    if (!selectedSave) {
      alert('Пожалуйста, выберите сохранение из списка.');
      return;
    }

    let targetName = selectedSave.name;
    if (currentDirection === 'pc2ps5') {
      targetName = targetMode === 'auto' ? 'data000.bin' : selectedSave.name;
    }

    log(`Запуск конвертации (${currentDirection}): ${selectedSave.name} -> ${targetName}...`);
    btnConvertSelected.disabled = true;
    btnConvertSelectedText.textContent = 'Конвертирую...';

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_file: selectedSave.path,
          target_name: targetName,
          mode: currentDirection,
          source_id: inputSourceId.value.trim(),
          target_id: inputTargetId.value.trim(),
          output_dir: inputOutputDir.value.trim(),
          region_hash: inputRegionHash.value.trim(),
          app_version: inputAppVersion.value.trim(),
          game_id: inputGameId.value.trim(),
          use_game_folder: chkUseGameFolder.checked
        })
      });

      const data = await res.json();
      if (data.success) {
        log(`🎉 УСПЕШНО ГОТОВО!\nФайл записан: ${data.output_file}`);
        if (currentDirection === 'pc2ps5') {
          log(`✓ Применены RegionHash (${inputRegionHash.value}) и AppVersion (${inputAppVersion.value})\n✓ Чексуммы верифицированы`);
          if (targetMode === 'auto') {
            log(`👉 Для PS5: В Garlic SaveMgr откройте 'SAVESERVICE-LINE-0-0', замените data000.bin и нажмите UNMOUNT.`);
          } else {
            log(`👉 Для PS5: В Garlic SaveMgr откройте соответствующий контейнер слота, замените ${targetName} и нажмите UNMOUNT.`);
          }
        } else {
          log(`✓ Сохранение готово для ПК! Вы можете скопировать его в папку игры.`);
        }
      } else {
        log(`❌ Ошибка конвертации: ${data.error}\n${data.log || ''}`);
      }
    } catch (err) {
      log(`❌ Ошибка запроса: ${err.message}`);
    } finally {
      btnConvertSelected.disabled = false;
      updateDirectionUI();
    }
  });

  // Convert Batch
  btnConvertBatch.addEventListener('click', async () => {
    if (!confirm(`Конвертировать ВСЕ сохранения (${currentDirection})?`)) return;
    
    log(`Запуск пакетной конвертации (${currentDirection})...`);
    btnConvertBatch.disabled = true;
    btnConvertBatch.textContent = 'Конвертация всех сейвов...';

    try {
      const res = await fetch('/api/convert_batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_dir: currentDir,
          mode: currentDirection,
          source_id: inputSourceId.value.trim(),
          target_id: inputTargetId.value.trim(),
          output_dir: inputOutputDir.value.trim(),
          region_hash: inputRegionHash.value.trim(),
          app_version: inputAppVersion.value.trim(),
          game_id: inputGameId.value.trim(),
          use_game_folder: chkUseGameFolder.checked
        })
      });

      const data = await res.json();
      if (data.success) {
        log(`✅ Пакетная конвертация завершена!\nВсе файлы сохранены в: ${data.output_dir}`);
      } else {
        log(`❌ Ошибка: ${data.error}\n${data.log || ''}`);
      }
    } catch (err) {
      log(`❌ Ошибка: ${err.message}`);
    } finally {
      btnConvertBatch.disabled = false;
      updateDirectionUI();
    }
  });

  // Open output folder
  btnOpenFolder.addEventListener('click', async () => {
    try {
      await fetch('/api/open_folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: inputOutputDir.value.trim() })
      });
    } catch (err) {
      log(`Не удалось открыть папку: ${err.message}`);
    }
  });

  btnClearLog.addEventListener('click', () => {
    consoleOutput.textContent = 'Лог очищен.';
  });

  // Init
  loadSaves();
  updateDirectionUI();
  checkPs5Status();
  setInterval(checkPs5Status, 10000);
});
