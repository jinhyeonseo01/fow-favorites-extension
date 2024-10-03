// ==UserScript==
// @name         fow.lol - 즐겨찾기 확장
// @namespace    https://github.com/jinhyeonseo01/fow-favorites-extension
// @version      2024-10-02
// @description  즐겨찾기 가시성을 높혀주는 확장
// @author       Nikuname, Clrain
// @match        https://fow.lol/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=fow.lol
// @updateURL    https://raw.githubusercontent.com/jinhyeonseo01/fow-favorites-extension/refs/heads/main/src/fow-lol-favorites.js
// @downloadURL  https://raw.githubusercontent.com/jinhyeonseo01/fow-favorites-extension/refs/heads/main/src/fow-lol-favorites.js
// @grant        none
// ==/UserScript==


(function() {
  'use strict';

  let a = document.createElement("div");
  //document.getElementById("content-container").insertBefore(a,
  //document.getElementById("content-container").firstElementChild);
  document.getElementById("content-container").appendChild(a);
  document.getElementById("content-container").style.position = 'relative';
  document.getElementById("content-container").style.display = 'flex';

  a.innerHTML = `
  <div id="app">
    <div id="groupContainer"></div>
    <div id="form">
      <div id="newTagForm">
        <input type="text" id="newTagInput" placeholder="새 태그 추가">
        <select id="groupSelect"></select>
        <button id="addTagButton">태그 추가</button>
      </div>
      <div id="groupManagement">
        <input type="text" id="newGroupInput" placeholder="새 그룹 이름">
        <button id="addGroupButton">그룹 추가</button>
      </div>
    </div>
  </div>
  `;


  const style = document.createElement('style');
  style.textContent = `
  #app { font-family: Arial, sans-serif; }
  #groupContainer { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 5px; }
  #app
  .group { border: 1px solid #ccc; padding: 10px; min-width: 100px; min-height: 50px; position: relative; max-width: 295px;}
  #app
  .group h3 { margin-top: 0; padding-right: 20px; }
  #app
  .tag {
    display: inline-block;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 5px 8px;
    margin: 1px;
    cursor: pointer;
    position: relative;
  }
  #app
  .tag:hover {
    background-color: #e0e0e0;
  }
  #app
  .tag-text {
    color: #333;
    text-decoration: none;
  }
  #app
  .tag .delete {
    color: #999;
    margin-left: 5px;
    cursor: pointer;
    font-size: 0.8em;
    vertical-align: middle;
  }
  #app
  .tag .delete:hover {
    color: red;
  }
  #app
  .group .delete-group {
    color: #999;
    position: absolute;
    top: 5px;
    right: 5px;
    cursor: pointer;
  }
  #app
  .group .delete-group:hover {
    color: red;
  }
  #form { display: flex;flex-direction: row; gap: 15px;}
  `;
  /*
  #newTagForm { margin-top: 10px; }
  #groupManagement { margin-top: 10px; }
  */

  a.appendChild(style);


  function initGroups() {
  const storedGroups = localStorage.getItem('tagGroups');
  if (storedGroups) {
    return JSON.parse(storedGroups);
  } else {
    // 초기 그룹 데이터
    const initialGroups = [
      { id: 'group1', name: '내 계정', tags: [] },
      { id: 'group2', name: '즐겨찾기', tags: [] }
    ];
    localStorage.setItem('tagGroups', JSON.stringify(initialGroups));
    return initialGroups;
  }
  }
  // 그룹 데이터를 저장하는 함수
  function saveGroups() {
  localStorage.setItem('tagGroups', JSON.stringify(groups));
  }

  // 그룹 데이터 초기화
  let groups = initGroups();

  // 그룹 렌더링 함수
// 그룹 렌더링 함수 (수정됨)
function renderGroups() {
  const container = document.getElementById('groupContainer');
  container.innerHTML = '';
  groups.forEach(group => {
    const groupElement = document.createElement('div');
    groupElement.className = 'group';
    groupElement.innerHTML = `
      <h3>${group.name}</h3>
      <span class="delete-group" data-group-id="${group.id}">X</span>
    `;
    group.tags.forEach(tag => {
      const tagElement = document.createElement('div');
      tagElement.className = 'tag';
      tagElement.draggable = true;
      tagElement.innerHTML = `
        <span class="tag-text">${tag}</span>
        <span class="delete">X</span>
      `;
      tagElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete')) return;
        window.open(`https://fow.lol/find/kr/${encodeURIComponent(tag)}`, '_self');
      });
      tagElement.addEventListener('dragstart', dragStart);
      tagElement.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTag(group.id, tag);
      });
      groupElement.appendChild(tagElement);
    });
    groupElement.addEventListener('dragover', dragOver);
    groupElement.addEventListener('drop', drop);
    groupElement.querySelector('.delete-group').addEventListener('click', () => deleteGroup(group.id));
    container.appendChild(groupElement);
  });
  updateGroupSelect();
  saveGroups();
}

