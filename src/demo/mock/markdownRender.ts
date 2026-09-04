import { markdownBlogSource, markdownToHtml } from '@/utils/blogBody';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function demoStoredMarkdownBody(
  body: string,
  title: string,
  identity: string,
): Promise<string> {
  if (body.includes('[[RIN_MARKDOWN_RENDER]]')) return body;
  const markedSource = markdownBlogSource(body);
  const source = markedSource || body.trim();
  if (!source) return body;
  const sourceBody = markedSource
    ? body
    : ['[[RIN_MARKDOWN_SOURCE]]', body, '[[/RIN_MARKDOWN_SOURCE]]'].join('\n');
  const identityHash = /^[a-f0-9]{64}$/.test(identity) ? identity : await sha256(identity);
  const sourceHash = await sha256(source);
  const html = markdownToHtml(source, { deferMath: true });
  const projectHash = await sha256(`demo-markdown-project:${sourceHash}`);
  const resultHash = await sha256(`demo-markdown-result:${html}`);
  const versions = {
    rinRenderer: 'demo-browser-v1',
    markdownAdapter: 'demo-browser-v1',
    markdownPipeline: 'demo-browser-v1',
    markdownSanitizer: 'demo-browser-v1',
    shiki: 'demo-browser-v1',
    mathJax: 'demo-browser-v1',
    mathJaxFont: 'demo-browser-v1',
    diagramEngine: 'demo-browser-v1',
  };
  const jobId = `${identityHash.slice(0, 8)}-${identityHash.slice(8, 12)}-${identityHash.slice(12, 16)}-${identityHash.slice(16, 20)}-${identityHash.slice(20, 32)}`;
  const stored = {
    schemaVersion: 'rin-markdown-article-render/v1',
    sourceSha256: sourceHash,
    entrypoint: 'content.md',
    result: {
      schemaVersion: 'rin-render-result/v1',
      jobId,
      requestId: `demo:${identityHash.slice(0, 32)}`,
      projectHash,
      resultHash,
      contentKind: 'markdown',
      engine: 'rin-markdown',
      inline: {
        schemaVersion: 'rin-document-bundle/v1',
        projectHash,
        bundleHash: resultHash,
        state: 'final',
        contentKind: 'markdown',
        documentEngine: 'rin-markdown',
        title,
        pages: [{
          id: 'demo-page-1',
          sourcePath: 'content.md',
          fragment: html,
          fragmentFormat: 'html',
          toc: [],
          dependencyHashes: [sourceHash],
        }],
        workUnits: [],
        assets: [],
        diagnostics: [],
        provenance: {
          adapter: 'rin-markdown',
          adapterVersion: versions.markdownAdapter,
          engineVersion: versions.markdownPipeline,
          projectGraphSchemaVersion: 'rin-project-graph/v1',
        },
      },
      assets: [],
      diagnostics: [],
      versions,
      cache: { hit: false, reusedStages: [] },
    },
  };
  return [
    sourceBody,
    '[[RIN_MARKDOWN_RENDER]]',
    base64UrlUtf8(JSON.stringify(stored)),
    '[[/RIN_MARKDOWN_RENDER]]',
  ].join('\n');
}
