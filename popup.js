// popup.js

document.addEventListener('DOMContentLoaded', () => {
  // 初始化journalSources
  initializeJournalSources().then(() => {
    renderCategories();
  });

  // 初始化自定义弹窗
  initCustomAlert();
  initCustomConfirm();

  const dropdown = document.getElementById('journal-dropdown');
  const dropdownButton = dropdown.querySelector('.dropdown-button');
  const addCategoryButton = document.getElementById('add-category-button');
  const exportCategoryButton = document.getElementById('export-category-button'); // 新增
  const importCategoryButton = document.getElementById('import-category-button'); // 新增
  const modal = document.getElementById('add-category-modal');
  const closeModal = document.getElementById('close-modal');
  const saveNewCategoryButton = document.getElementById('save-new-category');
  const importFileInput = document.getElementById('import-file-input'); // 新增

  // 打开/关闭下拉框
  dropdownButton.addEventListener('click', () => {
    dropdown.classList.toggle('active');
  });

  // 点击下拉框外部时关闭
  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target)) {
      dropdown.classList.remove('active');
    }
  });

  // 打开添加类别的模态框
  addCategoryButton.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  // 打开导出功能
  exportCategoryButton.addEventListener('click', () => {
    exportAllJournalRanges();
  });

  // 新增：打开导入功能
  importCategoryButton.addEventListener('click', () => {
    importFileInput.click();
  });

  // 处理文件导入
  importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const importedData = JSON.parse(e.target.result);
          if (validateImportedData(importedData)) {
            importJournalRanges(importedData);
          } else {
            showCustomAlert('导入的JSON格式不正确。请确保文件符合标准格式。');
          }
        } catch (error) {
          console.error('JSON解析错误:', error);
          showCustomAlert('无法解析JSON文件。请检查文件格式。');
        }
      };
      reader.readAsText(file);
    }
    // 重置文件输入
    event.target.value = '';
  });


  // 关闭模态框
  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // 在点击模态框外部时关闭
  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });

  // 保存新类别
  saveNewCategoryButton.addEventListener('click', () => {
    const categoryName = document.getElementById('new-category-name').value.trim();
    const journalsText = document.getElementById('new-category-journals').value.trim();

    if (!categoryName) {
      showCustomAlert('类别名称不能为空。');
      return;
    }

    if (!journalsText) {
      showCustomAlert('期刊名称不能为空。');
      return;
    }

    const journals = journalsText.split('\n').map(j => j.trim()).filter(j => j);

    if (journals.length === 0) {
      showCustomAlert('请至少输入一个期刊名称。');
      return;
    }

    addNewCategory(categoryName, journals).then(() => {
      modal.style.display = 'none';
      renderCategories();
      clearModalInputs();
    }).catch(err => {
      console.error('添加新类别时出错:', err);
      showCustomAlert('添加新类别失败，请重试。');
    });
  });

  const generateBtn = document.getElementById('generate-btn');
  const searchBtn = document.getElementById('search-btn');

  generateBtn.addEventListener('click', () => {
    generateAndCopyLink();
    savePreferences();
  });

  searchBtn.addEventListener('click', () => {
    directSearch();
    savePreferences();
  });

  // 读取并加载用户偏好
  loadPreferences();

  // 使用事件委托来处理删除按钮的点击
  document.getElementById('dropdown-content').addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-button')) {
      const category = e.target.getAttribute('data-category');
      deleteCategory(category);
    }
  });
});