// 드래그 앤 드롭 이벤트 핸들러 (수정됨)
function dragStart(e) {
  e.dataTransfer.setData('text/plain', JSON.stringify({
    tag: e.currentTarget.querySelector('.tag-text').textContent,
    sourceGroupId: e.currentTarget.closest('.group').querySelector('h3').textContent
  }));
}

  function dragOver(e) {
  e.preventDefault();
  }

  function drop(e) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text'));
  const sourceGroupId = groups.find(g => g.name === data.sourceGroupId).id;
  const targetGroupId = e.target.closest('.group').querySelector('h3').textContent;
  const targetGroup = groups.find(g => g.name === targetGroupId);

  if (sourceGroupId !== targetGroup.id) {
    const sourceGroup = groups.find(g => g.id === sourceGroupId);
    sourceGroup.tags = sourceGroup.tags.filter(t => t !== data.tag);
    targetGroup.tags.push(data.tag);
    renderGroups();
  }
  }

  // 태그 삭제 함수
  function deleteTag(groupId, tag) {
  const group = groups.find(g => g.id === groupId);
  group.tags = group.tags.filter(t => t !== tag);
  renderGroups();
  }

  // 그룹 삭제 함수
  function deleteGroup(groupId) {
  groups = groups.filter(g => g.id !== groupId);
  for(let i=0;i<groups.length;i++) {
    groups[i].id = "group"+i;
  }
  renderGroups();
  }

  // 새 태그 추가 폼 설정
  function setupNewTagForm() {
    let lastPart = window.location.href.split('/').pop();
    lastPart = decodeURIComponent(lastPart);
    // 마지막 부분을 '-'로 split
    let splitParts = lastPart.split('-');

    // split된 두 부분을 '#'로 합침
    let result = `${splitParts[0]}#${splitParts[1]}`;
    console.log(result);
    document.getElementById('newTagInput').value = result;

  const addTagButton = document.getElementById('addTagButton');
  addTagButton.addEventListener('click', () => {
    const input = document.getElementById('newTagInput');
    const select = document.getElementById('groupSelect');
    const groupId = select.value;
    if (input.value.trim() && groupId) {
      const group = groups.find(g => g.id === groupId);
      group.tags.push(input.value.trim());
      input.value = '';
      renderGroups();
    }
  });
  }

  // 그룹 선택 업데이트
  function updateGroupSelect() {
  const select = document.getElementById('groupSelect');
  select.innerHTML = '';
  groups.forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    select.appendChild(option);
  });
  }

  // 새 그룹 추가 기능 설정
  function setupGroupManagement() {
  const addGroupButton = document.getElementById('addGroupButton');
  addGroupButton.addEventListener('click', () => {
    const input = document.getElementById('newGroupInput');
    if (input.value.trim()) {
      const newGroupId = 'group' + (groups.length);
      groups.push({
        id: newGroupId,
        name: input.value.trim(),
        tags: []
      });
      input.value = '';
      renderGroups();
    }
  });
  }

  // 초기 렌더링 및 이벤트 리스너 설정
  renderGroups();
  setupNewTagForm();
  setupGroupManagement();
  // Your code here...

  let b = document.createElement("p");
  b.innerText = "by) 니크네임";
  b.style.textAlign = "right";
  b.style.fontSize = "10px";
  b.style.fontStyle = "italic";
  b.style.color = "darkgray";
  a.appendChild(b);
})();