# 贡献指南

感谢你对本项目的关注与贡献。

## 贡献方式

你可以通过以下方式参与：

- 提交 Bug 报告
- 提交新功能建议
- 修复代码问题
- 改进文档说明
- 优化 Excel 导入、赛制规则或 UI 体验

## 开发流程

1. Fork 本仓库或在本仓库中创建新分支
2. 基于 `main` 创建功能分支，例如：`feature/excel-import-improve`
3. 完成修改并补充必要测试
4. 执行本地验证：
   - `npm run check`
   - `npm run test:coverage`
   - `npm run visual:check`
   - `npm run build`
5. 提交 PR，并在描述中说明改动背景、影响范围和验证结果

## 代码规范

- 优先保持现有 TypeScript / React 结构一致
- 新增功能尽量保持可测试性
- 重要逻辑应补充对应测试用例
- 对用户可见的文本改动应同步更新 README、HelpPage 或 CHANGELOG

## 问题提交建议

提交 Issue 时尽量包含：

- 问题概述
- 复现步骤
- 期望效果
- 实际表现
- 相关截图或示例文件

## 许可证

本项目采用 MIT License，贡献代码即表示你接受该协议条款。