// 初始化journalSources，如果不存在则设置默认值
async function initializeJournalSources() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
      if (!data.journalSources) {
        const defaultJournalSources = {
          '环境': [
            "Environmental Health Perspectives",
            "Environment International",
            "Journal of Hazardous Materials",
            "Environmental Science & Technology",
            "Nature Sustainability",
            "WATER RESEARCH",
            "Environmental Science and Ecotechnology"
          ],
          '综合': [
            "Nature Communications",
            "Science Advances",
            "Cell Reports",
            "Proceedings of the National Academy of Sciences"
          ],
          '医学': [
            "LANCET",
            "JAMA",
            "NEW ENGLAND JOURNAL OF MEDICINE",
            "NATURE MEDICINE"
          ]
          // 可根据需要添加更多类别和期刊源
        };
        const defaultCategoryOrder = ['环境', '综合', '医学'];
        chrome.storage.local.set({journalSources: defaultJournalSources, categoryOrder: defaultCategoryOrder}, () => {
          resolve();
        });
      } else if (!data.categoryOrder) {
        // 如果已经有journalSources但没有categoryOrder，则初始化
        const categories = Object.keys(data.journalSources);
        chrome.storage.local.set({categoryOrder: categories}, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}


// 渲染所有期刊类别
function renderCategories() {
  chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
    const journalSources = data.journalSources || {};
    const categoryOrder = data.categoryOrder || Object.keys(journalSources);
    const dropdownContent = document.getElementById('dropdown-content');

    // 清所有类别，保留"添加类别"、"导入类别"和"导出类别"按钮
    const existingCategories = dropdownContent.querySelectorAll('.category:not(#add-category):not(#import-category):not(#export-category)');
    existingCategories.forEach(cat => cat.remove());

    // 遍历所有类别并按照categoryOrder排序
    categoryOrder.forEach(category => {
      if (journalSources.hasOwnProperty(category)) {
        const journals = journalSources[category];

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';
        categoryDiv.setAttribute('data-category', category);
        categoryDiv.setAttribute('draggable', 'true'); // 使其可拖动

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.style.width = '100%';

        const categoryLeft = document.createElement('div');
        categoryLeft.className = 'category-left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'category-checkbox';
        checkbox.id = `${category}-checkbox`;
        checkbox.setAttribute('data-category', category);

        const label = document.createElement('label');
        label.htmlFor = `${category}-checkbox`;
        label.textContent = category;

        categoryLeft.appendChild(checkbox);
        categoryLeft.appendChild(label);

        const categoryRight = document.createElement('div');
        categoryRight.className = 'category-right';

        const infoSpan = document.createElement('span');
        infoSpan.className = 'category-info';
        infoSpan.setAttribute('data-category', category);
        infoSpan.textContent = '信息';

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.setAttribute('data-category', category);
        copyButton.textContent = '复制';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.setAttribute('data-category', category);
        deleteButton.textContent = '删除';

        // 添加拖动手柄
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '&#9776;'; // 使用汉堡菜单图标表示拖动

        categoryRight.appendChild(infoSpan);
        categoryRight.appendChild(copyButton);
        categoryRight.appendChild(deleteButton);
        categoryRight.appendChild(dragHandle); // 添加到右侧

        categoryHeader.appendChild(categoryLeft);
        categoryHeader.appendChild(categoryRight);

        categoryDiv.appendChild(categoryHeader);

        const journalsDiv = document.createElement('div');
        journalsDiv.className = 'journals';
        journalsDiv.id = `journals-${category}`;

        journals.forEach(journal => {
          const journalDiv = document.createElement('div');
          journalDiv.className = 'journal-item'; // 修改类名以便样式区分

          // 创建可编辑的文本输入框
          const journalInput = document.createElement('input');
          journalInput.type = 'text';
          journalInput.className = 'journal-input';
          journalInput.value = journal;
          journalInput.setAttribute('data-original', journal);

          // 创建删除按钮
          const deleteJournalBtn = document.createElement('button');
          deleteJournalBtn.className = 'delete-journal-btn';
          deleteJournalBtn.innerHTML = '×';
          deleteJournalBtn.title = '删除期刊';

          // 添加保存事件
          journalInput.addEventListener('change', (e) => {
            const newValue = e.target.value.trim();
            const originalValue = e.target.getAttribute('data-original');
            if (newValue !== originalValue) {
              updateJournalName(category, originalValue, newValue);
            }
          });

          // 添加删除事件
          deleteJournalBtn.addEventListener('click', () => {
            showCustomConfirm('确定要删除这个期刊吗？', (result) => {
              if (result) {
                removeJournal(category, journal);
                journalDiv.remove();
              }
            });
          });

          journalDiv.appendChild(journalInput);
          journalDiv.appendChild(deleteJournalBtn);
          journalsDiv.appendChild(journalDiv);
        });

        // 添加新期刊的输入框
        const addJournalDiv = document.createElement('div');
        addJournalDiv.className = 'add-journal-container';

        const newJournalInput = document.createElement('input');
        newJournalInput.type = 'text';
        newJournalInput.className = 'new-journal-input';
        newJournalInput.placeholder = '添加新期刊...';

        const addJournalBtn = document.createElement('button');
        addJournalBtn.className = 'add-journal-btn';
        addJournalBtn.textContent = '+';
        addJournalBtn.title = '添加期刊';

        addJournalBtn.addEventListener('click', () => {
          const newJournal = newJournalInput.value.trim();
          if (newJournal) {
            addJournalToCategory(category, newJournal);
            newJournalInput.value = '';
          }
        });

        addJournalDiv.appendChild(newJournalInput);
        addJournalDiv.appendChild(addJournalBtn);
        journalsDiv.appendChild(addJournalDiv);

        categoryDiv.appendChild(journalsDiv);

        // 添加拖动事件
        addDragAndDropHandlers(categoryDiv);

        // 在导入导出容器之前插入类别
        const importExportContainer = document.querySelector('.import-export-container');
        dropdownContent.insertBefore(categoryDiv, importExportContainer);
      }
    });

    // 渲染完成后重新绑定事件
    bindCategoryEvents();
  });
}


