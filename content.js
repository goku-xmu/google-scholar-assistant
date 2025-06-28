// 默认提取10页
let isExtracting = false;
let maxPages = 10; // 默认值为10

// 存储CSV数据的映射
const zkyfqMap = {};
const jcrfqMap = {};

// 加载CSV文件并解析
async function loadCSVData() {
  try {
    // 加载zkyfq.csv
    const zkyfqResponse = await fetch(chrome.runtime.getURL('/data/zkyfq.csv'));
    const zkyfqText = await zkyfqResponse.text();
    parseZkyfqCSV(zkyfqText);

    // 加载jcrfq.csv
    const jcrfqResponse = await fetch(chrome.runtime.getURL('/data/jcrfq.csv'));
    const jcrfqText = await jcrfqResponse.text();
    parseJcrfqCSV(jcrfqText);

    console.log('CSV数据加载完成');
    console.log(`期刊数据统计: 中科院分区=${Object.keys(zkyfqMap).length}, JCR分区=${Object.keys(jcrfqMap).length}`);
  } catch (error) {
    console.error('加载CSV文件时出错:', error);
  }
}

// 解析zkyfq.csv
function parseZkyfqCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const values = line.split(',').map(v => v.trim());
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index];
    });
    const processedJournal = processJournalName(record['Journal']);
    zkyfqMap[processedJournal] = {
      大类分区: record['大类分区'].replace(/[^1-4]/g, ''), // 只保留数字1-4
      Top: record['Top'] || '否'
    };
  }
}

// 解析jcrfq.csv
function parseJcrfqCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = parseCSVLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const values = parseCSVLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    const processedJournal = processJournalName(record['Journal']);
    jcrfqMap[processedJournal] = {
      IF_2023: record['IF(2024)'] || '未知',
      IF_Quartile: record['IF Quartile'] || '未知'
    };
  }
}

// 辅助函数：解析CSV行，正确处理引号
function parseCSVLine(line) {
  const result = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(start, i).trim().replace(/^"|"$/g, ''));
      start = i + 1;
    }
  }
  result.push(line.substring(start).trim().replace(/^"|"$/g, ''));

  return result;
}

// 提取标题、期刊信息和索引
function extractTitlesAndJournals() {
  const papers = [];
  const paperElements = document.querySelectorAll('.gs_r.gs_or.gs_scl');

  paperElements.forEach(element => {
    const titleElement = element.querySelector('.gs_rt a');
    const venueElement = element.querySelector('.gs_a');
    const snippetElement = element.querySelector('.gs_rs'); // 提取摘要或索引内容
    const link = titleElement ? titleElement.href : '';
    const indexHTML = venueElement ? venueElement.innerHTML.trim() : '';
    const snippetHTML = snippetElement ? snippetElement.innerHTML.trim() : ''; // 提取摘要

    if (titleElement && venueElement) {
      const title = titleElement.textContent.trim();
      let journal = extractJournalInfo(venueElement.textContent);
      const elid = titleElement.id;
      const processedJournal = processJournalName(journal); // 添加处理后的期刊名称

      // 获取额外信息
      const zkyInfo = zkyfqMap[processedJournal] || { 大类分区: '未知', Top: '否' };
      const jcrInfo = jcrfqMap[processedJournal] || { IF_2023: '未知', IF_Quartile: '未知' };

      papers.push({
        title,
        journal,
        processedJournal,
        elid,
        link,
        indexHTML,
        snippetHTML,
        大类分区: zkyInfo.大类分区,
        Top: zkyInfo.Top,
        IF_2023: jcrInfo.IF_2023,
        IF_Quartile: jcrInfo.IF_Quartile
      }); // 加入摘要和处理后的期称及额外信息
    }
  });

  return papers;
}


// 从 venue 文本中提取期刊信息
function extractJournalInfo(venueText) {
  let r1 = venueText.indexOf(String.fromCharCode(160) + "- ");
  if (r1 === -1) return '未知';
  let journal2 = venueText.substring(r1 + 3);
  let r2 = journal2.indexOf(" - ");
  if (r2 === -1) return '未知';
  let journal = venueText.substring(r1 + 3, r1 + 3 + r2);
  journal = journal.replace(/, \d{4}/, "");
  return journal;
}

// 处理期刊名称
function processJournalName(journal) {
  return journal.toUpperCase()
                .replace(/&AMP;/g, "&")
                .replace(/ AND /g, "")
                .replace(/^THE /g, "")
                .replace(/, THE$/g, "")
                .normalize('NFD')
                .replace(/[^A-Z0-9]/ig, "");
}

// 延时函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取期刊信息
async function fetchJournalInfo(papers) {
  const processedPapers = [];

  // 显示"正在匹配期刊信息，请稍等..."提示
  showMatchingStatus('正在匹配期刊信息，请稍等...', true);

  // 将papers分成多个批次，每批次20个
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < papers.length; i += batchSize) {
    batches.push(papers.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchPromises = batch.map(async (paper) => {
      let journal = paper.journal;

      if (journal === '未知' || journal.includes('…')) {
        try {
          const full_url = window.location.origin + "/scholar";
          const cite_link = `${full_url}?q=info:${paper.elid}:scholar.google.com/&output=cite&scirp=8&hl=de`;

          const response = await fetch(cite_link);
          const result = await response.text();

          let pos_start = result.indexOf("<i>", 1);
          let pos_end = result.indexOf("</i>", 1);
          let scholar_journal = result.substring(pos_start + 3, pos_end);

          if (scholar_journal && scholar_journal !== "<d") {
            journal = scholar_journal.toUpperCase();
          } else {
            journal = '未知';
          }
        } catch (error) {
          console.error(`获取期刊信息时出错: ${error}`);
          journal = '获取失败';
        }
      }

      // 将期刊名称转换为大写
      journal = journal.toUpperCase();

      const processedJournal = processJournalName(journal);

      // 获取额外信息
      const zkyInfo = zkyfqMap[processedJournal] || { 大类分区: '未知', Top: '否' };
      const jcrInfo = jcrfqMap[processedJournal] || { IF_2023: '未知', IF_Quartile: '未知' };

      return {
        ...paper,
        journal: journal,
        processedJournal: processedJournal,
        大类分区: zkyInfo.大类分区,
        Top: zkyInfo.Top,
        IF_2023: jcrInfo.IF_2023,
        IF_Quartile: jcrInfo.IF_Quartile
      };
    });

    const batchResults = await Promise.all(batchPromises);
    processedPapers.push(...batchResults);

    // 每处理完一批次，暂停200毫秒
    await sleep(100);
  }

  // 隐藏"正在匹配期刊信息，请稍等..."提示，显示"匹配完成"提示
  showMatchingStatus('匹配完成', false);

  return processedPapers;
}


