# 纸间 Paperkit

中文在线 PDF 编辑工具 MVP。支持 PDF 预览、添加文字/图片/签名/标记、页面排序/旋转/删除/合并、PDF 拆分、图片转 PDF、PDF 转图片，以及浏览器自动保存。项目同时提供 Better Auth、PostgreSQL 和 S3/MinIO 的云端文档 API。

## 本地体验

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，直接导入 PDF 即可进入本地模式。文件和草稿存储在浏览器 IndexedDB，不会上传服务器。

### 合并 PDF

在首页选择“合并 PDF”，可一次导入多个文件。进入编辑器后拖动左侧缩略图调整页序，使用“合并更多 PDF”继续追加文件，最后点击“导出合并 PDF”。

### 拆分 PDF

在首页选择“拆分 PDF”。进入编辑器后可逐页勾选，或使用全选、奇数页、偶数页快速选择；“导出所选 PDF”会把选中页合成一个文件，“逐页 ZIP”会为每个选中页生成独立 PDF。

## 启用账号与云端存储

1. 复制 `.env.example` 为 `.env`，为 `BETTER_AUTH_SECRET` 设置随机密钥。
2. 启动 `docker compose up -d`。
3. 在 MinIO 控制台 `http://localhost:9001` 创建私有存储桶 `paperkit`，并允许应用来源的 PUT/GET CORS。
4. 执行 `npm run db:push`。
5. 首次创建内部账号时临时设置 `ALLOW_SIGN_UP=true`，运行：

```bash
npm run db:seed -- user@example.com your-password "内部用户"
```

删除 `ALLOW_SIGN_UP` 或改回 `false` 后启动应用，公开注册即关闭。

## 验证

```bash
npm run lint
npm test
npm run build
```

## 当前边界

- 单文件上限 20MB，单文档最多 100 页。
- 不支持加密 PDF、修改 PDF 原有文字、OCR、证书签名和 Office 转换。
- 中文新增文字在导出时转为高分辨率透明图层，以保证任意浏览器都不乱码；后续接入可分发的 Noto Sans SC 字体文件后，可替换为字体子集嵌入以保留文字选择能力。
- 页面已有数字签名、交互表单、书签和附件在重组或导出后不保证保持原状态。