// 绑定类别相关的事件
function bindCategoryEvents() {
  const categoryInfos = document.querySelectorAll('.category-info');
  const copyButtons = document.querySelectorAll('.copy-button');

  // 处理"信息"点击事件
  categoryInfos.forEach(info => {
    info.addEventListener('click', (e) => {
      const category = e.target.getAttribute('data-category');
      const journalsDiv = document.getElementById(`journals-${category}`);
      if (journalsDiv) {
        journalsDiv.classList.toggle('visible');
      }
    });
  });

  // 处理复制按钮事件
  copyButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止触发其他事件
      const category = button.getAttribute('data-category');
      copyJournalsByCategory(category);
    });
  });

  // 注意：我们不再在这里绑定删除按钮的事件，因为我们使用了事件委托
}


// 复制指定类别的期刊源名称
function copyJournalsByCategory(category) {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources || {};
    if (journalSources.hasOwnProperty(category)) {
      const journals = journalSources[category];
      const journalList = journals.join('\n'); // 使用换行符分隔
      navigator.clipboard.writeText(journalList).then(() => {
        showCustomAlert(`已复制【${category}】类别的期刊源！`);
      }).catch(err => {
        console.error('复制失败:', err);
        showCustomAlert(`复制【${category}】类别的期刊源失败，请手动复制。`);
      });
    } else {
      showCustomAlert('未找到指定的期刊类别。');
    }
  });
}

// 删除指定类别
function deleteCategory(category) {
  chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
    let journalSources = data.journalSources || {};
    let categoryOrder = data.categoryOrder || [];

    if (journalSources.hasOwnProperty(category)) {
      delete journalSources[category];
      categoryOrder = categoryOrder.filter(cat => cat !== category);

      chrome.storage.local.set({journalSources: journalSources, categoryOrder: categoryOrder}, () => {
        renderCategories();
      });
    } else {
      console.error('未找到指定的期刊类别:', category);
    }
  });
}