// 显示提取的论文和期刊信息
function displayTitlesWithJournals(papers) {
  let resultsDiv = document.getElementById('extracted-titles');
  if (!resultsDiv) {
    resultsDiv = document.createElement('div');
    resultsDiv.id = 'extracted-titles';
    resultsDiv.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: white;
      padding: 25px;
      border: none;
      height: 85vh;
      width: 90%;
      max-width: 1200px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    `;
    document.body.appendChild(resultsDiv);
  }

  // 统计每个处理后期刊的论文数量
  const journalCountMap = {};
  const processedJournalNameMap = {}; // 存储处理后名称对应的显示名称及额外信息
  papers.forEach(paper => {
    if (journalCountMap[paper.processedJournal]) {
      journalCountMap[paper.processedJournal]++;
    } else {
      journalCountMap[paper.processedJournal] = 1;
      // 构建显示名称
      let displayInfo = `IF: ${paper.IF_2023} | JCR: ${paper.IF_Quartile}`;
      if (paper.Top === '是') { // 检查Top是否为"是"
        displayInfo += ` | 中科院${paper.大类分区}区TOP`;
      } else {
        displayInfo += ` | 中科院${paper.大类分区}区`;
      }
      processedJournalNameMap[paper.processedJournal] = `${paper.journal} | ${displayInfo}`;
    }
  });

  // 获取所有唯一的处理后期刊名称
  let uniqueJournals = [...new Set(papers.map(paper => paper.processedJournal))];

  // 认排序：字母序A-Z和论文数量从多到少
  uniqueJournals.sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return journalCountMap[b] - journalCountMap[a];
  });

  // 修改筛选框的HTML结构
  const filterSortHtml = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin: 0;">提取的论文信息 (共 ${papers.length} 篇)</h3>
      <button id="close-window" class="action-button" style="
        background-color: #d3baf8;
        color: black;
        border: none;
        width: 30px;
        height: 30px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.3s;
      ">×</button>
    </div>
    <div class="filter-sort-container" style="
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
      gap: 15px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    ">
      <div style="width: 70%;">
        <label for="journal-filter" style="
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #333;
          height: 14px; /* 固定高度与右侧标题一致 */
          line-height: 14px;
        ">筛选期刊：</label>
        <div id="journal-filter" style="
          width: 100%;
          height: 250px;
          overflow-y: auto;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 10px;
          background: #f8f9fa;
          box-sizing: border-box;
        ">
          <label style="display: flex; align-items: center; padding: 3px 0;">
            <input type="checkbox" value="all" checked style="
              margin-right: 5px;
              width: 16px;
              height: 16px;
            ">
            <span class="journal-option" style="font-size: 14px;">全部</span>
          </label>
          ${uniqueJournals.map(journal => {
            const journalInfo = papers.find(p => p.processedJournal === journal);
            return `
              <label title="${processedJournalNameMap[journal]}" style="display: flex; align-items: center; padding: 3px 0;">
                <input type="checkbox" value="${journal}" style="
                  margin-right: 5px;
                  width: 16px;
                  height: 16px;
                ">
                <span class="journal-option" style="font-size: 14px;">
                  ${journalInfo.journal}
                  <span class="info-tag if-tag">IF: ${jcrfqMap[journal]?.IF_2023 || '未知'}</span>
                  <span class="info-tag jcr-tag">JCR: ${jcrfqMap[journal]?.IF_Quartile || '未知'}</span>
                  <span class="info-tag cas-tag">中科院${zkyfqMap[journal]?.大类分区 || '未知'}区${zkyfqMap[journal]?.Top === '是' ? 'TOP' : ''}</span>
                  <span style="margin-left: 5px; color: #666; font-size: 14px;">(${journalCountMap[journal]})</span>
                </span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
      <div style="width: 27%;">
        <div style="
          display: flex;
          flex-direction: column;
          margin-bottom: 8px;
          height: 14px; /* 标题高度与左侧保持一致 */
          line-height: 14px;
        ">
          <label style="
            font-size: 14px;
            font-weight: 500;
            color: #333;
          ">筛选选项：</label>
        </div>
        <div style="
          background: #f8f9fa;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          box-sizing: border-box;
          height: 250px;
          overflow-y: auto;
        ">
          <div style="
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            gap: 10px;
          ">
            <label for="sort-options" style="
              font-size: 14px;
              font-weight: 500;
              color: #333;
              white-space: nowrap;
            ">排序方式：</label>
            <select id="sort-options" style="
              flex: 1;
              padding: 6px 10px;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              background: white;
              font-size: 14px;
              color: #333;
              cursor: pointer;
              height: 32px;
              box-sizing: border-box;
            ">
              <option value="alphabet-asc">A-Z</option>
              <option value="alphabet-desc">Z-A</option>
              <option value="count-desc">数量降序</option>
              <option value="count-asc">数量升序</option>
              <option value="if-desc">IF降序</option>
              <option value="if-asc">IF升序</option>
            </select>
          </div>

          <div style="
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            gap: 10px;
          ">
            <label for="if-min" style="
              font-size: 14px;
              font-weight: 500;
              color: #333;
              white-space: nowrap;
            ">最小IF值：</label>
            <input type="number" id="if-min" placeholder="最小值" style="
              flex: 1;
              padding: 6px 10px;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              font-size: 14px;
              color: #333;
              height: 32px;
              box-sizing: border-box;
            ">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="
              display: block;
              margin-bottom: 5px;
              font-size: 14px;
              font-weight: 500;
              color: #333;
            ">JCR分区：</label>
            <div style="
              display: flex;
              flex-wrap: nowrap;
              gap: 5px;
              justify-content: space-between;
            ">
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="jcr-filter" value="Q1" style="margin-right: 3px;">
                <span style="font-size: 14px;">Q1</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="jcr-filter" value="Q2" style="margin-right: 3px;">
                <span style="font-size: 14px;">Q2</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="jcr-filter" value="Q3" style="margin-right: 3px;">
                <span style="font-size: 14px;">Q3</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="jcr-filter" value="Q4" style="margin-right: 3px;">
                <span style="font-size: 14px;">Q4</span>
              </label>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="
              display: block;
              margin-bottom: 5px;
              font-size: 14px;
              font-weight: 500;
              color: #333;
            ">中科院分区：</label>
            <div style="
              display: flex;
              flex-wrap: nowrap;
              gap: 5px;
              justify-content: space-between;
            ">
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="cas-filter" value="1" style="margin-right: 3px;">
                <span style="font-size: 14px;">1区</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="cas-filter" value="2" style="margin-right: 3px;">
                <span style="font-size: 14px;">2区</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="cas-filter" value="3" style="margin-right: 3px;">
                <span style="font-size: 14px;">3区</span>
              </label>
              <label style="display: flex; align-items: center; flex: 1;">
                <input type="checkbox" name="cas-filter" value="4" style="margin-right: 3px;">
                <span style="font-size: 14px;">4区</span>
              </label>
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label style="display: flex; align-items: center;">
              <input type="checkbox" id="top-filter" style="margin-right: 5px;">
              <span style="font-size: 14px; font-weight: 500; color: #333;">TOP期刊</span>
            </label>
            <button id="clear-filters" class="action-button" style="
              background-color: #e0e0e0;
              color: black;
              border: none;
              padding: 4px 10px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              height: 28px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: background-color 0.3s;
            ">清除筛选</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // 移除旧的按钮容器，直接插入新的HTML
  resultsDiv.innerHTML = `
    ${filterSortHtml}
    <div style="
      margin: 3px 0;
      padding: 8px 0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      align-items: center;
    ">
      <div style="
        display: flex;
        gap: 10px;
        width: 100%;
        justify-content: flex-end;
      ">
        <button id="get-abstracts" class="action-button" style="
          flex: 1;
          max-width: 130px;
          background-color: #d3baf8;
          color: black;
          border: none;
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.3s;
        ">获取论文摘要</button>
        <button id="cite-selected" class="action-button" style="
          flex: 1;
          max-width: 130px;
          background-color: #d3baf8;
          color: black;
          border: none;
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.3s;
        ">引用所选论文</button>
      </div>
    </div>
    <div style="padding: 10px; background-color: #f8f9fa; border-radius: 4px; margin-bottom: 10px;">
      <label style="display: flex; align-items: center; cursor: pointer;">
        <input type="checkbox" id="select-all-papers" style="
          margin-right: 15px;
          width: 18px;
          height: 18px;
          cursor: pointer;
        ">
        <span style="font-weight: bold;">全选当前视图下的论文</span>
      </label>
    </div>
    <ul id="paper-list" style="list-style-type: none; padding: 0; margin: 0; width: 100%;">
      ${papers.map(paper => `
        <li class="paper-item" data-journal="${paper.processedJournal}">
          <div class="paper-content">
            <input type="checkbox" class="paper-checkbox" data-title="${encodeURIComponent(paper.title)}" style="
              margin-right: 15px;
              width: 18px;
              height: 18px;
              cursor: pointer;
            ">
            <div style="flex: 1; padding-right: 60px;">
              <div class="paper-header">
                <strong><a href="${paper.link}" target="_blank" style="text-decoration: none; color: inherit;" class="paper-title-link">${paper.title}</a></strong>
              </div>
              <small style="color: #777;">
                <strong>期刊<span class="journal-name">${paper.journal}</span>
                <span class="journal-info">
                  <span class="info-tag if-tag">IF: ${paper.IF_2023}</span>
                  <span class="info-tag jcr-tag">JCR: ${paper.IF_Quartile}</span>
                  <span class="info-tag cas-tag">中科院${paper.大类分区}区${paper.Top === '是' ? 'TOP' : ''}</span>
                </span></strong>
              </small>
              <br>
              <small style="color: #777;" class="index-content">${paper.indexHTML.replace(/<a[^>]*>(.*?)<\/a>/g, '$1')}</small>
              <br>
              <div class="snippet-content">${paper.snippetHTML}</div>
            </div>
            <button class="cite-button" data-title="${encodeURIComponent(paper.title)}">引用</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;

  // 添加全选功能的事件监听器
  const selectAllCheckbox = document.getElementById('select-all-papers');
  const paperCheckboxes = document.querySelectorAll('.paper-checkbox');

  // 为按钮添加悬停效果
  const addButtonHover = (buttonId) => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.onmouseover = function() {
        this.style.backgroundColor = '#e1ceff';
      };
      button.onmouseout = function() {
        this.style.backgroundColor = '#d3baf8';
      };
    }
  };

  // 为所有按钮添加悬停效果
  addButtonHover('get-abstracts');
  addButtonHover('cite-selected');
  addButtonHover('close-window');

  // 为清除筛选按钮添加特殊悬停效果
  const clearFiltersBtn = document.getElementById('clear-filters');
  if (clearFiltersBtn) {
    clearFiltersBtn.onmouseover = function() {
      this.style.backgroundColor = '#cccccc';
    };
    clearFiltersBtn.onmouseout = function() {
      this.style.backgroundColor = '#e0e0e0';
    };
  }

  // 更新全选框状态的函数
  function updateSelectAllState() {
    const visiblePapers = Array.from(paperCheckboxes).filter(checkbox =>
      !checkbox.closest('.paper-item').style.display ||
      checkbox.closest('.paper-item').style.display !== 'none'
    );
    const checkedVisiblePapers = visiblePapers.filter(checkbox => checkbox.checked);

    if (visiblePapers.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedVisiblePapers.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedVisiblePapers.length === visiblePapers.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  // 全选框点击事件
  selectAllCheckbox.addEventListener('change', function() {
    const isChecked = this.checked;
    paperCheckboxes.forEach(checkbox => {
      const paperItem = checkbox.closest('.paper-item');
      if (!paperItem.style.display || paperItem.style.display !== 'none') {
        checkbox.checked = isChecked;
      }
    });
    updateSelectAllState();
  });

  // 单个复选框点击事件
  paperCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateSelectAllState);
  });

  // 在筛选后更新全选状态
  const originalFilterJournals = window.filterJournals;
  window.filterJournals = function() {
    if (originalFilterJournals) {
      originalFilterJournals.apply(this, arguments);
    }
    setTimeout(updateSelectAllState, 0);
  };

  // 修改样式定义
  const additionalStyle = `
    .paper-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: px;
      position: relative;
    }
    .paper-title-link {
      transition: color 0.2s ease;
    }
    .paper-title-link:hover {
      color: #1a73e8 !important;
    }
    .info-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      margin: 0 4px;
      font-size: 0.9em;
      white-space: nowrap;
    }
    .if-tag {
      background-color: #FFF3E0;
      color: #E65100;
    }
    .jcr-tag {
      background-color: #F3E5F5;
      color: #7B1FA2;
    }
    .cas-tag {
      background-color: #E8F5E9;
      color: #388E3C;
    }
    .cite-button {
      position: absolute;
      right: 15px;
      top: 50%;
      transform: translateY(-50%);
      background-color: #d3baf8;
      color: black;
      border: none;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.3s;
      white-space: nowrap;
      z-index: 1;
      height: 30px;
      min-width: 50px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .cite-button:hover {
      background-color: #e1ceff;
    }
    .paper-content {
      padding: 15px;
      position: relative;
      display: flex;
      align-items: center;
    }
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    }
    .loading-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .loading-spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #d3baf8;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 10px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  const styleElement = document.createElement('style');
  styleElement.textContent = additionalStyle;
  document.head.appendChild(styleElement);

  // 添加用按钮事件监听
  document.querySelectorAll('.cite-button').forEach(button => {
    button.addEventListener('click', async function() {
      const title = decodeURIComponent(this.dataset.title);
      await handleCitation(title);
    });
  });

  // 修改样式
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #extracted-titles {
        width: 95%;
        max-width: none;
      }
      .filter-sort-container {
        flex-direction: column;
      }
      .filter-sort-container > div {
        width: 100% !important;
        margin-bottom: 10px;
      }
    }
    .snippet-content b,
    .snippet-content strong {
      font-weight: bold !important;
      color: darkred !important;
      background-color: transparent !important;
    }
    .paper-item {
      margin-bottom: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .paper-content {
      padding: 10px;
    }
    .extra-info {
      font-size: 0.9em;
    }
    #journal-filter {
      width: 100%;
    }
    #sort-options, #clear-results {
      width: 100%;
    }
    #sort-options {
      font-size: 0.9em;
    }
    #journal-filter label {
      display: flex;
      align-items: center;
      margin-bottom: 2px;
      padding: 2px 5px;
      border-radius: 4px;
    }
    #journal-filter input[type="checkbox"] {
      margin-right: 8px;
      flex-shrink: 0;
    }
    .journal-option {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      flex-grow: 1;
      padding-left: 4px;
    }
    .info-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.9em;
      white-space: nowrap;
      margin: 0 2px;
    }
    .if-tag {
      background-color: #FFF3E0;
      color: #E65100;
    }
    .jcr-tag {
      background-color: #F3E5F5;
      color: #7B1FA2;
    }
    .cas-tag {
      background-color: #E8F5E9;
      color: #388E3C;
    }
    #journal-filter label:hover {
      background-color: #f5f5f5;
    }
  `;
  document.head.appendChild(style);

  // 修改排序功能
  const sortSelect = document.getElementById('sort-options');
  sortSelect.addEventListener('change', function() {
    const sortValue = this.value;
    let sortedJournals = [...uniqueJournals];

    if (sortValue === 'alphabet-asc') {
      sortedJournals.sort((a, b) => a.localeCompare(b));
    } else if (sortValue === 'alphabet-desc') {
      sortedJournals.sort((a, b) => b.localeCompare(a));
    } else if (sortValue === 'count-asc') {
      sortedJournals.sort((a, b) => journalCountMap[a] - journalCountMap[b]);
    } else if (sortValue === 'count-desc') {
      sortedJournals.sort((a, b) => journalCountMap[b] - journalCountMap[a]);
    } else if (sortValue === 'if-desc') {
      sortedJournals.sort((a, b) => {
        const ifA = parseFloat(jcrfqMap[a]?.IF_2023) || 0;
        const ifB = parseFloat(jcrfqMap[b]?.IF_2023) || 0;
        return ifB - ifA;
      });
    } else if (sortValue === 'if-asc') {
      sortedJournals.sort((a, b) => {
        const ifA = parseFloat(jcrfqMap[a]?.IF_2023) || 0;
        const ifB = parseFloat(jcrfqMap[b]?.IF_2023) || 0;
        return ifA - ifB;
      });
    }

    // 重新生成筛选选项
    const journalFilter = document.getElementById('journal-filter');
    journalFilter.innerHTML = `
      <label style="display: flex; align-items: center; padding: 3px 0;">
        <input type="checkbox" value="all" checked style="
          margin-right: 5px;
          width: 16px;
          height: 16px;
        ">
        <span class="journal-option" style="font-size: 14px;">全部</span>
      </label>
      ${sortedJournals.map(journal => {
        const journalInfo = papers.find(p => p.processedJournal === journal);
        return `
          <label title="${processedJournalNameMap[journal]}" style="display: flex; align-items: center; padding: 3px 0;">
            <input type="checkbox" value="${journal}" style="
              margin-right: 5px;
              width: 16px;
              height: 16px;
            ">
            <span class="journal-option" style="font-size: 14px;">
              ${journalInfo.journal}
              <span class="info-tag if-tag">IF: ${jcrfqMap[journal]?.IF_2023 || '未知'}</span>
              <span class="info-tag jcr-tag">JCR: ${jcrfqMap[journal]?.IF_Quartile || '未知'}</span>
              <span class="info-tag cas-tag">中科院${zkyfqMap[journal]?.大类分区 || '未知'}区${zkyfqMap[journal]?.Top === '是' ? 'TOP' : ''}</span>
              <span style="margin-left: 5px; color: #666; font-size: 14px;">(${journalCountMap[journal]})</span>
            </span>
          </label>
        `;
      }).join('')}
    `;

    // 重新添加事件监听器
    addFilterEventListener();
  });

  // 添加筛选事件监听器的函数
  function addFilterEventListener() {
    const journalFilter = document.getElementById('journal-filter');
    journalFilter.addEventListener('change', function(event) {
      if (event.target.type === 'checkbox') {
        const checkboxes = journalFilter.querySelectorAll('input[type="checkbox"]');
        const allCheckbox = journalFilter.querySelector('input[value="all"]');

        if (event.target.value === 'all') {
          checkboxes.forEach(cb => {
            if (cb !== allCheckbox) {
              cb.checked = false;
            }
          });
        } else {
          allCheckbox.checked = false;
        }

        const selectedJournals = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.value);

        const paperList = document.getElementById('paper-list');
        const paperItems = paperList.getElementsByTagName('li');

        let visibleIndex = 0;
        for (let item of paperItems) {
          const journal = item.getAttribute('data-journal');
          if (selectedJournals.includes('all') || selectedJournals.includes(journal)) {
            item.style.display = '';
            item.querySelector('.paper-content').style.backgroundColor = visibleIndex % 2 === 0 ? '#f9f9f9' : '#e6f7ff';
            visibleIndex++;
          } else {
            item.style.display = 'none';
          }
        }
      }
    });
  }

  // 初始化时添加事件监听器
  addFilterEventListener();

  // 应用默认排序方式
  chrome.storage.sync.get({
    defaultSortMethod: 'alphabet-asc'  // 默认排序方式
  }, function(items) {
    // 设置排序下拉框的值
    sortSelect.value = items.defaultSortMethod;
    
    // 手动触发一次变更事件，应用排序
    const changeEvent = new Event('change');
    sortSelect.dispatchEvent(changeEvent);
  });

  // 初始化背景色
  const paperItems = document.querySelectorAll('.paper-item');
  paperItems.forEach((item, index) => {
    item.querySelector('.paper-content').style.backgroundColor = index % 2 === 0 ? '#f9f9f9' : '#e6f7ff';
  });

  // 添加清除筛选按钮件监听器
  const clearFiltersButton = document.getElementById('clear-filters');
  clearFiltersButton.addEventListener('click', clearAllFilters);

  // 添加关闭窗口按钮的事监器
  const closeButton = document.getElementById('close-window');
  closeButton.addEventListener('click', closeResultsWindow);

  // 修改筛选功能
  function filterJournals() {
    const selectedJournals = Array.from(document.querySelectorAll('#journal-filter input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    const selectedJCR = Array.from(document.querySelectorAll('input[name="jcr-filter"]:checked'))
      .map(cb => cb.value);
    const selectedCAS = Array.from(document.querySelectorAll('input[name="cas-filter"]:checked'))
      .map(cb => cb.value);
    const isTopSelected = document.getElementById('top-filter').checked;
    const ifMin = parseFloat(document.getElementById('if-min').value);

    const paperList = document.getElementById('paper-list');
    const paperItems = paperList.getElementsByTagName('li');

    let visibleIndex = 0;
    const matchedJournals = new Set();

    for (let item of paperItems) {
      if (!item.classList.contains('paper-item')) continue; // 跳过全选项

      const journal = item.getAttribute('data-journal');
      const journalInfo = jcrfqMap[journal] || {};
      const casInfo = zkyfqMap[journal] || {};
      const journalIF = parseFloat(journalInfo.IF_2023) || 0;

      const isJCRMatch = selectedJCR.length === 0 || selectedJCR.includes(journalInfo.IF_Quartile);
      const isCASMatch = selectedCAS.length === 0 || selectedCAS.includes(casInfo.大类分区);
      const isTopMatch = !isTopSelected || casInfo.Top === '是';
      const isIFMatch = isNaN(ifMin) || journalIF >= ifMin;

      if ((selectedJournals.includes('all') || selectedJournals.includes(journal)) &&
          isJCRMatch && isCASMatch && isTopMatch && isIFMatch) {
        item.style.display = '';
        item.querySelector('.paper-content').style.backgroundColor = visibleIndex % 2 === 0 ? '#f9f9f9' : '#e6f7ff';
        visibleIndex++;
        matchedJournals.add(journal);
      } else {
        item.style.display = 'none';
      }
    }

    // 更新期刊选择器
    updateJournalFilter(matchedJournals);
    // 更新全选框状态
    updateSelectAllState();
  }

  function updateJournalFilter(matchedJournals) {
    const journalFilter = document.getElementById('journal-filter');
    const checkboxes = journalFilter.querySelectorAll('input[type="checkbox"]');
    const allCheckbox = journalFilter.querySelector('input[value="all"]');

    checkboxes.forEach(cb => {
      if (cb !== allCheckbox) {
        cb.checked = matchedJournals.has(cb.value);
        cb.disabled = false; // 确保所有复选框都是可用的
      }
    });

    // 如果所有期刊都被选中,则选中"全部"选项
    allCheckbox.checked = matchedJournals.size === checkboxes.length - 1;
    allCheckbox.disabled = false; // 确保"全部"选项是可用的
  }

  // 添加筛选事件监听器
  function addFilterEventListeners() {
    const journalFilter = document.getElementById('journal-filter');
    const jcrFilters = document.querySelectorAll('input[name="jcr-filter"]');
    const casFilters = document.querySelectorAll('input[name="cas-filter"]');
    const topFilter = document.getElementById('top-filter');
    const ifMinInput = document.getElementById('if-min');

    journalFilter.addEventListener('change', filterJournals);
    jcrFilters.forEach(filter => filter.addEventListener('change', filterJournals));
    casFilters.forEach(filter => filter.addEventListener('change', filterJournals));
    topFilter.addEventListener('change', filterJournals);
    ifMinInput.addEventListener('input', filterJournals);
  }

  // 在显示文信息后调用这个函数
  addFilterEventListeners();

  // 修改批引用按钮的事件监听器
  document.getElementById('cite-selected').addEventListener('click', async function() {
    const selectedCheckboxes = document.querySelectorAll('.paper-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
      showToast('请至少选择一篇论文', true);
      return;
    }

    const loadingOverlay = showLoadingOverlay(`正在获取 ${selectedCheckboxes.length} 篇论文的引用信息...`);
    try {
      const titles = Array.from(selectedCheckboxes).map(cb => decodeURIComponent(cb.dataset.title));

      const citationDataArray = await Promise.all(titles.map(async (title) => {
        // 使用与单个引用相同的处理逻辑
        const [crossrefResult, pubmedResult] = await Promise.allSettled([
          getCrossrefData(title),
          getPubMedData(title)
        ]);

        let citationData = {};

        if (crossrefResult.status === 'fulfilled' && crossrefResult.value) {
          citationData = { ...crossrefResult.value };
        }

        if (pubmedResult.status === 'fulfilled' && pubmedResult.value) {
          const pubmedData = pubmedResult.value;
          citationData.Title = citationData.Title || pubmedData.Title;
          citationData.Authors = citationData.Authors || pubmedData.Authors;
          citationData.Year = citationData.Year || pubmedData.Year;
          citationData.Journal = citationData.Journal || pubmedData.Journal;
          citationData.Volume = citationData.Volume || pubmedData.Volume;
          citationData.Issue = citationData.Issue || pubmedData.Issue;
          citationData.Pages = citationData.Pages || pubmedData.Pages;
          citationData.DOI = citationData.DOI || pubmedData.DOI;
        }

        if (!citationData.Title) {
          console.warn(`无法找到文献引用信息: ${title}`);
          return null;
        }

        return citationData;
      }));

      const validCitations = citationDataArray.filter(data => data !== null);

      if (validCitations.length === 0) {
        throw new Error('无法获取任何选中论文的引用信息');
      }

      generateBatchRISFile(validCitations);

    } catch (error) {
      console.error('批量获取引用信息时出错:', error);
      alert(`批量获取引用信息失败: ${error.message}`);
    } finally {
      loadingOverlay.remove();
    }
  });

  // 新增批量获取摘要按钮的事件监听器
  document.getElementById('get-abstracts').addEventListener('click', async function() {
    const selectedCheckboxes = document.querySelectorAll('.paper-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
      showToast('请至少选择一篇论文', true);
      return;
    }

    const loadingOverlay = showLoadingOverlay(`正在获取 ${selectedCheckboxes.length} 篇论文的摘要...`);
    try {
      const titles = Array.from(selectedCheckboxes).map(cb => decodeURIComponent(cb.dataset.title));
      const abstractResults = await getBatchAbstracts(titles);
      displayAbstracts(abstractResults);
    } catch (error) {
      console.error('批量获取摘要时出错:', error);
      alert(`批量获取摘要失败: ${error.message}`);
    } finally {
      loadingOverlay.remove();
    }
  });

  // 新增获取批量摘要的函数
  async function getBatchAbstracts(titles) {
    const batchSize = 3; // 修改为3篇文章一批，确保即使少量论文也会进行批处理
    const retryAttempts = 5; // 增加最大重试次数
    const retryDelay = 1500; // 增加重试延迟
    const batchDelay = 2500; // 增加批次间延迟

    // 更新加载提示
    const loadingDiv = document.querySelector('.loading-content');
    const updateProgress = (current, total, status) => {
      if (loadingDiv) {
        loadingDiv.innerHTML = `
          <div class="loading-spinner"></div>
          <div>正在获取论文摘要 (${current}/${total})</div>
          <div style="font-size: 0.9em; color: #666;">${status}</div>
        `;
      }
    };

    // 添加延迟函数
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // 添加增强版重试机制的请求函数
    async function retryFetch(url, attempts = retryAttempts) {
      for (let i = 0; i < attempts; i++) {
        try {
          // 添加随机延迟，避免同时发送过多请求
          const randomDelay = Math.floor(Math.random() * 500) + 200;
          await delay(randomDelay);

          console.log(`尝试第 ${i+1}/${attempts} 次请求: ${url}`);
          const response = await fetch(url);

          if (!response.ok) {
            console.warn(`请求失败，状态码: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // 成功获取响应
          console.log(`请求成功: ${url}`);
          return response;
        } catch (error) {
          console.error(`请求失败 (尝试 ${i+1}/${attempts}): ${error.message}`);
          if (i === attempts - 1) throw error;

          // 使用指数退避策略，每次重试等待时间增加
          const exponentialDelay = retryDelay * Math.pow(1.5, i);
          console.log(`等待 ${exponentialDelay}ms 后重试...`);
          await delay(exponentialDelay);
        }
      }
    }

    // 修改获取PMID的函数，添加重试机制
    async function getPMIDWithRetry(doi) {
      try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}&format=json`;
        const response = await retryFetch(searchUrl);
        const data = await response.json();
        return data.esearchresult?.idlist?.[0] || null;
      } catch (error) {
        console.error('通过DOI获取PMID时出错:', error);
        return null;
      }
    }

    // 修改获取摘要的函数，添加重试机制，同时获取期刊信息、发表年份和作者信息
    async function getAbstractWithRetry(pmid) {
      try {
        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
        const response = await retryFetch(fetchUrl);
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // 创建结果对象
        const result = {
          abstract: null,
          journal: null,
          year: null,
          authors: null
        };

        // 获取所有摘要部分
        const abstractSections = xmlDoc.querySelectorAll("Abstract AbstractText");
        if (abstractSections.length > 0) {
          let abstractParts = [];

          // 处理结构化摘要
          if (abstractSections.length > 1 || abstractSections[0].getAttribute('Label')) {
            abstractSections.forEach(section => {
              const label = section.getAttribute('Label');
              const content = section.textContent.trim();
              if (label) {
                abstractParts.push(`${label}\n${content}`);
              } else {
                abstractParts.push(content);
              }
            });

            // 如果有 "Abstract" 标签，添加到开头
            if (!abstractParts[0].startsWith('Abstract')) {
              abstractParts.unshift('Abstract');
            }

            result.abstract = abstractParts.join('\n\n');
          }
          // 处理非结构化摘要
          else {
            result.abstract = abstractSections[0].textContent.trim();
          }
        }

        // 获取期刊信息
        const journalElement = xmlDoc.querySelector("Journal Title");
        if (journalElement) {
          result.journal = journalElement.textContent.trim().toUpperCase();
        }

        // 获取发表年份
        const yearElement = xmlDoc.querySelector("PubDate Year");
        if (yearElement) {
          result.year = yearElement.textContent.trim();
        }

        // 获取作者信息
        const authorElements = xmlDoc.querySelectorAll("AuthorList Author");
        if (authorElements.length > 0) {
          const authors = [];
          authorElements.forEach(author => {
            const lastName = author.querySelector("LastName")?.textContent.trim() || '';
            const foreName = author.querySelector("ForeName")?.textContent.trim() || '';
            if (lastName || foreName) {
              authors.push(`${lastName}${lastName && foreName ? ', ' : ''}${foreName}`);
            }
          });
          result.authors = authors.join('; ');
        }

        return result;
      } catch (error) {
        console.error('获取摘要和文章信息时出错:', error);
        return null;
      }
    }

    const results = [];
    // 将文章分批处理
    for (let i = 0; i < titles.length; i += batchSize) {
      const batch = titles.slice(i, i + batchSize);
      updateProgress(i, titles.length, '正在获取文章信息...');

      // 在处理批次前添加延迟，即使是第一批
      if (i === 0) {
        console.log('在开始处理前添加初始化延迟...');
        await delay(1000);
      }

      const batchResults = await Promise.all(batch.map(async (title, titleIndex) => {
        // 每个标题处理前添加小延迟，避免同时请求
        await delay(titleIndex * 300);
        try {
          console.log(`开始处理论文: ${title.substring(0, 50)}...`);
          updateProgress(i + titleIndex, titles.length, `正在处理: ${title.substring(0, 50)}...`);

          // 先获取DOI和PMID
          const [crossrefResult, pubmedResult] = await Promise.allSettled([
            getCrossrefData(title),
            getPubMedData(title)
          ]);

          let doi = null;
          let pmid = null;
          let abstract = null;
          let journal = null;
          let year = null;
          let authors = null;

          // 从Crossref获取DOI和基本信息
          if (crossrefResult.status === 'fulfilled' && crossrefResult.value) {
            console.log(`Crossref 返回数据: ${title.substring(0, 30)}...`);
            doi = crossrefResult.value.DOI;
            // 先保存Crossref的其他数据，作为备用
            journal = crossrefResult.value.Journal?.toUpperCase();
            year = crossrefResult.value.Year;
            authors = crossrefResult.value.Authors;
          } else {
            console.log(`Crossref 未返回数据: ${title.substring(0, 30)}...`);
          }

          // 从PubMed获取PMID和摘要
          if (pubmedResult.status === 'fulfilled' && pubmedResult.value) {
            console.log(`PubMed 返回数据: ${title.substring(0, 30)}...`);
            pmid = pubmedResult.value.PMID;
            // 如果PubMed直接返回了摘要，先保存
            if (pubmedResult.value.Abstract) {
              abstract = pubmedResult.value.Abstract;
              journal = pubmedResult.value.Journal || journal;
              year = pubmedResult.value.Year || year;
              authors = pubmedResult.value.Authors || authors;
            }
          } else {
            console.log(`PubMed 未返回数据: ${title.substring(0, 30)}...`);
          }

          // 如果有DOI但没有PMID，尝试通过DOI获取PMID
          if (doi && !pmid) {
            console.log(`尝试通过DOI获取PMID: ${doi}`);
            pmid = await getPMIDWithRetry(doi);
            if (pmid) {
              console.log(`成功通过DOI获取PMID: ${pmid}`);
            }
          }

          // 如果有PMID但没有摘要，使用PubMed API获取详细信息
          if (pmid && !abstract) {
            console.log(`尝试通过PMID获取详细信息: ${pmid}`);
            const articleInfo = await getAbstractWithRetry(pmid);
            if (articleInfo) {
              console.log(`成功获取PMID详细信息: ${pmid}`);
              abstract = articleInfo.abstract;
              // 仅当之前没有获取到时才替换
              journal = journal || articleInfo.journal;
              year = year || articleInfo.year;
              authors = authors || articleInfo.authors;
            }
          }

          return {
            title,
            doi,
            pmid,
            abstract,
            journal,
            year,
            authors,
            status: abstract ? 'success' : 'no_abstract'
          };
        } catch (error) {
          console.error(`获取文章摘要时出错 (${title}):`, error);
          return {
            title,
            error: error.message,
            status: 'error'
          };
        }
      }));

      results.push(...batchResults);

      // 在处理下一批之前等待，无论是否还有下一批
      // 这确保即使只有一批，也会有足够的延迟来完成所有API调用
      const currentProgress = Math.min(i + batchSize, titles.length);
      updateProgress(currentProgress, titles.length, '处理完成当前批次，等待系统响应...');
      console.log(`批次 ${i/batchSize + 1} 处理完成，等待 ${batchDelay}ms...`);
      await delay(batchDelay);

      // 如果还有下一批，显示相应提示
      if (i + batchSize < titles.length) {
        updateProgress(i + batchSize, titles.length, '准备处理下一批...');
      }
    }

    // 统计处理结果
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const noAbstract = results.filter(r => r.status === 'no_abstract').length;

    updateProgress(titles.length, titles.length,
      `处理完成！成功: ${successful}, 未找到摘要: ${noAbstract}, 失败: ${failed}`
    );

    return results;
  }

  // 修改显示摘要的函数，添加统计信息
  function displayAbstracts(abstractResults) {
    const successful = abstractResults.filter(r => r.status === 'success').length;
    const failed = abstractResults.filter(r => r.status === 'error').length;
    const noAbstract = abstractResults.filter(r => r.status === 'no_abstract').length;

    const abstractsWindow = document.createElement('div');
    abstractsWindow.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-width: 1000px;
      height: 80vh;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 1001;
      overflow-y: auto;
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
    `;

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="margin: 0;">论文摘要</h2>
          <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
            总计: ${abstractResults.length} |
            成功: ${successful} |
            未找到摘要: ${noAbstract} |
            失败: ${failed}
          </div>
        </div>
        <button id="close-abstracts" style="
          width: 30px;
          height: 30px;
          border: none;
          border-radius: 4px;
          background: #d3baf8;
          color: black;
          cursor: pointer;
          transition: background-color 0.3s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        ">×</button>
      </div>
      <div style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px;">
        <div>
          <button id="copy-all-abstracts" style="
            padding: 5px 12px;
            border: none;
            border-radius: 4px;
            background: #d3baf8;
            color: black;
            cursor: pointer;
            transition: background-color 0.3s;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">复制所有摘要</button>
        </div>
        <div>
          <button id="retry-failed" style="
            padding: 5px 12px;
            border: none;
            border-radius: 4px;
            background: ${failed > 0 ? '#d3baf8' : '#cccccc'};
            color: black;
            cursor: ${failed > 0 ? 'pointer' : 'not-allowed'};
            transition: background-color 0.3s;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">重试失败项 (${failed})</button>
        </div>
        <div style="margin-left: auto; display: flex; gap: 10px;">
          <button id="export-txt" style="
            padding: 5px 12px;
            border: none;
            border-radius: 4px;
            background: #d3baf8;
            color: black;
            cursor: pointer;
            transition: background-color 0.3s;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">导出为TXT</button>
          <button id="export-json" style="
            padding: 5px 12px;
            border: none;
            border-radius: 4px;
            background: #d3baf8;
            color: black;
            cursor: pointer;
            transition: background-color 0.3s;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">导出为JSON</button>
          <button id="export-csv" style="
            padding: 5px 12px;
            border: none;
            border-radius: 4px;
            background: #d3baf8;
            color: black;
            cursor: pointer;
            transition: background-color 0.3s;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">导出为CSV</button>
        </div>
      </div>
      <div>
        ${abstractResults.map((result, index) => `
          <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px;">
            <h3 style="margin-top: 0;">${index + 1}. ${result.title}</h3>
            ${result.error ?
              `<p style="color: red;">获取摘要失败: ${result.error}</p>` :
              `<div>
                ${result.journal ? `<p><strong>期刊:</strong> ${result.journal}</p>` : ''}
                ${result.year ? `<p><strong>发表年份:</strong> ${result.year}</p>` : ''}
                ${result.authors ? `<p><strong>作者:</strong> ${result.authors}</p>` : ''}
                ${result.doi ? `<p><strong>DOI:</strong> ${result.doi}</p>` : ''}
                ${result.pmid ? `<p><strong>PMID:</strong> ${result.pmid}</p>` : ''}
                <p><strong>摘要:</strong></p>
                <p>${result.abstract || '未找到摘要'}</p>
              </div>`
            }
          </div>
        `).join('')}
      </div>
    `;

    abstractsWindow.innerHTML = content;
    document.body.appendChild(overlay);
    document.body.appendChild(abstractsWindow);

    // 添加按钮悬停效果
    const addHoverEffect = (buttonId) => {
      const btn = document.getElementById(buttonId);
      if (btn) {
        btn.onmouseover = function() {
          this.style.backgroundColor = '#e1ceff';
        };
        btn.onmouseout = function() {
          this.style.backgroundColor = '#d3baf8';
        };
      }
    };

    // 为所有按钮添加悬停效果
    addHoverEffect('close-abstracts');
    addHoverEffect('copy-all-abstracts');
    addHoverEffect('export-txt');
    addHoverEffect('export-json');
    addHoverEffect('export-csv');

    // 为重试按钮添加悬停效果（仅当可用时）
    if (failed > 0) {
      addHoverEffect('retry-failed');
    }

    // 关闭按钮事件
    document.getElementById('close-abstracts').onclick = function() {
      overlay.remove();
      abstractsWindow.remove();
    };

    // 复制所有摘要按钮事件
    document.getElementById('copy-all-abstracts').onclick = function() {
      const abstractsText = abstractResults.map((result, index) => {
        return `${index + 1}. ${result.title}\n` +
               `${result.journal ? `期刊: ${result.journal}\n` : ''}` +
               `${result.year ? `发表年份: ${result.year}\n` : ''}` +
               `${result.authors ? `作者: ${result.authors}\n` : ''}` +
               `${result.doi ? `DOI: ${result.doi}\n` : ''}` +
               `${result.pmid ? `PMID: ${result.pmid}\n` : ''}` +
               `摘要:\n${result.abstract || '未找到摘要'}\n\n`;
      }).join('---\n\n');

      navigator.clipboard.writeText(abstractsText).then(() => {
        alert('所有摘要已复制到剪贴板');
      }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
      });
    };

    // 导出为TXT按钮事件
    document.getElementById('export-txt').onclick = function() {
      const abstractsText = abstractResults.map((result, index) => {
        return `${index + 1}. ${result.title}\n` +
               `${result.journal ? `期刊: ${result.journal}\n` : ''}` +
               `${result.year ? `发表年份: ${result.year}\n` : ''}` +
               `${result.authors ? `作者: ${result.authors}\n` : ''}` +
               `${result.doi ? `DOI: ${result.doi}\n` : ''}` +
               `${result.pmid ? `PMID: ${result.pmid}\n` : ''}` +
               `摘要:\n${result.abstract || '未找到摘要'}\n\n`;
      }).join('---\n\n');

      // 创建TXT文件并下载
      downloadFile(abstractsText, 'paper_abstracts.txt', 'text/plain');
    };

    // 导出为JSON按钮事件
    document.getElementById('export-json').onclick = function() {
      const jsonData = abstractResults.map(result => {
        // 创建干净的JSON对象，去除错误信息和状态信息
        return {
          title: result.title,
          journal: result.journal || null,
          year: result.year || null,
          authors: result.authors || null,
          doi: result.doi || null,
          pmid: result.pmid || null,
          abstract: result.abstract || null
        };
      });

      // 创建JSON文件并下载
      const jsonString = JSON.stringify(jsonData, null, 2); // 美化格式化
      downloadFile(jsonString, 'paper_abstracts.json', 'application/json');
    };

    // 导出为CSV按钮事件
    document.getElementById('export-csv').onclick = function() {
      // CSV头
      let csvContent = '\uFEFF"Title","Journal","Year","Authors","DOI","PMID","Abstract"\n';

      // 添加每一行数据
      abstractResults.forEach(result => {
        // 处理CSV字段，确保引号和逗号正确处理
        const escapeCsvField = (field) => {
          if (field === null || field === undefined) return '';
          // 将字段中的双引号替换为两个双引号，并用双引号包裹整个字段
          return `"${String(field).replace(/"/g, '""')}"`;
        };

        const row = [
          escapeCsvField(result.title),
          escapeCsvField(result.journal),
          escapeCsvField(result.year),
          escapeCsvField(result.authors),
          escapeCsvField(result.doi),
          escapeCsvField(result.pmid),
          escapeCsvField(result.abstract)
        ].join(',');

        csvContent += row + '\n';
      });

      // 创建CSV文件并下载
      downloadFile(csvContent, 'paper_abstracts.csv', 'text/csv;charset=utf-8');
    };

    // 通用的文件下载函数
    function downloadFile(content, fileName, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 显示下载成功的横幅提示
      showToast(`文件 ${fileName} 已成功下载！`);
    }

    // 重试失败项按钮事件
    if (failed > 0) {
      document.getElementById('retry-failed').onclick = async function() {
        const failedItems = abstractResults.filter(r => r.status === 'error');
        const failedTitles = failedItems.map(item => item.title);

        // 移除当前窗口
        overlay.remove();
        abstractsWindow.remove();

        // 重新获取失败项的摘要
        const loadingOverlay = showLoadingOverlay(`正在重试获取 ${failedTitles.length} 篇失败的论文摘要...`);
        try {
          const newResults = await getBatchAbstracts(failedTitles);

          // 更新原结果中的失败项
          newResults.forEach(newResult => {
            const index = abstractResults.findIndex(r => r.title === newResult.title);
            if (index !== -1) {
              abstractResults[index] = newResult;
            }
          });

          // 重新显示结果
          displayAbstracts(abstractResults);
        } catch (error) {
          console.error('重试获取摘要时出错:', error);
          alert(`重试失败: ${error.message}`);
        } finally {
          loadingOverlay.remove();
        }
      };
    }

    // 点击遮罩层关闭窗口
    overlay.onclick = function() {
      overlay.remove();
      abstractsWindow.remove();
    };
  }

  // 新增批量生成RIS文件的函数
  function generateBatchRISFile(citationsArray) {
    if (!citationsArray || citationsArray.length === 0) {
      throw new Error('没有可用的引用数据');
    }

    let risContent = '';

    citationsArray.forEach((data, index) => {
      // 确保每条记录都以 TY 开始
      const risFields = [
        ['TY', 'JOUR'],
        ...data.Authors.split('; ').map(author => ['AU', author.trim()]),
        ['TI', data.Title],
        ['JO', data.Journal],
        ['PY', data.Year],
        ['VL', data.Volume],
        ['IS', data.Issue],
        ['SP', data.Pages],
        ['DO', data.DOI],
        ['ER', '']  // 每条记录以 ER 结束
      ];

      // 添加当前记录
      risContent += risFields
        .filter(([_, value]) => value)
        .map(([tag, value]) => `${tag}  - ${value}`)
        .join('\n');

      // 确保每条记录都以 ER 结束
      if (!risContent.endsWith('ER  - \n')) {
        risContent += '\nER  - \n';
      }

      // 在每条记录之间添加空行
      if (index < citationsArray.length - 1) {
        risContent += '\n';
      }
    });

    const blob = new Blob([risContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citations_batch_${new Date().getTime()}.ris`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}


// 关闭结果窗口函数
function closeResultsWindow() {
  const resultsDiv = document.getElementById('extracted-titles');
  if (resultsDiv) {
    resultsDiv.remove();
  }
  console.log('结果窗口已关闭');
}

// 开始提取
function startExtraction() {
  if (isExtracting) return;
  isExtracting = true;

  // 添加进度条并初始化
  addProgressBar();
  updateProgressBar(1, maxPages, 0);

  chrome.storage.local.set({currentPage: 1, allPapers: [], isExtracting: true}, () => {
    extractAndNavigate();
  });
}

// 提取并导航到下一页
function extractAndNavigate() {
  chrome.storage.local.get(['currentPage', 'allPapers'], async (data) => {
    let { currentPage, allPapers } = data;

    console.log(`开提取第 ${currentPage} 页`);

    const newPapers = extractTitlesAndJournals();

    // 如果当前页面没有提取到任何论文，停止提取
    if (newPapers.length === 0) {
      console.log('当前页面未提取到任何论文，停止提取。');
      finalizeExtraction(allPapers);
      return;
    }

    // 检查是否有新论文
    const existingElids = new Set(allPapers.map(paper => paper.elid));
    const uniqueNewPapers = newPapers.filter(paper => !existingElids.has(paper.elid));

    if (uniqueNewPapers.length === 0) {
      console.log('当前页面没有新论文，停止提取。');
      finalizeExtraction(allPapers);
      return;
    }

    // 合并新论文
    allPapers = allPapers.concat(uniqueNewPapers);
    console.log(`提取到 ${uniqueNewPapers.length} 篇新论文，总计 ${allPapers.length} 篇论文。`);

    // 更新进度条
    updateProgressBar(currentPage, maxPages, allPapers.length);

    chrome.storage.local.set({ currentPage, allPapers, isExtracting: true }, () => {
      displayTitlesWithJournals(allPapers);

      if (currentPage < maxPages && nextPage()) {
        currentPage++;
        chrome.storage.local.set({ currentPage }, () => {
          console.log(`提取第 ${currentPage - 1} 页完成，准备提取第 ${currentPage} 页。`);
          setTimeout(extractAndNavigate, 1000);
        });
      } else {
        console.log(`达到最大页数限制 (${maxPages} 页) 或没有更多页面可提。`);
        finalizeExtraction(allPapers);
      }
    });
  });
}

// 完成提取
function finalizeExtraction(allPapers) {
  console.log('开始处理提取到论文信息。');
  // 更新进度条显示为处理中
  const progressText = document.getElementById('progress-text');
  if (progressText) {
    progressText.textContent = '正在处理...';
  }

  fetchJournalInfo(allPapers).then(processedPapers => {
    displayTitlesWithJournals(processedPapers);
    isExtracting = false;
    chrome.storage.local.set({ isExtracting: false }, () => {
      console.log('提取完成，设置 isExtracting 为 false');
      // 隐藏进度条
      setTimeout(hideProgressBar, 2000);
    });
  });
}

// 定位并点击"下一页"或"Next"按钮
function nextPage() {
  // 使用包含"下一页"或"Next"文本的链接进行定位
  const nextButton = Array.from(document.querySelectorAll('a')).find(a =>
    a.textContent.trim() === '下一页' ||
    a.textContent.trim().toLowerCase() === 'next'
  );

  if (nextButton && !nextButton.classList.contains('gs_btn_disabled')) {
    console.log('找到"下一页"或"Next"按钮，准备点击。');
    nextButton.click();
    return true;
  } else {
    console.log('未找到"下一页"或"Next"按钮，或按钮已禁用。');
    return false;
  }
}

// 添加提取按钮
function addExtractButton() {
  let button = document.getElementById('extract-button');
  if (!button) {
    button = document.createElement('div');
    button.id = 'extract-button';
    button.style.cssText = `
      background-color: #d3baf8; // 浅紫色
      color: white;
      font-weight: bold;
      border: none;
      padding: 5px 15px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      position: fixed;
      left: 20px;
      bottom: 33%;
      z-index: 1000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: opacity 0.3s; // 改为透明度过渡效果
    `;

    // 修改鼠标悬停效果
    button.onmouseover = function() {
      this.style.opacity = '0.8'; // 鼠标悬停时稍微变淡
    };
    button.onmouseout = function() {
      this.style.opacity = '1'; // 鼠标移开时恢复原样
    };

    // 创建图标元素
    const icon = new Image();
    icon.src = chrome.runtime.getURL('icons/icon128.png');
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      margin-right: 8px;
    `;

    // 添加加载错误处理
    icon.onerror = function() {
      console.error('图标加载失败:', this.src);
      this.style.display = 'none';
    };

    // 创建文字元素
    const text = document.createElement('span');
    text.textContent = '提取论文信息';

    // 将图标和文字添加到按钮中
    button.appendChild(icon);
    button.appendChild(text);

    button.addEventListener('click', startExtraction);

    // 将按钮插入到搜索框的左侧靠下位置
    const searchForm = document.querySelector('form[role="search"]');
    if (searchForm) {
      searchForm.style.position = 'relative';
      searchForm.appendChild(button);
    } else {
      // 如果找不到搜索表单，则默认添加到面左下方
      document.body.appendChild(button);
    }
  }
}


// 显示匹配状态
function showMatchingStatus(status, isMatching) {
  let statusDiv = document.getElementById('matching-status');
  if (!statusDiv) {
    const resultsDiv = document.getElementById('extracted-titles');
    if (resultsDiv) {
      statusDiv = document.createElement('div');
      statusDiv.id = 'matching-status';
      statusDiv.style.cssText = 'margin-top: 10px; font-weight: bold;';
      resultsDiv.appendChild(statusDiv);
    }
  }
  statusDiv.textContent = status;
  if (isMatching) {
    statusDiv.style.color = 'blue';
    statusDiv.style.fontWeight = 'bold';
  } else {
    statusDiv.style.color = 'black';
    statusDiv.style.fontWeight = 'bold';
  }
}

// 添加设置按钮
function addSettingsButton() {
  let button = document.createElement('div');
  button.id = 'settings-button';
  button.style.cssText = `
    background-color: #d3baf8;
    color: black;
    font-weight: bold;
    border: none;
    padding: 5px 15px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    position: fixed;
    left: 20px;
    bottom: 25%;
    z-index: 1000;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    transition: opacity 0.3s;
  `;

  button.onmouseover = function() {
    this.style.opacity = '0.8';
  };
  button.onmouseout = function() {
    this.style.opacity = '1';
  };

  const icon = document.createElement('span');
  icon.textContent = '⚙️';
  icon.style.marginRight = '8px';

  const text = document.createElement('span');
  text.textContent = '设置';

  button.appendChild(icon);
  button.appendChild(text);

  button.addEventListener('click', showSettingsDialog);
  document.body.appendChild(button);
}

// 创建设置对话框
function showSettingsDialog() {
  // 检查是否已存在设置对话框
  if (document.getElementById('settings-dialog')) {
    return;
  }

  const dialog = document.createElement('div');
  dialog.id = 'settings-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    z-index: 1001;
    min-width: 300px;
  `;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
  `;

  // 获取当前设置
  chrome.storage.sync.get({
    maxPages: 10, // 默认值
    defaultSortMethod: 'alphabet-asc' // 默认排序方式
  }, function(items) {
    dialog.innerHTML = `
      <h2 style="margin-top: 0; color: #333;">设置</h2>
      <div style="margin: 20px 0;">
        <label style="display: block; margin-bottom: 5px;">
          提取论文页数:
          <input type="number" id="max-pages-input" value="${items.maxPages}"
                 min="1" max="50" style="width: 60px; margin-left: 10px;">
        </label>
        <small style="color: #666;">建议值: 1-50 页</small>
      </div>
      <div style="margin: 20px 0;">
        <label style="display: block; margin-bottom: 5px;">
          默认排序方式:
          <select id="default-sort-method" style="margin-left: 10px; padding: 3px; width: 150px;">
            <option value="alphabet-asc" ${items.defaultSortMethod === 'alphabet-asc' ? 'selected' : ''}>A-Z</option>
            <option value="alphabet-desc" ${items.defaultSortMethod === 'alphabet-desc' ? 'selected' : ''}>Z-A</option>
            <option value="count-desc" ${items.defaultSortMethod === 'count-desc' ? 'selected' : ''}>数量降序</option>
            <option value="count-asc" ${items.defaultSortMethod === 'count-asc' ? 'selected' : ''}>数量升序</option>
            <option value="if-desc" ${items.defaultSortMethod === 'if-desc' ? 'selected' : ''}>IF降序</option>
            <option value="if-asc" ${items.defaultSortMethod === 'if-asc' ? 'selected' : ''}>IF升序</option>
          </select>
        </label>
        <small style="color: #666;">提取结果中期刊的默认排列顺序</small>
      </div>
      <div style="text-align: right; margin-top: 20px;">
        <button id="cancel-settings" style="
          margin-right: 10px;
          padding: 5px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          transition: background-color 0.3s;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        ">取消</button>
        <button id="save-settings" style="
          padding: 5px 12px;
          border: none;
          border-radius: 4px;
          background: #d3baf8;
          color: black;
          cursor: pointer;
          transition: background-color 0.3s;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        ">保存</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // 添加按钮悬停效果
    const saveButton = document.getElementById('save-settings');
    saveButton.onmouseover = function() {
      this.style.backgroundColor = '#e1ceff';
    };
    saveButton.onmouseout = function() {
      this.style.backgroundColor = '#d3baf8';
    };

    const cancelButton = document.getElementById('cancel-settings');
    cancelButton.onmouseover = function() {
      this.style.backgroundColor = '#f0f0f0';
    };
    cancelButton.onmouseout = function() {
      this.style.backgroundColor = 'white';
    };

    // 添加事件监听器
    document.getElementById('cancel-settings').onclick = function() {
      overlay.remove();
      dialog.remove();
    };

    document.getElementById('save-settings').onclick = function() {
      const newMaxPages = parseInt(document.getElementById('max-pages-input').value);
      const newDefaultSortMethod = document.getElementById('default-sort-method').value;
      if (newMaxPages >= 1 && newMaxPages <= 50) {
        chrome.storage.sync.set({
          maxPages: newMaxPages,
          defaultSortMethod: newDefaultSortMethod
        }, function() {
          maxPages = newMaxPages; // 更新当前页面的变量
          overlay.remove();
          dialog.remove();
          // 显示保存成功提示
          showToast('设置已保存');
        });
      } else {
        alert('请输入1-50之间的页数');
      }
    };

    // 点击遮罩层关闭对话框
    overlay.onclick = function() {
      overlay.remove();
      dialog.remove();
    };
  });
}

// 添加提示消息功能
function showToast(message, isWarning = false) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 1002;
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  const icon = document.createElement('span');
  icon.style.fontSize = '20px';
  icon.textContent = isWarning ? '⚠️' : '✅';

  const messageText = document.createElement('span');
  messageText.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(messageText);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// 修改初始化函数，添加设置的加载
async function initialize() {
  // 加载设置
  chrome.storage.sync.get({
    maxPages: 10, // 默认值
    defaultSortMethod: 'alphabet-asc' // 默认排序方式
  }, function(items) {
    maxPages = items.maxPages;
  });

  await loadCSVData();
  chrome.storage.local.get(['isExtracting', 'currentPage', 'allPapers'], (data) => {
    isExtracting = data.isExtracting || false;
    addExtractButton();
    addSettingsButton(); // 添加设置按钮
    addProgressBar(); // 添加进度条

    // 添加按钮悬停效果
    const addHoverEffect = (id) => {
      const button = document.getElementById(id);
      if (button) {
        button.onmouseover = function() {
          this.style.backgroundColor = '#e1ceff';
        };
        button.onmouseout = function() {
          this.style.backgroundColor = '#d3baf8';
        };
      }
    };

    // 对四个按钮添加相同的悬停效果
    setTimeout(() => {
      addHoverEffect('get-abstracts');
      addHoverEffect('cite-selected');
      addHoverEffect('clear-filters');
      addHoverEffect('close-window');
    }, 1000);

    if (isExtracting) {
      console.log('检测到正在进行的提取，继续提取。');
      // 如果正在提取，显示进度条
      if (data.currentPage && data.allPapers) {
        updateProgressBar(data.currentPage, maxPages, data.allPapers.length);
      }
      setTimeout(extractAndNavigate, 2000);
    } else {
      // 如果没有正在提取，隐藏进度条
      hideProgressBar();
    }
  });
}

initialize();


// 监听页面变化
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    console.log('检测到页面URL变化，可能导航到新页面。');
    lastUrl = url;
    chrome.storage.local.get(['isExtracting'], (data) => {
      if (data.isExtracting) {
        console.log('提取正在进行中，继续提取。');
        setTimeout(extractAndNavigate, 2000);
      }
    });
  }
}).observe(document, {subtree: true, childList: true});

// 清除所有筛选器的函数
function clearAllFilters() {
  // 重置期刊筛选
  const journalFilter = document.getElementById('journal-filter');
  const journalCheckboxes = journalFilter.querySelectorAll('input[type="checkbox"]');
  journalCheckboxes.forEach(cb => {
    cb.checked = cb.value === 'all';
  });

  // 重置JCR分区筛选
  const jcrFilters = document.querySelectorAll('input[name="jcr-filter"]');
  jcrFilters.forEach(filter => filter.checked = false);

  // 重置中科院分区筛选
  const casFilters = document.querySelectorAll('input[name="cas-filter"]');
  casFilters.forEach(filter => filter.checked = false);

  // 重置TOP期刊筛选
  document.getElementById('top-filter').checked = false;

  // 重置IF范围
  document.getElementById('if-min').value = '';

  // 重新应用选
  filterJournals();
}

// 添加新函数来创建引用按钮
function addCitationButton(paperElement, title) {
  const citationButton = document.createElement('button');
  citationButton.textContent = '引用';
  citationButton.style.cssText = `
    background-color: #d3baf8;
    color: black;
    border: none;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    transition: background-color 0.3s;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  `;

  citationButton.onmouseover = function() {
    this.style.backgroundColor = '#e1ceff';
  };
  citationButton.onmouseout = function() {
    this.style.backgroundColor = '#d3baf8';
  };

  citationButton.onclick = function() {
    handleCitation(title);
  };

  paperElement.style.position = 'relative';
  paperElement.appendChild(citationButton);
}

// 修改 getPubMedData 函数
async function getPubMedData(title) {
  try {
    console.log('开始 PubMed 搜索，原始标题:', title);

    // 1. 使用更简短的标题进行搜索
    const shortTitle = title
      .split(/[\(\):]/)[0]  // 取第一个括号或冒号前的内容
      .split('and')[0]      // 取第一个 and 前的内容
      .trim()
      .substring(0, 100);   // 限制长度

    console.log('简化后的标题:', shortTitle);

    // 2. 搜索文章
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(shortTitle)}&retmode=json`;
    console.log('PubMed 搜索 URL:', searchUrl);

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`PubMed 搜索请求失败: ${searchResponse.status}`);
    }
    const searchData = await searchResponse.json();
    console.log('PubMed 搜索结果:', searchData);

    if (!searchData.esearchresult.idlist || searchData.esearchresult.idlist.length === 0) {
      console.log('PubMed 未找到匹配文章');
      return null;
    }

    // 3. 获取详细信息
    const pmid = searchData.esearchresult.idlist[0];
    console.log('找到 PMID:', pmid);

    const detailUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    console.log('PubMed 详情 URL:', detailUrl);

    const detailResponse = await fetch(detailUrl);
    if (!detailResponse.ok) {
      throw new Error(`PubMed 详情请求失败: ${detailResponse.status}`);
    }
    const detailData = await detailResponse.json();
    console.log('PubMed 详细数据:', detailData);

    const article = detailData.result[pmid];
    if (!article) {
      console.log('未找到文章详细信息');
      return null;
    }

    // 4. 提取所需数据
    const extractedData = {
      Title: article.title || '',
      Authors: article.authors ? article.authors.map(a => a.name).join('; ') : '',
      Year: article.pubdate ? article.pubdate.substring(0, 4) : '',
      Journal: (article.fulljournalname || article.source || '').toUpperCase(),
      Volume: article.volume || '',
      Issue: article.issue || '',
      Pages: article.pages || '',
      DOI: article.elocationid ? article.elocationid.replace('doi: ', '') : '',
      PMID: pmid,
      Abstract: article.abstracttext || ''
    };

    console.log('从 PubMed 提取的数据:', extractedData);

    // 5. 验证数据完整性
    const requiredFields = ['Title', 'Authors', 'Journal'];
    const missingFields = requiredFields.filter(field => !extractedData[field]);

    if (missingFields.length > 0) {
      console.log('缺少必要字段:', missingFields);
      return null;
    }

    return extractedData;

  } catch (error) {
    console.error('从 PubMed 获取数据时出错:', error);
    console.error('错误堆栈:', error.stack);
    return null;
  }
}

// 修改 getCitationInfo 函数
async function handleCitation(title) {
  const loadingOverlay = showLoadingOverlay('正在获取引用信息...');
  try {
    // 并行请求 Crossref 和 PubMed
    const [crossrefResult, pubmedResult] = await Promise.allSettled([
      getCrossrefData(title),
      getPubMedData(title)
    ]);

    let citationData = {};

    // 处理 Crossref 数据
    if (crossrefResult.status === 'fulfilled' && crossrefResult.value) {
      citationData = { ...crossrefResult.value };
    }

    // 处理 PubMed 数据，并补充到 citationData
    if (pubmedResult.status === 'fulfilled' && pubmedResult.value) {
      const pubmedData = pubmedResult.value;
      // 对于每个字段优先使用 Crossref 的数据，如果缺失则使用 PubMed 的数据
      citationData.Title = citationData.Title || pubmedData.Title;
      citationData.Authors = citationData.Authors || pubmedData.Authors;
      citationData.Year = citationData.Year || pubmedData.Year;
      citationData.Journal = (citationData.Journal || pubmedData.Journal)?.toUpperCase();
      citationData.Volume = citationData.Volume || pubmedData.Volume;
      citationData.Issue = citationData.Issue || pubmedData.Issue;
      citationData.Pages = citationData.Pages || pubmedData.Pages;
      citationData.DOI = citationData.DOI || pubmedData.DOI;
      citationData.Abstract = citationData.Abstract || pubmedData.Abstract;
      citationData.Citations = citationData.Citations || pubmedData.Citations;

      // 显示摘要和其他信息
      console.log('获取到的摘要信息:', citationData.Abstract);
      console.log('获取到的期刊信息:', citationData.Journal);
      console.log('获取到的发表年份:', citationData.Year);
      console.log('获取到的作者信息:', citationData.Authors);
    }

    // 检查是否有足够的数据生成 RIS 文件
    if (!citationData.Title) {
      throw new Error('无法找到文献引用信息');
    }

    // 生成并下载 RIS 文件
    generateRISFile(citationData);

  } catch (error) {
    console.error('获取引用信息时出错:', error);
    alert(`获取引用信息失败: ${error.message}`);
  } finally {
    loadingOverlay.remove();
  }
}

async function getCrossrefData(title) {
  try {
    const encodedTitle = encodeURIComponent(title.trim());
    const url = `https://api.crossref.org/works?query.title=${encodedTitle}&filter=type:journal-article&rows=1`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Crossref API 响应失败: ${response.status}`);
    }

    const data = await response.json();
    const items = data.message?.items;

    if (!items || items.length === 0) {
      return null;
    }

    const article = items[0];
    const authors = article.author?.map(a => {
      const family = a.family || '';
      const given = a.given || '';
      return `${family}${family && given ? ', ' : ''}${given}`;
    }).join('; ') || '';

    return {
      Title: article.title?.[0] || '',
      Authors: authors,
      Year: article['published-print']?.['date-parts']?.[0]?.[0] ||
            article['published-online']?.['date-parts']?.[0]?.[0] || '',
      Journal: (article['container-title']?.[0]?.replace(/&amp;/g, '&') || '').toUpperCase(),
      Volume: article.volume || '',
      Issue: article.issue || '',
      Pages: article.page || '',
      DOI: article.DOI || ''
    };
  } catch (error) {
    console.error('从 Crossref 获取数据时出错:', error);
    return null;
  }
}

function generateRISFile(data) {
  if (!data) {
    throw new Error('没有可用的引用数据');
  }

  const risFields = [
    ['TY', 'JOUR'],
    ...data.Authors.split('; ').map(author => ['AU', author.trim()]),
    ['TI', data.Title],
    ['JO', data.Journal],
    ['PY', data.Year],
    ['VL', data.Volume],
    ['IS', data.Issue],
    ['SP', data.Pages],
    ['DO', data.DOI],
    ['ER', '']
  ];

  const risContent = risFields
    .filter(([_, value]) => value) // 过滤掉空值
    .map(([tag, value]) => `${tag}  - ${value}`)
    .join('\n');

  const blob = new Blob([risContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `citation_${data.Title.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.ris`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 新增加载提示函数
function showLoadingOverlay(message) {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div>${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// 添加全选功能的事件监听器
document.getElementById('select-all-papers').addEventListener('change', function() {
  const isChecked = this.checked;
  const visiblePapers = document.querySelectorAll('.paper-item:not([style*="display: none"]) .paper-checkbox');
  visiblePapers.forEach(checkbox => {
    checkbox.checked = isChecked;
  });
});

// 监听筛选变化，更新全选框状态
const updateSelectAllState = () => {
  const selectAllCheckbox = document.getElementById('select-all-papers');
  const visiblePapers = document.querySelectorAll('.paper-item:not([style*="display: none"]) .paper-checkbox');
  const checkedPapers = document.querySelectorAll('.paper-item:not([style*="display: none"]) .paper-checkbox:checked');

  if (visiblePapers.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedPapers.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (checkedPapers.length === visiblePapers.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
};

// 监听单个论文的选择变化
document.addEventListener('change', function(e) {
  if (e.target.classList.contains('paper-checkbox')) {
    updateSelectAllState();
  }
});

// 在筛选后更新全选状态
const originalFilterJournals = filterJournals;
filterJournals = function() {
  originalFilterJournals.apply(this, arguments);
  updateSelectAllState();
};

function addProgressBar() {
  let progressContainer = document.getElementById('extraction-progress-container');
  if (!progressContainer) {
    progressContainer = document.createElement('div');
    progressContainer.id = 'extraction-progress-container';
    progressContainer.style.cssText = `
      position: fixed;
      left: 20px;
      bottom: 17%;
      width: 180px;
      background-color: white;
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 999;
      display: none;
    `;

    progressContainer.innerHTML = `
      <div style="margin-bottom: 5px; font-size: 12px; display: flex; justify-content: space-between;">
        <span id="progress-text">提取中...</span>
        <span id="progress-percentage">0%</span>
      </div>
      <div style="width: 100%; background-color: #f0f0f0; border-radius: 4px; overflow: hidden;">
        <div id="progress-bar" style="height: 8px; width: 0%; background-color: #d3baf8; transition: width 0.3s;"></div>
      </div>
      <div style="margin-top: 5px; font-size: 12px; text-align: center;">
        <span id="progress-details">第 0/0 页，共 0 篇论文</span>
      </div>
    `;

    document.body.appendChild(progressContainer);
  }
  return progressContainer;
}

function updateProgressBar(currentPage, maxPages, paperCount) {
  const progressContainer = document.getElementById('extraction-progress-container');
  if (!progressContainer) return;

  const progressBar = document.getElementById('progress-bar');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressDetails = document.getElementById('progress-details');

  // 计算进度百分比
  const percentage = Math.min(Math.round((currentPage / maxPages) * 100), 100);

  // 更新进度条
  progressBar.style.width = `${percentage}%`;
  progressPercentage.textContent = `${percentage}%`;
  progressDetails.textContent = `第 ${currentPage}/${maxPages} 页，共 ${paperCount} 篇论文`;

  // 显示进度条容器
  progressContainer.style.display = 'block';
}

function hideProgressBar() {
  const progressContainer = document.getElementById('extraction-progress-container');
  if (progressContainer) {
    progressContainer.style.display = 'none';
  }
}

// 添加按钮悬停效果的样式
const buttonStyle = document.createElement('style');
buttonStyle.textContent = `
  #get-abstracts:hover,
  #cite-selected:hover,
  #clear-filters:hover,
  #close-window:hover {
    background-color: #e1ceff;
  }
`;
document.head.appendChild(buttonStyle);

// 修改按钮样式
const styleElement = document.createElement('style');
styleElement.textContent = `
  .action-button {
    opacity: 1;
    transition: all 0.3s ease;
  }
  .action-button:hover {
    background-color: #e1ceff !important;
    opacity: 0.8;
  }
`;
document.head.appendChild(styleElement);

// 为所有按钮添加事件监听器
document.querySelectorAll('.action-button').forEach(button => {
  button.onmouseover = function() {
    this.style.backgroundColor = '#e1ceff';
  };
  button.onmouseout = function() {
    this.style.backgroundColor = '#d3baf8';
  };
});
