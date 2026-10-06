document.addEventListener('DOMContentLoaded', () => {
  let savesData = [];
  let systemSaveData = null;
  let selectedSave = null;
  let currentDir = '';
  let defaultReDir = '';
  let defaultSfDir = '';
  let defaultOutputDir = '';
  let currentDirection = 'pc2ps5'; // 'pc2ps5', 'pc2pc', 'ps52pc'
  let targetMode = 'auto'; // 'auto' or 'slot'
  let engineFilter = 'auto'; // 'auto', 're_engine', 'unreal_engine'
  let activeDetectedEngine = 're_engine';
  let isPs5Online = false;
  let lastConvertedFile = null;

  // DOM elements
  const savesListEl = document.getElementById('savesList');
  const pcSaveDirPathEl = document.getElementById('pcSaveDirPath');
  const dropZoneArea = document.getElementById('dropZoneArea');
  const ps5StatusIndicator = document.getElementById('ps5StatusIndicator');
  const ps5StatusText = document.getElementById('ps5StatusText');
  const appLogoBadge = document.getElementById('appLogoBadge');
  const engineDetectedBadge = document.getElementById('engineDetectedBadge');
  const engineDetectedText = document.getElementById('engineDetectedText');
  const engineIcon = document.getElementById('engineIcon');
  const pillEngineAuto = document.getElementById('pillEngineAuto');
  const pillEngineRE = document.getElementById('pillEngineRE');
  const pillEngineUE = document.getElementById('pillEngineUE');

  const btnDefaultReDir = document.getElementById('btnDefaultReDir');
  const btnDefaultSfDir = document.getElementById('btnDefaultSfDir');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const btnUploadFolder = document.getElementById('btnUploadFolder');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');

  const ps5TargetOptionsCard = document.getElementById('ps5TargetOptionsCard');
  const ueInfoCard = document.getElementById('ueInfoCard');
  const ueChapterVal = document.getElementById('ueChapterVal');
  const patchesBanner = document.getElementById('patchesBanner');
  const modeCardAuto = document.getElementById('modeCardAuto');
  const modeCardSlot = document.getElementById('modeCardSlot');

  const inputSourceId = document.getElementById('inputSourceId');
  const inputTargetId = document.getElementById('inputTargetId');
  const lblSourceId = document.getElementById('lblSourceId');
  const lblTargetId = document.getElementById('lblTargetId');
  const inputOutputDir = document.getElementById('inputOutputDir');
  const btnOpenFolder = document.getElementById('btnOpenFolder');

  const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  const advancedBody = document.getElementById('advancedBody');
  const advancedArrow = document.getElementById('advancedArrow');
  const inputGameId = document.getElementById('inputGameId');
  const chkUseGameFolder = document.getElementById('chkUseGameFolder');
  const selectRegionPreset = document.getElementById('selectRegionPreset');
  const inputRegionHash = document.getElementById('inputRegionHash');
  const selectVersionPreset = document.getElementById('selectVersionPreset');
  const inputAppVersion = document.getElementById('inputAppVersion');

  const btnConvertSelected = document.getElementById('btnConvertSelected');
  const btnConvertSelectedText = document.getElementById('btnConvertSelectedText');
  const btnConvertBatch = document.getElementById('btnConvertBatch');
  const btnDirectUploadPs5 = document.getElementById('btnDirectUploadPs5');
  const btnClearLog = document.getElementById('btnClearLog');
  const consoleOutput = document.getElementById('consoleOutput');

  function log(text) {
    const timestamp = new Date().toLocaleTimeString();
    consoleOutput.textContent += `\n[${timestamp}] ${text}`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function getSlotTitle(save) {
    if (save.engine === 'unreal_engine') {
      if (save.meta && save.meta.chapter) {
        return `Глава: ${save.meta.chapter}`;
      }
      return save.type || save.name;
    }

    if (save.name === 'data000.bin') {
      return 'Автосохранение (Продолжить)';
    }
    const match = save.name.match(/data(\d+)Slot\.bin/i);
    if (match) {
      const slotNum = parseInt(match[1], 10);
      return `Слот сохранения ${slotNum}`;
    }
    return save.type || save.name;
  }

  // Update UI appearance based on detected engine
  function applyEngineTheme(engine, gameTitle) {
    activeDetectedEngine = engine;

    if (engine === 'unreal_engine') {
      appLogoBadge.textContent = '⚡';
      engineIcon.textContent = '⚡';
      engineDetectedText.textContent = gameTitle || 'Unreal Engine (Split Fiction)';
      engineDetectedText.style.color = '#f59e0b';

      lblSourceId.textContent = currentDirection === 'ps52pc' ? 'Исходный PS5 UID:' : 'Исходный UID (ПК):';
      lblTargetId.textContent = currentDirection === 'ps52pc' ? 'Целевой UID (ПК):' : 'Целевой PS5 UID:';

      if (currentDirection === 'pc2ps5') {
        inputSourceId.value = '8A67AD3A491F308AB1BBD2AB12E76E39';
        inputTargetId.value = '813EB9976BF84E3FAB6AF0C68048B4F6';
      } else if (currentDirection === 'ps52pc') {
        inputSourceId.value = '813EB9976BF84E3FAB6AF0C68048B4F6';
        inputTargetId.value = '8A67AD3A491F308AB1BBD2AB12E76E39';
      }

      inputGameId.value = 'PPSA08560';

      // Hide RE specific options
      ps5TargetOptionsCard.style.display = 'none';
      patchesBanner.style.display = 'none';
      ueInfoCard.style.display = 'block';

      if (selectedSave && selectedSave.meta && selectedSave.meta.chapter) {
        ueChapterVal.textContent = `${selectedSave.meta.chapter} (${selectedSave.meta.checkpoint || 'Чекпоинт'}) • Прыжков: ${selectedSave.meta.jumps || 0}`;
      } else {
        ueChapterVal.textContent = 'Split Fiction Campaign Save';
      }
    } else {
      appLogoBadge.textContent = '🧟';
      engineIcon.textContent = '🧬';
      engineDetectedText.textContent = gameTitle || 'RE Engine (Resident Evil Requiem)';
      engineDetectedText.style.color = '#38bdf8';

      lblSourceId.textContent = currentDirection === 'ps52pc' ? 'Исходный PS5 ID:' : 'Исходный SteamID (ПК):';
      lblTargetId.textContent = currentDirection === 'ps52pc' ? 'Целевой SteamID (ПК):' : 'Целевой ID (PS5):';

      if (currentDirection === 'pc2ps5') {
        inputSourceId.value = '76561197960285355';
        inputTargetId.value = '394424879635983';
      } else if (currentDirection === 'ps52pc') {
        inputSourceId.value = '394424879635983';
        inputTargetId.value = '76561197960285355';
      }

      inputGameId.value = 'PPSA30803';

      ps5TargetOptionsCard.style.display = currentDirection === 'pc2ps5' ? 'block' : 'none';
      patchesBanner.style.display = currentDirection === 'pc2ps5' ? 'flex' : 'none';
      ueInfoCard.style.display = 'none';
    }
  }

  // Load saves from directory
  async function loadSaves(dirPath, engineHint = 'auto') {
    savesListEl.innerHTML = '<div class="loading-spinner">Поиск и анализ сохранений...</div>';
    try {
      let url = '/api/saves';
      const params = [];
      if (dirPath) params.push(`dir=${encodeURIComponent(dirPath)}`);
      if (engineHint) params.push(`engine=${encodeURIComponent(engineHint)}`);
      if (params.length) url += `?${params.join('&')}`;

      const res = await fetch(url);
      const data = await res.json();

      currentDir = data.current_dir;
      defaultReDir = data.default_re_dir;
      defaultSfDir = data.default_sf_dir;
      defaultOutputDir = data.default_output_dir;
      pcSaveDirPathEl.textContent = currentDir;

      if (!inputOutputDir.value) {
        inputOutputDir.value = defaultOutputDir;
      }

      savesData = data.saves || [];
      systemSaveData = data.system_save || null;

      // Filter by engine if user selected explicit pill
      let displaySaves = savesData;
      if (engineFilter !== 'auto') {
        displaySaves = savesData.filter(s => s.engine === engineFilter);
      }

      const detectedEngine = data.detected_engine || 're_engine';
      const detectedGame = data.detected_game || 'Resident Evil Requiem';
      applyEngineTheme(engineFilter === 'auto' ? detectedEngine : engineFilter, detectedGame);

      selectedSave = displaySaves.find(s => s.is_latest) || displaySaves[0] || null;
      renderSaves(displaySaves);

      log(`Загружено сохранений: ${displaySaves.length} (Движок: ${activeDetectedEngine.toUpperCase()})`);
    } catch (err) {
      savesListEl.innerHTML = `<div class="loading-spinner" style="color: #ef4444;">Ошибка: ${err.message}</div>`;
      log(`Ошибка подключения к бэкенду: ${err.message}`);
    }
  }

  function renderSaves(savesToRender = savesData) {
    if (!savesToRender.length) {
      savesListEl.innerHTML = '<div class="loading-spinner">Сохранений в этой папке не найдено. Вы можете загрузить архив, папку или отдельный файл.</div>';
      return;
    }

    savesListEl.innerHTML = '';

    savesToRender.forEach((save) => {
      const isSelected = selectedSave && selectedSave.name === save.name;
      const card = document.createElement('div');
      card.className = `save-card ${save.is_latest ? 'latest' : ''} ${isSelected ? 'selected' : ''}`;

      const title = getSlotTitle(save);
      const engineBadge = save.engine === 'unreal_engine'
        ? '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);">⚡ Unreal Engine</span>'
        : '<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">🧬 RE Engine</span>';

      card.innerHTML = `
        <div class="radio-custom ${isSelected ? 'checked' : ''}">
          <div class="radio-inner"></div>
        </div>
        <div class="save-info">
          <div class="save-top-row">
            <span class="save-title">${title}</span>
            <span class="save-filename">${save.name}</span>
            ${engineBadge}
            ${save.is_latest ? '<span class="badge badge-latest">✨ Самый свежий</span>' : ''}
          </div>
          <div class="save-meta">
            <span class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${save.mtime_str}</span>
            <span class="meta-item"><svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> ${save.size_str}</span>
            <span class="meta-item" style="color: #94a3b8;">${save.type}</span>
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
        const radio = card.querySelector('.radio-custom');
        if (radio) radio.classList.add('checked');

        if (save.engine) {
          applyEngineTheme(save.engine, save.game);
        }

        btnConvertSelectedText.textContent = `Конвертировать «${save.name}»`;
        log(`Выбран сейв: ${save.name} (${save.type}, ${save.engine_label || save.engine})`);
      });

      savesListEl.appendChild(card);
    });

    if (selectedSave) {
      btnConvertSelectedText.textContent = `Конвертировать «${selectedSave.name}»`;
    }
  }

  // Engine Pill Switcher
  [pillEngineAuto, pillEngineRE, pillEngineUE].forEach(pill => {
    pill.addEventListener('click', () => {
      [pillEngineAuto, pillEngineRE, pillEngineUE].forEach(p => p.classList.remove('active', 'ue'));
      pill.classList.add('active');
      if (pill === pillEngineUE) pill.classList.add('ue');

      engineFilter = pill.dataset.engine;
      log(`Режим движка переключен: ${pill.textContent}`);

      if (engineFilter === 're_engine') {
        loadSaves(defaultReDir, 're_engine');
      } else if (engineFilter === 'unreal_engine') {
        loadSaves(defaultSfDir, 'unreal_engine');
      } else {
        loadSaves(currentDir, 'auto');
      }
    });
  });

  // Check PS5 Garlic SaveMgr status
  async function checkPs5Status() {
    try {
      const res = await fetch('/api/ps5_status');
      const data = await res.json();
      if (data.online) {
        isPs5Online = true;
        ps5StatusIndicator.className = 'status-indicator online';
        const total = (data.data && data.data.saves) ? data.data.saves.length : '?';
        ps5StatusText.textContent = `PS5 онлайн (${total} сейвов)`;
        if (lastConvertedFile) {
          btnDirectUploadPs5.style.display = 'block';
        }
      } else {
        isPs5Online = false;
        ps5StatusIndicator.className = 'status-indicator';
        ps5StatusText.textContent = 'PS5 офлайн (порт 8082)';
        btnDirectUploadPs5.style.display = 'none';
      }
    } catch {
      isPs5Online = false;
      ps5StatusIndicator.className = 'status-indicator';
      ps5StatusText.textContent = 'PS5 не подключена';
      btnDirectUploadPs5.style.display = 'none';
    }
  }

  // Direction tabs
  document.querySelectorAll('.direction-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.direction-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentDirection = tab.dataset.direction;

      applyEngineTheme(activeDetectedEngine);
      log(`Направление конвертации: ${currentDirection}`);
    });
  });

  // Target mode for RE
  [modeCardAuto, modeCardSlot].forEach(card => {
    card.addEventListener('click', () => {
      [modeCardAuto, modeCardSlot].forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        targetMode = radio.value;
      }
    });
  });

  // Upload handler (files & archives)
  async function uploadFiles(files) {
    if (!files || !files.length) return;
    const file = files[0];
    log(`Загрузка на сервер: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

    try {
      const url = `/api/upload?name=${encodeURIComponent(file.name)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      });
      const data = await res.json();

      if (data.success) {
        currentDir = data.current_dir;
        pcSaveDirPathEl.textContent = currentDir;
        savesData = data.saves || [];
        selectedSave = savesData[0] || null;

        const detEngine = data.detected_engine || 're_engine';
        const detGame = data.detected_game || 'Resident Evil';
        applyEngineTheme(detEngine, detGame);

        renderSaves(savesData);
        log(`✓ Успешно распаковано / загружено: ${savesData.length} сохранений найдено! Движок: ${detEngine.toUpperCase()}`);
      } else {
        log(`❌ Ошибка загрузки: ${data.error || 'Неизвестная ошибка'}`);
      }
    } catch (e) {
      log(`❌ Ошибка передачи файла: ${e.message}`);
    }
  }

  // Drag & drop
  ['dragenter', 'dragover'].forEach(evt => {
    dropZoneArea.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneArea.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZoneArea.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneArea.classList.remove('drag-over');
    });
  });

  dropZoneArea.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  btnUploadFile.addEventListener('click', () => fileInput.click());
  btnUploadFolder.addEventListener('click', () => folderInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files) uploadFiles(fileInput.files);
  });
  folderInput.addEventListener('change', () => {
    if (folderInput.files) uploadFiles(folderInput.files);
  });

  btnDefaultReDir.addEventListener('click', () => {
    engineFilter = 're_engine';
    pillEngineRE.click();
  });

  btnDefaultSfDir.addEventListener('click', () => {
    engineFilter = 'unreal_engine';
    pillEngineUE.click();
  });

  // Convert selected save
  btnConvertSelected.addEventListener('click', async () => {
    if (!selectedSave) {
      alert('Пожалуйста, выберите сохранение из списка!');
      return;
    }

    let targetName = '';
    if (activeDetectedEngine === 'unreal_engine') {
      targetName = currentDirection === 'pc2ps5' ? 'ue4savegame.dpx.sav' : 'SaveData.Split';
    } else {
      if (currentDirection === 'pc2ps5') {
        targetName = targetMode === 'auto' ? 'data000.bin' : selectedSave.name;
      } else {
        targetName = selectedSave.name;
      }
    }

    log(`Запуск конвертации сейва: ${selectedSave.name} -> ${targetName} (${activeDetectedEngine})...`);

    const payload = {
      source_file: selectedSave.path,
      target_name: targetName,
      mode: currentDirection,
      engine: activeDetectedEngine,
      source_id: inputSourceId.value.trim(),
      target_id: inputTargetId.value.trim(),
      output_dir: inputOutputDir.value.trim(),
      game_id: inputGameId.value.trim(),
      use_game_folder: chkUseGameFolder.checked,
      region_hash: inputRegionHash.value.trim(),
      app_version: inputAppVersion.value.trim()
    };

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        lastConvertedFile = data.output_file;
        log(`✓ УСПЕШНО!\nГотовый файл: ${data.output_file}\n${data.log || ''}`);
        if (isPs5Online) {
          btnDirectUploadPs5.style.display = 'block';
        }
      } else {
        log(`❌ Ошибка: ${data.error}\n${data.log || ''}`);
      }
    } catch (e) {
      log(`❌ Ошибка выполнения запроса: ${e.message}`);
    }
  });

  // Convert batch
  btnConvertBatch.addEventListener('click', async () => {
    if (!confirm('Вы уверены, что хотите сконвертировать ВСЕ сохранения в текущей папке?')) {
      return;
    }

    log(`Запуск пакетной конвертации из папки ${currentDir}...`);

    const payload = {
      source_dir: currentDir,
      mode: currentDirection,
      engine: activeDetectedEngine,
      source_id: inputSourceId.value.trim(),
      target_id: inputTargetId.value.trim(),
      output_dir: inputOutputDir.value.trim(),
      game_id: inputGameId.value.trim(),
      use_game_folder: chkUseGameFolder.checked,
      region_hash: inputRegionHash.value.trim(),
      app_version: inputAppVersion.value.trim()
    };

    try {
      const res = await fetch('/api/convert_batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        log(`✓ ПАКЕТНАЯ КОНВЕРТАЦИЯ ЗАВЕРШЕНА!\nВсе файлы сохранены в: ${data.output_dir}\n${data.log || ''}`);
      } else {
        log(`❌ Ошибка пакетной конвертации: ${data.error}\n${data.log || ''}`);
      }
    } catch (e) {
      log(`❌ Ошибка запроса: ${e.message}`);
    }
  });

  // Direct upload to PS5 Garlic SaveMgr
  btnDirectUploadPs5.addEventListener('click', async () => {
    if (!lastConvertedFile) {
      alert('Сначала сконвертируйте файл сохранения!');
      return;
    }

    if (!confirm(`Отправить готовый файл ${lastConvertedFile.split('/').pop()} напрямую на PS5 через Garlic SaveMgr?`)) {
      return;
    }

    log(`📡 Загрузка на PS5: отправка файла ${lastConvertedFile}...`);
    try {
      const res = await fetch('/api/upload_to_ps5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: lastConvertedFile,
          engine: activeDetectedEngine
        })
      });
      const data = await res.json();

      if (data.success) {
        log(`✓ УСПЕШНО ЗАГРУЖЕНО НА PS5!\nTitle ID: ${data.target_title_id} (слот #${data.target_idx})\nФайл: ${data.uploaded_file}\nСлот размонтирован (Unmounted) успешно.`);
      } else {
        log(`❌ Ошибка загрузки на PS5: ${data.error}`);
      }
    } catch (e) {
      log(`❌ Ошибка связи с PS5: ${e.message}`);
    }
  });

  // Open output folder
  btnOpenFolder.addEventListener('click', () => {
    fetch('/api/open_folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: inputOutputDir.value.trim() })
    });
  });

  // Clear log
  btnClearLog.addEventListener('click', () => {
    consoleOutput.textContent = 'Лог очищен.';
  });

  // Advanced accordion
  btnToggleAdvanced.addEventListener('click', () => {
    const isHidden = advancedBody.style.display === 'none';
    advancedBody.style.display = isHidden ? 'block' : 'none';
    advancedArrow.textContent = isHidden ? '▲' : '▼';
  });

  // Region preset selector
  selectRegionPreset.addEventListener('change', () => {
    const val = selectRegionPreset.value;
    if (val === 'ps5_eu_us') inputRegionHash.value = '3208943443';
    else if (val === 'pc_global') inputRegionHash.value = '1874947740';
  });

  // Version preset selector
  selectVersionPreset.addEventListener('change', () => {
    const val = selectVersionPreset.value;
    if (val === 'ps5_102') inputAppVersion.value = '16785408';
    else if (val === 'pc_1012') inputAppVersion.value = '16781314';
  });

  // Initial load
  loadSaves();
  checkPs5Status();
  setInterval(checkPs5Status, 4000);
});