// 生成并复制链接
function generateAndCopyLink() {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources || {};
    const query = document.getElementById('search-query').value.trim();
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox:checked');
    const selectedCategories = Array.from(categoryCheckboxes).map(cb => cb.getAttribute('data-category'));
    const startYear = document.getElementById('start-year').value;
    const endYear = document.getElementById('end-year').value;
    const articleType = document.getElementById('article-type').value; // 获取文章类型
    const resultsPerPage = document.getElementById('results-per-page').value; // 获取每页结果数

    // 输入验证
    if (!query && selectedCategories.length === 0) {
      showCustomAlert('请输入搜索信息或选择至少一个期刊类别。');
      return;
    }

    if (startYear && endYear && parseInt(startYear) > parseInt(endYear)) {
      showCustomAlert('起始年份不能晚于结束年份。');
      return;
    }

    let url = 'https://scholar.google.com/scholar?';

    // 组合搜索查询
    let combinedQuery = '';
    if (query) {
      combinedQuery += `${query}`;
    }


    if (selectedCategories.length > 0) {
      const journalFilters = selectedCategories.map(category => 
        journalSources[category].map(journal => `source:"${journal}"`).join(' OR ')
      ).join(' OR ');
      combinedQuery += (combinedQuery ? ' AND ' : '') + `(${journalFilters})`;
    }

    if (combinedQuery) {
      url += `q=${encodeURIComponent(combinedQuery)}&`;
    }

    // 添加年份范围
    if (startYear) {
      url += `as_ylo=${startYear}&`;
    }
    if (endYear) {
      url += `as_yhi=${endYear}&`;
    }

    // 添加文章类型
    url += `as_rr=${articleType}&`;

    // 设置每页显示数量
    if (resultsPerPage !== "10") { // 当选择10时不添加该参数，因为它是默认值
      url += `num=${resultsPerPage}`;
    } else {
      // 移除URL末尾可能的&符号
      url = url.endsWith('&') ? url.slice(0, -1) : url;
    }

    // 复制链接到剪贴板
    navigator.clipboard.writeText(url).then(() => {
      showCustomAlert('链接已生成并复制到剪贴板！');
    }).catch(err => {
      console.error('复制失败:', err);
      showCustomAlert('复制链接失败，请手动复制。');
    });
  });
}


// 直接搜索
function directSearch() {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources || {};
    const query = document.getElementById('search-query').value.trim();
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox:checked');
    const selectedCategories = Array.from(categoryCheckboxes).map(cb => cb.getAttribute('data-category'));
    const startYear = document.getElementById('start-year').value;
    const endYear = document.getElementById('end-year').value;
    const articleType = document.getElementById('article-type').value; // 获取文章类型
    const resultsPerPage = document.getElementById('results-per-page').value; // 获取每页结果数

    // 输入验证
    if (!query && selectedCategories.length === 0) {
      showCustomAlert('请输入搜索信息或选择至少一个期刊类别。');
      return;
    }

    if (startYear && endYear && parseInt(startYear) > parseInt(endYear)) {
      showCustomAlert('起始年份不能晚于结束年份。');
      return;
    }

    let url = 'https://scholar.google.com/scholar?';

    // 组合搜索查询
    let combinedQuery = '';
    if (query) {
      combinedQuery += `${query}`;
    }


    if (selectedCategories.length > 0) {
      const journalFilters = selectedCategories.map(category => 
        journalSources[category].map(journal => `source:"${journal}"`).join(' OR ')
      ).join(' OR ');
      combinedQuery += (combinedQuery ? ' AND ' : '') + `(${journalFilters})`;
    }

    if (combinedQuery) {
      url += `q=${encodeURIComponent(combinedQuery)}&`;
    }

    // 添加年份范围
    if (startYear) {
      url += `as_ylo=${startYear}&`;
    }
    if (endYear) {
      url += `as_yhi=${endYear}&`;
    }

    // 添加文章类型
    url += `as_rr=${articleType}&`;

    // 设置每页显示数量
    if (resultsPerPage !== "10") { // 当选择10时不添加该参数，因为它是默认值
      url += `num=${resultsPerPage}`;
    } else {
      // 移除URL末尾可能的&符号
      url = url.endsWith('&') ? url.slice(0, -1) : url;
    }

    // 在新标签页中打开链接
    chrome.tabs.create({ url: url });
  });
}


// 添加新类别到journalSources
function addNewCategory(categoryName, journals) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
      let journalSources = data.journalSources || {};
      let categoryOrder = data.categoryOrder || [];

      if (journalSources.hasOwnProperty(categoryName)) {
        showCustomAlert('该类别名称已存在，请选择其他名称。');
        reject('类别名称已存在');
        return;
      }

      journalSources[categoryName] = journals;
      categoryOrder.push(categoryName); // 将新类别添加到顺序末尾

      chrome.storage.local.set({journalSources: journalSources, categoryOrder: categoryOrder}, () => {
        resolve();
      });
    });
  });
}

// 清除模态框输入
function clearModalInputs() {
  document.getElementById('new-category-name').value = '';
  document.getElementById('new-category-journals').value = '';
}

