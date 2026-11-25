import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';

const here = path.dirname(fileURLToPath(import.meta.url));

// Bundle unique dist/index.js : les dépendances sont embarquées, le plugin
// n'a besoin d'aucun accès réseau ni d'aucun serveur.
export default {
	target: 'web',
	entry: path.join(here, 'src/index.js'),
	output: {
		path: path.join(here, 'dist'),
		filename: 'index.js',
		clean: true,
		publicPath: '',
	},
	resolve: {
		// Les modules node: ne sont pas disponibles dans le plugin.
		fallback: { fs: false, path: false, crypto: false, zlib: false, stream: false, buffer: false },
	},
	// Un seul fichier : Joplin ne charge que index.js, pas de chunks séparés.
	plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
	performance: { hints: false },
};
