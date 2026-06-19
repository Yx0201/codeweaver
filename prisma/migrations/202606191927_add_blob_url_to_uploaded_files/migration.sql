-- AlterTable
-- 新增 blob_url:Vercel Blob 中文件原文(二进制)的访问 URL。
-- content(UTF-8 文本,分块/预览用)继续保留在 Neon。
-- file_data(bytea)在存量数据迁移到 Blob 后由后续 migration 移除。
ALTER TABLE "uploaded_files" ADD COLUMN "blob_url" VARCHAR(1000);
