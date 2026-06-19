import { put, del, getDownloadUrl } from "@vercel/blob";

/**
 * Vercel Blob 对象存储封装。
 *
 * Store 为 private(私有)模式:原文二进制不可匿名访问,下载/预览需通过
 * getDownloadUrl() 生成签名 URL。Neon 中只存 blob_url。
 *
 * 分块/embedding/图谱构建所需的文本仍走 uploaded_files.content(上传时
 * 同步落库的 UTF-8 缓存),避免处理流水线每次都从远端 fetch。
 *
 * 文档:https://vercel.com/docs/vercel-blob/using-blob-sdk
 */

export interface UploadedBlob {
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string;
}

function assertToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "缺少 BLOB_READ_WRITE_TOKEN 环境变量,请在 Vercel 创建 Blob store 后通过 vercel env pull 获取"
    );
  }
}

/**
 * 上传原始文件字节到 Vercel Blob。
 *
 * @param knowledgeBaseId 知识库 ID,用于组织存储路径
 * @param filename        原始文件名
 * @param body            Buffer | string | File | ArrayBuffer | ReadableStream
 * @param contentType     MIME 类型
 */
export async function uploadKnowledgeFile(
  knowledgeBaseId: number,
  filename: string,
  body: Parameters<typeof put>[1],
  contentType: string
): Promise<UploadedBlob> {
  assertToken();

  // 用 KB + 文件名组织路径;addRandomSuffix 默认开启,避免覆盖。
  const pathname = `kb/${knowledgeBaseId}/${filename}`;

  const blob = await put(pathname, body, {
    access: "private",
    addRandomSuffix: true,
    contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365, // 一年,原文不变可长期缓存
  });

  return {
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    pathname: blob.pathname,
    contentType: blob.contentType,
  };
}

/**
 * 为 private blob 生成即时签名下载 URL。
 * 用于下载路由重定向、头像等需要直接访问 blob 内容的场景。
 * 签名 URL 由当前 token 即时生成,无需额外参数。
 */
export function getSignedDownloadUrl(blobUrl: string): string {
  return getDownloadUrl(blobUrl);
}

/**
 * 删除一个 Blob 对象。幂等:删不到(已不存在)也不报错。
 *
 * 注意:del() 接收的是 blob.url(或 pathname),不是 DB 主键。
 */
export async function deleteBlob(blobUrl: string | null | undefined): Promise<void> {
  if (!blobUrl) return;
  try {
    await del(blobUrl);
  } catch (error) {
    // 删除失败不应阻断 DB 记录的删除,仅记录日志。
    // 孤儿对象可后续通过 list() 清理。
    console.error(`[blob] 删除对象失败 url=${blobUrl}`, error);
  }
}

/**
 * 批量删除 Blob 对象。
 */
export async function deleteBlobs(blobUrls: (string | null | undefined)[]): Promise<void> {
  const urls = blobUrls.filter((u): u is string => Boolean(u));
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch (error) {
    console.error(`[blob] 批量删除对象失败 urls=${urls.join(",")}`, error);
  }
}
