import type { Plugin, ResolvedConfig } from 'vite';

type OutputAsset = { fileName: string; type: 'asset'; name?: string };
type OutputChunk = { fileName: string; type: 'chunk'; isEntry: boolean; name: string; code: string };

// Deployment consumers join manifest paths to build/. Keep these paths root-relative even though
// index.html uses Vite's /rinspace/ base for browser requests.
const manifestPath = (fileName: string) => `/${fileName}`;

export function craCompatManifest(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'rinspace-cra-compatible-asset-manifest',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_, bundle) {
      const outputs = Object.values(bundle) as Array<OutputAsset | OutputChunk>;
      const entry = outputs.find(
        (output): output is OutputChunk => output.type === 'chunk' && output.isEntry && output.name === 'index',
      );
      if (!entry) throw new Error('Vite did not emit a Rinspace entry chunk.');

      const css = outputs.find(
        (output): output is OutputAsset =>
          output.type === 'asset' && output.fileName.endsWith('.css'),
      );
      const files: Record<string, string> = {
        'main.js': manifestPath(entry.fileName),
      };
      if (css) files['main.css'] = manifestPath(css.fileName);
      for (const output of outputs) {
        // Vite removes CSS-only facade chunks after generateBundle. They are present in the
        // Rollup bundle with empty code, but never written; excluding them keeps the deployment
        // manifest an exact inventory of immutable files on disk.
        if (output.type === 'chunk' && (!output.code.trim() || output.name === 'lab/foundations')) continue;
        files[output.fileName] = manifestPath(output.fileName);
      }
      const entrypoints = [files['main.js'], ...(css ? [files['main.css']] : [])];
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: `${JSON.stringify({ files, entrypoints }, null, 2)}\n`,
      });
    },
  };
}