// 保存用户选择到chrome.storage
function savePreferences() {
  chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
    const journalSources = data.journalSources || {};
    const categoryOrder = data.categoryOrder || [];
    const query = document.getElementById('search-query').value.trim();
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox:checked');
    const selectedCategories = Array.from(categoryCheckboxes).map(cb => cb.getAttribute('data-category'));
    const startYear = document.getElementById('start-year').value;
    const endYear = document.getElementById('end-year').value;
    const articleType = document.getElementById('article-type').value; // 获取文章类型
    const resultsPerPage = document.getElementById('results-per-page').value; // 获取每页结果数

    chrome.storage.local.set({
      searchQuery: query,
      selectedCategories: selectedCategories,
      startYear: startYear,
      endYear: endYear,
      articleType: articleType, // 保存文章类型
      resultsPerPage: resultsPerPage // 保存每页结果数
    });
  });
}

// 加载用户选择从chrome.storage
function loadPreferences() {
  chrome.storage.local.get(['searchQuery', 'selectedCategories', 'startYear', 'endYear', 'articleType', 'resultsPerPage'], (data) => {
    if (data.searchQuery) {
      document.getElementById('search-query').value = data.searchQuery;
    }
    if (data.selectedCategories) {
      data.selectedCategories.forEach(category => {
        const checkbox = document.querySelector(`.category-checkbox[data-category="${category}"]`);
        if (checkbox) {
          checkbox.checked = true;
        }
      });
    }
    if (data.startYear) {
      document.getElementById('start-year').value = data.startYear;
    }
    if (data.endYear) {
      document.getElementById('end-year').value = data.endYear;
    }
    if (data.articleType) {
      document.getElementById('article-type').value = data.articleType; // 加载文章类型
    }
    if (data.resultsPerPage) {
      document.getElementById('results-per-page').value = data.resultsPerPage; // 加载每页结果数
    }
  });
}

// 添加拖动事件处理程序
function addDragAndDropHandlers(categoryDiv) {
  categoryDiv.addEventListener('dragstart', handleDragStart);
  categoryDiv.addEventListener('dragover', handleDragOver);
  categoryDiv.addEventListener('drop', handleDrop);
  categoryDiv.addEventListener('dragend', handleDragEnd);
}


let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target && target !== draggedElement && target.classList.contains('category')) {
    const bounding = target.getBoundingClientRect();
    const offset = bounding.y + (bounding.height / 2);
    if (e.clientY - bounding.y < bounding.height / 2) {
      target.parentNode.insertBefore(draggedElement, target);
    } else {
      target.parentNode.insertBefore(draggedElement, target.nextSibling);
    }
  }
}

function handleDrop(e) {
  e.stopPropagation();
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  updateCategoryOrder();
}


// 更新类别顺序到storage
function updateCategoryOrder() {
  const categories = document.querySelectorAll('.dropdown-content .category:not(#add-category):not(#import-category):not(#export-category)');
  const newOrder = Array.from(categories).map(cat => cat.getAttribute('data-category'));

  chrome.storage.local.get(['categoryOrder'], (data) => {
    chrome.storage.local.set({categoryOrder: newOrder}, () => {
      console.log('类别顺序已更新。');
    });
  });
}

// 新增：导入期刊范围的函数
function importJournalRanges(importedData) {
  chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
    let journalSources = data.journalSources || {};
    let categoryOrder = data.categoryOrder || [];

    // 合并导入的数据
    for (const [category, journals] of Object.entries(importedData)) {
      if (journalSources.hasOwnProperty(category)) {
        // 如果类别已存在，合并期刊并去重
        const existingJournals = new Set(journalSources[category]);
        journals.forEach(journal => existingJournals.add(journal));
        journalSources[category] = Array.from(existingJournals);
      } else {
        // 如果类别不存在，添加新类别
        journalSources[category] = journals;
        categoryOrder.push(category);
      }
    }

    chrome.storage.local.set({journalSources: journalSources, categoryOrder: categoryOrder}, () => {
      showCustomAlert('期刊范围已成功导入，并与现有类别合并。');
      renderCategories();
    });
  });
}


