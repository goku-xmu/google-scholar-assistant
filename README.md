# 谷歌学术助手

<p align="center">
  <img src="icons/icon128.png" alt="谷歌学术助手图标" width="128" height="128">
</p>

<p align="center">
  <b>一个提取和搜索谷歌学术论文信息的浏览器扩展</b>
</p>

## 📖 简介

谷歌学术助手是一个功能强大的浏览器扩展，专为研究人员、学者和学生设计，帮助用户从 Google Scholar 高效提取和管理学术论文信息。

## ✨ 主要功能

- **论文信息提取**：从谷歌学术搜索结果中自动提取论文标题、期刊信息等
- **中科院分区识别**：自动识别并显示期刊的中科院分区信息
- **JCR分区查询**：支持查询期刊的JCR分区信息
- **期刊分类管理**：创建自定义期刊分类，管理您关注的期刊
- **导出/导入功能**：支持导出和导入期刊分类数据
- **摘要批量获取**：自动获取论文摘要信息
- **引用格式导出**：支持导出RIS格式的文献引用信息
- **高级过滤功能**：根据期刊名称、分区等条件过滤搜索结果

## 🛠️ 安装方法

### 手动安装
1. 下载此仓库的ZIP文件或克隆到本地
2. 解压文件（如果下载的是ZIP）
3. 打开浏览器的扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

## 🚀 使用指南

1. 安装扩展后，访问 [Google Scholar](https://scholar.google.com/)
2. 在搜索结果页面，您会看到扩展添加的功能按钮
3. 点击"提取论文信息"按钮开始提取当前页面的论文信息
4. 在弹出窗口中，您可以:
   - 查看论文的详细信息和分区
   - 过滤特定分区或期刊的论文
   - 导出所需的引用信息
   - 批量获取论文摘要

## 📋 期刊分类管理

1. 点击扩展图标打开弹出窗口
2. 使用"添加类别"按钮创建新的期刊分类
3. 添加您关注的期刊到相应分类
4. 使用导出功能备份您的期刊分类数据
5. 必要时使用导入功能恢复或共享您的分类设置

## 🧰 技术栈

- JavaScript
- HTML/CSS
- Chrome Extension API

## 📄 数据来源

扩展使用以下数据文件:
- `zkyfq.csv`: 中科院期刊分区数据
- `jcrfq.csv`: JCR期刊分区数据

## 🤝 贡献指南

欢迎对本项目做出贡献！您可以通过以下方式参与:

1. 提交Issue报告bug或建议新功能
2. 提交Pull Request改进代码
3. 完善文档
4. 在Linux.do社区参与讨论（我的id：@goku123）

## 📝 注意事项

更新扩展前请务必导出您的期刊分类数据，以防数据丢失。

## 📜 许可证

本项目采用 [MIT 许可证](LICENSE) 进行许可。

## 👨‍💻 作者

goku_xmu

---

<p align="center">
  <i>如果您觉得这个工具有用，请给它一个⭐️!</i>
</p> 
