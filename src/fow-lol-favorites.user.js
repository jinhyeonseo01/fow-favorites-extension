// ==UserScript==
// @name         fow.lol - 즐겨찾기 확장
// @namespace    https://github.com/jinhyeonseo01/fow-favorites-extension
// @version      2026-05-25
// @description  fow.lol 전적 페이지에 그룹형 즐겨찾기 패널을 추가합니다.
// @author       Nikuname, Clrain
// @match        https://www.fow.lol/*
// @match        https://fow.lol/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=fow.lol
// @updateURL    https://raw.githubusercontent.com/jinhyeonseo01/fow-favorites-extension/refs/heads/main/src/fow-lol-favorites.user.js
// @downloadURL  https://raw.githubusercontent.com/jinhyeonseo01/fow-favorites-extension/refs/heads/main/src/fow-lol-favorites.user.js
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const APP_ID = 'fow-favorites-app';
  const STORAGE_KEY = 'fowFavorites.groups.v2';
  const LEGACY_STORAGE_KEY = 'tagGroups';
  const UI_STORAGE_KEY = 'fowFavorites.ui.v1';
  const DEFAULT_GROUPS = [
    { id: 'group-account', name: '내 계정', tags: [] },
    { id: 'group-favorites', name: '즐겨찾기', tags: [] }
  ];

  let groups = [];
  let selectedGroupId = '';
  let messageTimer = null;
  let dragState = null;

  waitForPage().then(mount).catch((error) => {
    console.warn('[FOW Favorites] mount failed:', error);
  });

  function waitForPage(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('content-container') || document.body;
      if (existing) {
        resolve(existing);
        return;
      }

      const startedAt = Date.now();
      const observer = new MutationObserver(() => {
        const target = document.getElementById('content-container') || document.body;
        if (target) {
          observer.disconnect();
          resolve(target);
        } else if (Date.now() - startedAt > timeoutMs) {
          observer.disconnect();
          reject(new Error('target container was not found'));
        }
      });

      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    });
  }

  function mount() {
    if (document.getElementById(APP_ID)) return;

    groups = loadGroups();
    selectedGroupId = groups[0]?.id || '';

    const app = document.createElement('aside');
    app.id = APP_ID;
    app.setAttribute('aria-label', 'FOW 즐겨찾기');
    app.innerHTML = `
      <div class="ff-panel">
        <header class="ff-header">
          <div>
            <strong>FOW 즐겨찾기</strong>
            <span class="ff-current" data-role="current-tag"></span>
          </div>
          <button type="button" class="ff-icon-button" data-action="toggle-panel" title="접기">-</button>
        </header>
        <section class="ff-controls" data-role="controls">
          <form class="ff-row" data-action="add-tag">
            <input type="text" class="ff-input" data-role="tag-input" placeholder="소환사#KR1">
            <select class="ff-select" data-role="group-select" aria-label="태그를 추가할 그룹"></select>
            <button type="submit" class="ff-button">추가</button>
          </form>
          <form class="ff-row" data-action="add-group">
            <input type="text" class="ff-input" data-role="group-input" placeholder="새 그룹 이름">
            <button type="submit" class="ff-button ff-secondary">그룹</button>
          </form>
          <p class="ff-message" data-role="message" aria-live="polite"></p>
        </section>
        <section class="ff-groups" data-role="groups"></section>
        <footer class="ff-footer">by) 니크네임</footer>
      </div>
    `;

    document.body.appendChild(app);
    document.head.appendChild(createStyles());
    bindEvents(app);
    setPanelCollapsed(Boolean(readStorage(UI_STORAGE_KEY)?.collapsed), false);

    const currentTag = getCurrentSummonerTag();
    if (currentTag) {
      app.querySelector('[data-role="tag-input"]').value = currentTag;
      app.querySelector('[data-role="current-tag"]').textContent = currentTag;
    }

    render();
  }

  function createStyles() {
    const style = document.createElement('style');
    style.id = `${APP_ID}-style`;
    style.textContent = `
      #${APP_ID} {
        position: fixed;
        top: 86px;
        right: 14px;
        width: min(360px, calc(100vw - 28px));
        max-height: calc(100vh - 110px);
        z-index: 2147483000;
        color: #202124;
        font: 13px/1.45 Arial, sans-serif;
      }

      #${APP_ID} * {
        box-sizing: border-box;
      }

      #${APP_ID}.is-collapsed {
        width: auto;
      }

      #${APP_ID}.is-collapsed .ff-controls,
      #${APP_ID}.is-collapsed .ff-groups,
      #${APP_ID}.is-collapsed .ff-footer,
      #${APP_ID}.is-collapsed .ff-current {
        display: none;
      }

      #${APP_ID} .ff-panel {
        overflow: hidden;
        max-height: inherit;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
      }

      #${APP_ID} .ff-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 10px 8px;
        border-bottom: 1px solid #d7dce2;
        background: #f6f8fa;
      }

      #${APP_ID} .ff-current {
        display: block;
        max-width: 280px;
        overflow: hidden;
        margin-top: 2px;
        color: #5f6b7a;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${APP_ID} .ff-controls {
        padding: 10px;
        border-bottom: 1px solid #e6e9ee;
      }

      #${APP_ID} .ff-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 94px 54px;
        gap: 6px;
        margin: 0 0 7px;
      }

      #${APP_ID} .ff-row[data-action="add-group"] {
        grid-template-columns: minmax(0, 1fr) 54px;
      }

      #${APP_ID} .ff-input,
      #${APP_ID} .ff-select {
        min-width: 0;
        height: 30px;
        border: 1px solid #cbd3dc;
        border-radius: 6px;
        background: #fff;
        color: #202124;
        font: inherit;
        padding: 4px 7px;
      }

      #${APP_ID} .ff-button,
      #${APP_ID} .ff-icon-button {
        height: 30px;
        border: 1px solid #5b6f86;
        border-radius: 6px;
        background: #2f5f8f;
        color: #fff;
        cursor: pointer;
        font: inherit;
        padding: 0 8px;
      }

      #${APP_ID} .ff-secondary,
      #${APP_ID} .ff-icon-button {
        border-color: #aeb7c2;
        background: #fff;
        color: #26313d;
      }

      #${APP_ID} .ff-button:hover,
      #${APP_ID} .ff-icon-button:hover {
        filter: brightness(0.96);
      }

      #${APP_ID} .ff-message {
        min-height: 18px;
        margin: 0;
        color: #3d6f36;
        font-size: 12px;
      }

      #${APP_ID} .ff-message.is-error {
        color: #b3261e;
      }

      #${APP_ID} .ff-groups {
        display: grid;
        gap: 8px;
        overflow: auto;
        max-height: calc(100vh - 285px);
        padding: 10px;
      }

      #${APP_ID} .ff-group {
        border: 1px solid #d8dee7;
        border-radius: 8px;
        background: #fff;
      }

      #${APP_ID} .ff-group.is-drop-target {
        border-color: #2f5f8f;
        box-shadow: 0 0 0 2px rgba(47, 95, 143, 0.15);
      }

      #${APP_ID} .ff-group-header {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) repeat(3, 24px);
        align-items: center;
        gap: 4px;
        padding: 6px;
        border-bottom: 1px solid #eef1f5;
      }

      #${APP_ID} .ff-drag-handle {
        color: #6b7280;
        cursor: grab;
        text-align: center;
        user-select: none;
      }

      #${APP_ID} .ff-group-name {
        min-width: 0;
        height: 26px;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        color: #202124;
        font: 700 13px/1.4 Arial, sans-serif;
        padding: 2px 5px;
      }

      #${APP_ID} .ff-group-name:focus {
        border-color: #9ab5d0;
        background: #fff;
        outline: none;
      }

      #${APP_ID} .ff-mini-button {
        width: 24px;
        height: 24px;
        border: 1px solid transparent;
        border-radius: 5px;
        background: transparent;
        color: #4b5563;
        cursor: pointer;
        line-height: 20px;
        padding: 0;
      }

      #${APP_ID} .ff-mini-button:hover {
        border-color: #d0d7df;
        background: #f3f6f9;
      }

      #${APP_ID} .ff-mini-button[data-action="delete-group"]:hover,
      #${APP_ID} .ff-tag-delete:hover {
        color: #b3261e;
      }

      #${APP_ID} .ff-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        min-height: 43px;
        padding: 8px;
      }

      #${APP_ID} .ff-empty {
        width: 100%;
        color: #8a94a3;
        font-size: 12px;
      }

      #${APP_ID} .ff-tag {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 28px;
        border: 1px solid #cbd3dc;
        border-radius: 6px;
        background: #f7f9fb;
        cursor: pointer;
        overflow: hidden;
      }

      #${APP_ID} .ff-tag:hover {
        background: #eef4fb;
      }

      #${APP_ID} .ff-tag-name {
        overflow: hidden;
        max-width: 240px;
        padding: 5px 6px 5px 8px;
        color: #1f2937;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${APP_ID} .ff-tag-delete {
        align-self: stretch;
        width: 24px;
        border: 0;
        border-left: 1px solid #d8dee7;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
      }

      #${APP_ID} .ff-footer {
        padding: 4px 9px 7px;
        color: #8a94a3;
        font-size: 10px;
        font-style: italic;
        text-align: right;
      }

      @media (max-width: 720px) {
        #${APP_ID} {
          top: auto;
          right: 8px;
          bottom: 8px;
          width: calc(100vw - 16px);
          max-height: 72vh;
        }

        #${APP_ID} .ff-groups {
          max-height: calc(72vh - 185px);
        }
      }
    `;
    return style;
  }

  function bindEvents(app) {
    app.addEventListener('submit', handleSubmit);
    app.addEventListener('click', handleClick);
    app.addEventListener('change', handleChange);
    app.addEventListener('keydown', handleKeydown);
    app.addEventListener('dragstart', handleDragStart);
    app.addEventListener('dragover', handleDragOver);
    app.addEventListener('dragleave', handleDragLeave);
    app.addEventListener('drop', handleDrop);
    app.addEventListener('dragend', clearDragState);
  }

  function handleSubmit(event) {
    const form = event.target.closest('form');
    if (!form) return;
    event.preventDefault();

    if (form.dataset.action === 'add-tag') {
      const input = document.querySelector(`#${APP_ID} [data-role="tag-input"]`);
      const select = document.querySelector(`#${APP_ID} [data-role="group-select"]`);
      addTag(select.value, input.value);
      input.value = '';
      input.focus();
      return;
    }

    if (form.dataset.action === 'add-group') {
      const input = document.querySelector(`#${APP_ID} [data-role="group-input"]`);
      addGroup(input.value);
      input.value = '';
    }
  }

  function handleClick(event) {
    const actionEl = event.target.closest('[data-action]');
    const tagEl = event.target.closest('.ff-tag');

    if (actionEl?.dataset.action === 'toggle-panel') {
      const app = document.getElementById(APP_ID);
      setPanelCollapsed(!app.classList.contains('is-collapsed'));
      return;
    }

    if (actionEl?.dataset.action === 'delete-tag') {
      removeTag(actionEl.dataset.groupId, actionEl.dataset.tagId);
      return;
    }

    if (actionEl?.dataset.action === 'delete-group') {
      removeGroup(actionEl.dataset.groupId);
      return;
    }

    if (actionEl?.dataset.action === 'move-group-up') {
      moveGroup(actionEl.dataset.groupId, -1);
      return;
    }

    if (actionEl?.dataset.action === 'move-group-down') {
      moveGroup(actionEl.dataset.groupId, 1);
      return;
    }

    if (tagEl && !event.target.closest('button')) {
      const tag = findTag(tagEl.dataset.groupId, tagEl.dataset.tagId);
      if (tag) {
        window.location.href = `https://www.fow.lol/find/kr/${tagToPath(tag.value)}`;
      }
    }
  }

  function handleChange(event) {
    if (event.target.matches('[data-role="group-select"]')) {
      selectedGroupId = event.target.value;
      return;
    }

    if (event.target.matches('.ff-group-name')) {
      renameGroup(event.target.dataset.groupId, event.target.value);
    }
  }

  function handleKeydown(event) {
    if (event.target.matches('.ff-group-name') && event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  }

  function handleDragStart(event) {
    const tagEl = event.target.closest('.ff-tag');
    const handleEl = event.target.closest('.ff-drag-handle');

    if (tagEl) {
      dragState = {
        type: 'tag',
        sourceGroupId: tagEl.dataset.groupId,
        tagId: tagEl.dataset.tagId
      };
    } else if (handleEl) {
      dragState = {
        type: 'group',
        groupId: handleEl.dataset.groupId
      };
    } else {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(dragState));
  }

  function handleDragOver(event) {
    const groupEl = event.target.closest('.ff-group');
    if (!groupEl || !dragState) return;

    if (dragState.type === 'tag' || (dragState.type === 'group' && dragState.groupId !== groupEl.dataset.groupId)) {
      event.preventDefault();
      groupEl.classList.add('is-drop-target');
    }
  }

  function handleDragLeave(event) {
    const groupEl = event.target.closest('.ff-group');
    if (!groupEl || groupEl.contains(event.relatedTarget)) return;
    groupEl.classList.remove('is-drop-target');
  }

  function handleDrop(event) {
    const groupEl = event.target.closest('.ff-group');
    if (!groupEl || !dragState) return;

    event.preventDefault();
    document.querySelectorAll(`#${APP_ID} .is-drop-target`).forEach((el) => {
      el.classList.remove('is-drop-target');
    });

    if (dragState.type === 'tag') {
      const targetTagEl = event.target.closest('.ff-tag');
      const beforeTagId = targetTagEl?.dataset.groupId === groupEl.dataset.groupId ? targetTagEl.dataset.tagId : null;
      moveTag(dragState.sourceGroupId, groupEl.dataset.groupId, dragState.tagId, beforeTagId);
    }

    if (dragState.type === 'group') {
      swapGroups(dragState.groupId, groupEl.dataset.groupId);
    }

    clearDragState();
  }

  function clearDragState() {
    dragState = null;
    document.querySelectorAll(`#${APP_ID} .is-drop-target`).forEach((el) => {
      el.classList.remove('is-drop-target');
    });
  }

  function render() {
    renderGroupSelect();
    renderGroups();
    saveGroups();
  }

  function renderGroupSelect() {
    const select = document.querySelector(`#${APP_ID} [data-role="group-select"]`);
    if (!select) return;

    const currentValue = selectedGroupId && groups.some((group) => group.id === selectedGroupId)
      ? selectedGroupId
      : groups[0]?.id || '';

    select.replaceChildren(...groups.map((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      option.selected = group.id === currentValue;
      return option;
    }));

    selectedGroupId = currentValue;
  }

  function renderGroups() {
    const container = document.querySelector(`#${APP_ID} [data-role="groups"]`);
    if (!container) return;

    container.replaceChildren(...groups.map((group, index) => createGroupElement(group, index)));
  }

  function createGroupElement(group, index) {
    const groupEl = document.createElement('article');
    groupEl.className = 'ff-group';
    groupEl.dataset.groupId = group.id;

    const header = document.createElement('div');
    header.className = 'ff-group-header';

    const handle = document.createElement('span');
    handle.className = 'ff-drag-handle';
    handle.textContent = '↕';
    handle.title = '그룹을 다른 그룹 위로 끌어 놓으면 위치가 서로 바뀝니다.';
    handle.draggable = true;
    handle.dataset.groupId = group.id;

    const nameInput = document.createElement('input');
    nameInput.className = 'ff-group-name';
    nameInput.value = group.name;
    nameInput.dataset.groupId = group.id;
    nameInput.setAttribute('aria-label', '그룹 이름');

    header.append(
      handle,
      nameInput,
      createMiniButton('move-group-up', group.id, '↑', '위로', index === 0),
      createMiniButton('move-group-down', group.id, '↓', '아래로', index === groups.length - 1),
      createMiniButton('delete-group', group.id, '×', '그룹 삭제', groups.length <= 1)
    );

    const tags = document.createElement('div');
    tags.className = 'ff-tags';
    tags.dataset.groupId = group.id;

    if (group.tags.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'ff-empty';
      empty.textContent = '태그를 이 그룹으로 끌어오거나 위에서 추가하세요.';
      tags.appendChild(empty);
    } else {
      group.tags.forEach((tag) => tags.appendChild(createTagElement(group.id, tag)));
    }

    groupEl.append(header, tags);
    return groupEl;
  }

  function createMiniButton(action, groupId, label, title, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ff-mini-button';
    button.dataset.action = action;
    button.dataset.groupId = groupId;
    button.textContent = label;
    button.title = title;
    button.disabled = Boolean(disabled);
    return button;
  }

  function createTagElement(groupId, tag) {
    const tagEl = document.createElement('div');
    tagEl.className = 'ff-tag';
    tagEl.draggable = true;
    tagEl.dataset.groupId = groupId;
    tagEl.dataset.tagId = tag.id;
    tagEl.title = '클릭하면 전적 페이지로 이동합니다.';

    const name = document.createElement('span');
    name.className = 'ff-tag-name';
    name.textContent = tag.value;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ff-tag-delete';
    remove.dataset.action = 'delete-tag';
    remove.dataset.groupId = groupId;
    remove.dataset.tagId = tag.id;
    remove.textContent = '×';
    remove.title = '태그 삭제';

    tagEl.append(name, remove);
    return tagEl;
  }

  function addTag(groupId, rawValue) {
    const value = normalizeTagValue(rawValue);
    const targetGroup = groups.find((group) => group.id === groupId);

    if (!targetGroup) {
      showMessage('태그를 추가할 그룹을 선택하세요.', true);
      return;
    }

    if (!value) {
      showMessage('태그 이름을 입력하세요.', true);
      return;
    }

    const existing = findTagLocation(value);
    if (existing) {
      if (existing.group.id === targetGroup.id) {
        showMessage('이미 이 그룹에 있는 태그입니다.', true);
        return;
      }

      existing.group.tags = existing.group.tags.filter((tag) => tag.id !== existing.tag.id);
      targetGroup.tags.push(existing.tag);
      selectedGroupId = targetGroup.id;
      render();
      showMessage('기존 태그를 선택한 그룹으로 이동했습니다.');
      return;
    }

    targetGroup.tags.push({ id: createId('tag'), value });
    selectedGroupId = targetGroup.id;
    render();
    showMessage('태그를 추가했습니다.');
  }

  function removeTag(groupId, tagId) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    const before = group.tags.length;
    group.tags = group.tags.filter((tag) => tag.id !== tagId);
    if (group.tags.length !== before) {
      render();
      showMessage('태그를 삭제했습니다.');
    }
  }

  function moveTag(sourceGroupId, targetGroupId, tagId, beforeTagId = null) {
    const sourceGroup = groups.find((group) => group.id === sourceGroupId);
    const targetGroup = groups.find((group) => group.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const tagIndex = sourceGroup.tags.findIndex((tag) => tag.id === tagId);
    if (tagIndex < 0) return;

    const [tag] = sourceGroup.tags.splice(tagIndex, 1);
    const duplicatedIndex = targetGroup.tags.findIndex((item) => isSameTag(item.value, tag.value));
    if (duplicatedIndex >= 0) {
      targetGroup.tags.splice(duplicatedIndex, 1);
    }

    const insertIndex = beforeTagId
      ? targetGroup.tags.findIndex((item) => item.id === beforeTagId)
      : -1;

    if (insertIndex >= 0) {
      targetGroup.tags.splice(insertIndex, 0, tag);
    } else {
      targetGroup.tags.push(tag);
    }

    selectedGroupId = targetGroup.id;
    render();
    showMessage(sourceGroupId === targetGroupId ? '태그 순서를 변경했습니다.' : '태그를 이동했습니다.');
  }

  function addGroup(rawName) {
    const name = normalizeGroupName(rawName);
    if (!name) {
      showMessage('그룹 이름을 입력하세요.', true);
      return;
    }

    if (groups.some((group) => group.name.trim().toLowerCase() === name.toLowerCase())) {
      showMessage('같은 이름의 그룹이 이미 있습니다.', true);
      return;
    }

    const group = { id: createId('group'), name, tags: [] };
    groups.push(group);
    selectedGroupId = group.id;
    render();
    showMessage('그룹을 추가했습니다.');
  }

  function removeGroup(groupId) {
    const group = groups.find((item) => item.id === groupId);
    if (!group || groups.length <= 1) return;

    if (group.tags.length > 0 && !window.confirm(`"${group.name}" 그룹과 태그 ${group.tags.length}개를 삭제할까요?`)) {
      return;
    }

    groups = groups.filter((item) => item.id !== groupId);
    if (selectedGroupId === groupId) {
      selectedGroupId = groups[0]?.id || '';
    }
    render();
    showMessage('그룹을 삭제했습니다.');
  }

  function renameGroup(groupId, rawName) {
    const group = groups.find((item) => item.id === groupId);
    const name = normalizeGroupName(rawName);
    if (!group) return;

    if (!name) {
      showMessage('그룹 이름은 비울 수 없습니다.', true);
      render();
      return;
    }

    const duplicate = groups.some((item) => item.id !== groupId && item.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showMessage('같은 이름의 그룹이 이미 있습니다.', true);
      render();
      return;
    }

    group.name = name;
    render();
    showMessage('그룹 이름을 변경했습니다.');
  }

  function moveGroup(groupId, direction) {
    const index = groups.findIndex((group) => group.id === groupId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return;

    [groups[index], groups[targetIndex]] = [groups[targetIndex], groups[index]];
    render();
    showMessage('그룹 위치를 변경했습니다.');
  }

  function swapGroups(sourceGroupId, targetGroupId) {
    if (sourceGroupId === targetGroupId) return;

    const sourceIndex = groups.findIndex((group) => group.id === sourceGroupId);
    const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    [groups[sourceIndex], groups[targetIndex]] = [groups[targetIndex], groups[sourceIndex]];
    render();
    showMessage('두 그룹의 위치를 바꿨습니다.');
  }

  function loadGroups() {
    const saved = readStorage(STORAGE_KEY);
    const legacy = readStorage(LEGACY_STORAGE_KEY);
    const source = Array.isArray(saved?.groups) ? saved.groups : Array.isArray(saved) ? saved : legacy;
    const normalized = normalizeGroups(source);
    return normalized.length > 0 ? normalized : cloneDefaultGroups();
  }

  function saveGroups() {
    const payload = { version: 2, groups };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    const legacyPayload = groups.map((group) => ({
      id: group.id,
      name: group.name,
      tags: group.tags.map((tag) => tag.value)
    }));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyPayload));
  }

  function readStorage(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn(`[FOW Favorites] invalid storage: ${key}`, error);
      return null;
    }
  }

  function normalizeGroups(source) {
    if (!Array.isArray(source)) return [];

    return source.map((group, index) => {
      const normalizedGroup = {
        id: typeof group?.id === 'string' && group.id ? group.id : createId('group'),
        name: normalizeGroupName(group?.name) || `그룹 ${index + 1}`,
        tags: []
      };

      const seen = new Set();
      const tags = Array.isArray(group?.tags) ? group.tags : [];
      tags.forEach((tag) => {
        const normalized = normalizeTag(tag);
        if (!normalized || seen.has(normalized.value.toLowerCase())) return;
        seen.add(normalized.value.toLowerCase());
        normalizedGroup.tags.push(normalized);
      });

      return normalizedGroup;
    });
  }

  function normalizeTag(tag) {
    const rawValue = typeof tag === 'string' ? tag : tag?.value || tag?.name || tag?.text;
    const value = normalizeTagValue(rawValue);
    if (!value) return null;

    return {
      id: typeof tag?.id === 'string' && tag.id ? tag.id : createId('tag'),
      value
    };
  }

  function normalizeTagValue(value) {
    if (typeof value !== 'string') return '';
    return value
      .trim()
      .replace(/\s+#/g, '#')
      .replace(/#\s+/g, '#');
  }

  function normalizeGroupName(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ');
  }

  function cloneDefaultGroups() {
    return DEFAULT_GROUPS.map((group) => ({
      id: group.id,
      name: group.name,
      tags: []
    }));
  }

  function findTag(groupId, tagId) {
    const group = groups.find((item) => item.id === groupId);
    return group?.tags.find((tag) => tag.id === tagId) || null;
  }

  function findTagLocation(value) {
    for (const group of groups) {
      const tag = group.tags.find((item) => isSameTag(item.value, value));
      if (tag) return { group, tag };
    }
    return null;
  }

  function isSameTag(left, right) {
    return normalizeTagValue(left).toLowerCase() === normalizeTagValue(right).toLowerCase();
  }

  function showMessage(text, isError = false) {
    const message = document.querySelector(`#${APP_ID} [data-role="message"]`);
    if (!message) return;

    window.clearTimeout(messageTimer);
    message.textContent = text;
    message.classList.toggle('is-error', Boolean(isError));
    messageTimer = window.setTimeout(() => {
      message.textContent = '';
      message.classList.remove('is-error');
    }, 2600);
  }

  function setPanelCollapsed(collapsed, shouldSave = true) {
    const app = document.getElementById(APP_ID);
    if (!app) return;

    const toggleButton = app.querySelector('[data-action="toggle-panel"]');
    app.classList.toggle('is-collapsed', collapsed);

    if (toggleButton) {
      toggleButton.textContent = collapsed ? '+' : '-';
      toggleButton.title = collapsed ? '펼치기' : '접기';
    }

    if (shouldSave) {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ collapsed }));
    }
  }

  function getCurrentSummonerTag() {
    const titleMatch = document.title.match(/^(.+?)\s+-\s+소환사 전적/);
    if (titleMatch?.[1]?.includes('#')) {
      return normalizeTagValue(titleMatch[1]);
    }

    const pathTag = parseFindPath(window.location.pathname);
    if (pathTag) return pathTag;

    const contentText = document.getElementById('content-container')?.innerText || '';
    const textMatch = contentText.match(/([^\n#]+#[A-Za-z0-9]+)/);
    return normalizeTagValue(textMatch?.[1] || '');
  }

  function parseFindPath(pathname) {
    const marker = '/find/kr/';
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return '';

    const encoded = pathname.slice(markerIndex + marker.length).split('/')[0];
    if (!encoded) return '';

    let decoded = '';
    try {
      decoded = decodeURIComponent(encoded.replace(/\+/g, ' '));
    } catch (error) {
      decoded = encoded.replace(/\+/g, ' ');
    }

    if (decoded.includes('#')) return normalizeTagValue(decoded);

    const separatorIndex = decoded.lastIndexOf('-');
    if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return normalizeTagValue(decoded);

    return normalizeTagValue(`${decoded.slice(0, separatorIndex)}#${decoded.slice(separatorIndex + 1)}`);
  }

  function tagToPath(value) {
    const normalized = normalizeTagValue(value);
    const hashIndex = normalized.lastIndexOf('#');
    const pathValue = hashIndex > 0
      ? `${normalized.slice(0, hashIndex)}-${normalized.slice(hashIndex + 1)}`
      : normalized;

    return encodeURIComponent(pathValue).replace(/%20/g, '+');
  }

  function createId(prefix) {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
})();