// 验证导入的数据格式
function validateImportedData(data) {
  if (typeof data !== 'object' || Array.isArray(data) || data === null) {
    return false;
  }
  for (const [category, journals] of Object.entries(data)) {
    if (typeof category !== 'string') {
      return false;
    }
    if (!Array.isArray(journals)) {
      return false;
    }
    for (const journal of journals) {
      if (typeof journal !== 'string') {
        return false;
      }
    }
  }
  return true;
}

// 新增：导出全部期刊范围的函数
function exportAllJournalRanges() {
  chrome.storage.local.get(['journalSources', 'categoryOrder'], (data) => {
    const journalSources = data.journalSources || {};
    const categoryOrder = data.categoryOrder || Object.keys(journalSources);
    const exportData = {};
    categoryOrder.forEach(category => {
      exportData[category] = journalSources[category];
    });
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'journal_ranges_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// 假设您有一个函数或变量存储期刊范围选项
const journalScopes = ['范围1', '范围2', '范围3']; // 根据实际情况修改

// 在 popup.js 中，将期刊范围选项发送到 content.js
function sendJournalScopes() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'updateScopes', scopes: journalScopes });
  });
}

// 调用发送函数，例如在初始化时
sendJournalScopes();

// 添加新的辅助函数来处理期刊的更新、删除和添加
function updateJournalName(category, oldName, newName) {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources;
    const index = journalSources[category].indexOf(oldName);
    if (index !== -1) {
      journalSources[category][index] = newName;
      chrome.storage.local.set({journalSources}, () => {
        console.log('期刊名称已更新');
      });
    }
  });
}

function removeJournal(category, journalName) {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources;
    journalSources[category] = journalSources[category].filter(j => j !== journalName);
    chrome.storage.local.set({journalSources}, () => {
      console.log('期刊已删除');
    });
  });
}

function addJournalToCategory(category, newJournal) {
  chrome.storage.local.get(['journalSources'], (data) => {
    const journalSources = data.journalSources;
    if (!journalSources[category].includes(newJournal)) {
      journalSources[category].push(newJournal);
      chrome.storage.local.set({journalSources}, () => {
        renderCategories(); // 重新渲染以显示新添加的期刊
      });
    } else {
      showCustomAlert('该期刊已存在于此类别中');
    }
  });
}

// 初始化自定义提示弹窗
function initCustomAlert() {
  const customAlert = document.getElementById('custom-alert');
  const confirmBtn = document.getElementById('alert-confirm');
  
  confirmBtn.addEventListener('click', () => {
    customAlert.style.display = 'none';
  });
  
  // 点击弹窗外部区域关闭
  window.addEventListener('click', (event) => {
    if (event.target === customAlert) {
      customAlert.style.display = 'none';
    }
  });
}

// 自定义提示弹窗函数，替代原生alert
function showCustomAlert(message) {
  const customAlert = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('alert-message');
  
  alertMessage.textContent = message;
  customAlert.style.display = 'block';
}

// 初始化自定义确认对话框
function initCustomConfirm() {
  const customConfirm = document.getElementById('custom-confirm');
  const confirmYesBtn = document.getElementById('confirm-yes-btn');
  const confirmNoBtn = document.getElementById('confirm-no-btn');
  
  // 点击弹窗外部区域关闭
  window.addEventListener('click', (event) => {
    if (event.target === customConfirm) {
      customConfirm.style.display = 'none';
      window.confirmCallback = null;
    }
  });
  
  // 点击"取消"按钮
  confirmNoBtn.addEventListener('click', () => {
    customConfirm.style.display = 'none';
    if (window.confirmCallback) {
      window.confirmCallback(false);
      window.confirmCallback = null;
    }
  });
  
  // 点击"确定"按钮
  confirmYesBtn.addEventListener('click', () => {
    customConfirm.style.display = 'none';
    if (window.confirmCallback) {
      window.confirmCallback(true);
      window.confirmCallback = null;
    }
  });
}

// 自定义确认对话框函数，替代原生confirm
function showCustomConfirm(message, callback) {
  const customConfirm = document.getElementById('custom-confirm');
  const confirmMessage = document.getElementById('confirm-message');
  
  confirmMessage.textContent = message;
  customConfirm.style.display = 'block';
  
  // 保存回调函数
  window.confirmCallback = callback;
}
